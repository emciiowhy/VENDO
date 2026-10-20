import { query } from "../db.js";
import {
  buildAttendanceDays,
  summarizeAttendance,
  type AttendanceDay,
  type AttendanceSummary,
  type ManualEntry,
  type Punch,
  type Schedule,
} from "./attendance.js";

/**
 * Data access for attendance. Every query is scoped by `tenantId` from the
 * verified session. Timecards are keyed by the employee's linked till login
 * (`employees.user_id`); an employee with no till access has no punches, so
 * their days come only from manual entries.
 */

const MNL = "Asia/Manila";

function toIsoDate(d: Date): string {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

export interface EmployeeSchedule extends Schedule {
  employeeId: string;
  userId: string | null;
  hireDate: string | null;
  separatedOn: string | null;
}

export async function getEmployeeSchedule(tenantId: string, employeeId: string): Promise<EmployeeSchedule | null> {
  const { rows } = await query<{
    id: string;
    user_id: string | null;
    hire_date: Date | null;
    separated_on: Date | null;
    work_days: number[];
    standard_daily_hours: string;
    unpaid_break_minutes: number;
  }>(
    `SELECT id, user_id, hire_date, separated_on, work_days, standard_daily_hours, unpaid_break_minutes
       FROM employees WHERE id = $1 AND tenant_id = $2`,
    [employeeId, tenantId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    employeeId: r.id,
    userId: r.user_id,
    hireDate: r.hire_date ? toIsoDate(r.hire_date) : null,
    separatedOn: r.separated_on ? toIsoDate(r.separated_on) : null,
    workDays: (r.work_days ?? []).map(Number),
    standardDailyHours: Number(r.standard_daily_hours),
    unpaidBreakMinutes: r.unpaid_break_minutes,
  };
}

/** Timecards that STARTED within [from, to] (Manila dates, inclusive). */
async function punchesFor(tenantId: string, userId: string, from: string, to: string): Promise<Punch[]> {
  const { rows } = await query<{ id: string; clock_in: Date; clock_out: Date | null; needs_review: boolean }>(
    `SELECT id, clock_in, clock_out, needs_review FROM timecards
      WHERE tenant_id = $1 AND user_id = $2
        AND clock_in >= ($3::date::timestamp AT TIME ZONE '${MNL}')
        AND clock_in <  ((($4::date + 1)::timestamp) AT TIME ZONE '${MNL}')
      ORDER BY clock_in ASC`,
    [tenantId, userId, from, to],
  );
  return rows.map((r) => ({
    id: r.id,
    clockIn: r.clock_in.toISOString(),
    clockOut: r.clock_out ? r.clock_out.toISOString() : null,
    needsReview: r.needs_review,
  }));
}

/**
 * A manager's manual attendance entries in the range. The legacy rows the old
 * auto-attendance wrote on every shift open ("Auto: shift opened", 0 hours) are
 * ignored — they said "Present" without any hours, and the timecards now carry
 * the real signal. They stay in the table untouched.
 */
async function manualFor(tenantId: string, employeeId: string, from: string, to: string): Promise<ManualEntry[]> {
  const { rows } = await query<{ work_date: Date; status: ManualEntry["status"]; hours: string; note: string | null }>(
    `SELECT work_date, status, hours, note FROM attendance
      WHERE tenant_id = $1 AND employee_id = $2 AND work_date BETWEEN $3 AND $4
        AND NOT (status = 'Present' AND hours = 0 AND coalesce(note, '') LIKE 'Auto:%')`,
    [tenantId, employeeId, from, to],
  );
  return rows.map((r) => ({ date: toIsoDate(r.work_date), status: r.status, hours: Number(r.hours), note: r.note }));
}

export interface AttendanceReport {
  schedule: EmployeeSchedule;
  from: string;
  to: string;
  days: AttendanceDay[];
  summary: AttendanceSummary;
}

/** One employee's derived attendance over [from, to], or null if not ours. */
export async function getAttendanceReport(
  tenantId: string,
  employeeId: string,
  from: string,
  to: string,
  now: Date = new Date(),
): Promise<AttendanceReport | null> {
  const schedule = await getEmployeeSchedule(tenantId, employeeId);
  if (!schedule) return null;
  const [punches, manual] = await Promise.all([
    schedule.userId ? punchesFor(tenantId, schedule.userId, from, to) : Promise.resolve([]),
    manualFor(tenantId, employeeId, from, to),
  ]);
  const days = buildAttendanceDays({
    from,
    to,
    now,
    schedule,
    hireDate: schedule.hireDate,
    separatedOn: schedule.separatedOn,
    punches,
    manual,
  });
  return { schedule, from, to, days, summary: summarizeAttendance(days) };
}

/** Remove a manager's manual entry for a day, so the day goes back to the timecards. */
export async function clearManualAttendance(tenantId: string, employeeId: string, date: string): Promise<boolean> {
  const { rowCount } = await query(
    `DELETE FROM attendance WHERE tenant_id = $1 AND employee_id = $2 AND work_date = $3`,
    [tenantId, employeeId, date],
  );
  return (rowCount ?? 0) > 0;
}

export type CorrectionResult =
  | { ok: true; before: { clockIn: string; clockOut: string | null }; after: { clockIn: string; clockOut: string } }
  | { ok: false; code: "NOT_FOUND" | "INVALID"; detail?: string };

/**
 * A manager sets a timecard's real Time In / Time Out — the fix for a forgotten
 * Shift Out. Closes the card, clears needs_review. Tenant-fenced: a card from
 * another store is NOT_FOUND. The shift must end after it starts, be no longer
 * than 24 hours, and not end in the future.
 */
export async function correctTimecard(
  tenantId: string,
  timecardId: string,
  input: { clockIn?: string; clockOut: string },
  now: Date = new Date(),
): Promise<CorrectionResult> {
  const cur = await query<{ clock_in: Date; clock_out: Date | null }>(
    `SELECT clock_in, clock_out FROM timecards WHERE id = $1 AND tenant_id = $2`,
    [timecardId, tenantId],
  );
  const row = cur.rows[0];
  if (!row) return { ok: false, code: "NOT_FOUND" };
  const clockIn = input.clockIn ? new Date(input.clockIn) : row.clock_in;
  const clockOut = new Date(input.clockOut);
  if (clockOut.getTime() <= clockIn.getTime()) return { ok: false, code: "INVALID", detail: "Time out must be after time in." };
  if (clockOut.getTime() - clockIn.getTime() > 24 * 60 * 60 * 1000) {
    return { ok: false, code: "INVALID", detail: "A shift can't be longer than 24 hours." };
  }
  if (clockOut.getTime() > now.getTime() + 60_000) return { ok: false, code: "INVALID", detail: "Time out can't be in the future." };

  await query(
    `UPDATE timecards
        SET clock_in = $3, clock_out = $4, status = 'COMPLETED', needs_review = FALSE
      WHERE id = $1 AND tenant_id = $2`,
    [timecardId, tenantId, clockIn, clockOut],
  );
  return {
    ok: true,
    before: { clockIn: row.clock_in.toISOString(), clockOut: row.clock_out ? row.clock_out.toISOString() : null },
    after: { clockIn: clockIn.toISOString(), clockOut: clockOut.toISOString() },
  };
}

/**
 * Timecards in the tenant still needing a manager in [from, to]: auto-closed
 * cards, and cards left open from a day that has already ended. Payroll (step
 * 4) refuses to approve a period while any remain.
 */
export async function countTimecardsNeedingReview(tenantId: string, from: string, to: string): Promise<number> {
  const { rows } = await query<{ n: string }>(
    `SELECT count(*) AS n FROM timecards
      WHERE tenant_id = $1
        AND clock_in >= ($2::date::timestamp AT TIME ZONE '${MNL}')
        AND clock_in <  ((($3::date + 1)::timestamp) AT TIME ZONE '${MNL}')
        AND (needs_review
             OR (status = 'ACTIVE' AND (clock_in AT TIME ZONE '${MNL}')::date < (now() AT TIME ZONE '${MNL}')::date))`,
    [tenantId, from, to],
  );
  return Number(rows[0]?.n ?? 0);
}

export interface TeamAttendanceRow {
  employeeId: string;
  name: string;
  position: string | null;
  /** Has a till login, so Shift In/Out punches exist. */
  hasTillAccess: boolean;
  summary: AttendanceSummary;
}

/**
 * Everyone's month at a glance for the Attendance tab: active employees plus
 * anyone separated during the month (their last days still count). One derived
 * report per employee — fine at small-business headcounts.
 */
export async function getTeamAttendance(
  tenantId: string,
  from: string,
  to: string,
  now: Date = new Date(),
): Promise<TeamAttendanceRow[]> {
  const { rows } = await query<{ id: string; name: string; position: string | null; user_id: string | null }>(
    `SELECT id, name, position, user_id FROM employees
      WHERE tenant_id = $1 AND (is_active OR (separated_on IS NOT NULL AND separated_on >= $2))
      ORDER BY lower(name) ASC`,
    [tenantId, from],
  );
  const out: TeamAttendanceRow[] = [];
  for (const e of rows) {
    const report = await getAttendanceReport(tenantId, e.id, from, to, now);
    if (report) {
      out.push({ employeeId: e.id, name: e.name, position: e.position, hasTillAccess: !!e.user_id, summary: report.summary });
    }
  }
  return out;
}
