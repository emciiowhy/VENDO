import { pool, query } from "../db.js";
import type {
  AttendanceDay,
  AttendanceRow,
  AttendanceUpsertInput,
  Employee,
  EmployeeCreateInput,
  EmployeeDetail,
  EmployeePayslip,
  EmployeeUpdateInput,
  EssProfile,
  HoursBreakdown,
  HrOverview,
  PayrollItem,
  PayrollRunDetail,
  PayrollRunInput,
  PayrollRunSummary,
  PerformanceReport,
  PerformanceRow,
  RosterEntry,
} from "./hr.schema.js";

/**
 * Data access for HR. EVERY query is scoped by `tenantId` (read from the
 * verified JWT session, never the request body); writes match on
 * `id AND tenant_id`. Money is integer centavos. Payroll gross is computed
 * server-side from each employee's pay type and the attendance in the period.
 */
const MNL = "Asia/Manila";

// ── Employees ────────────────────────────────────────────────────────────────

interface EmployeeRow {
  id: string;
  user_id: string | null;
  name: string;
  position: string | null;
  employment_type: string;
  pay_type: string;
  pay_rate_cents: number;
  hire_date: Date | null;
  phone: string | null;
  email: string | null;
  note: string | null;
  is_active: boolean;
  separated_on: Date | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  pto_balance_days: string | number;
  created_at: Date;
  updated_at: Date;
}

function toIsoDate(d: Date): string {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

/** Mask all but the last 4 of a bank account; never echo the raw number back. */
function last4(acct: string | null): string | null {
  if (!acct) return null;
  const digits = acct.replace(/\s+/g, "");
  return digits.length <= 4 ? digits : digits.slice(-4);
}

function toEmployee(row: EmployeeRow): Employee {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    position: row.position,
    employmentType: row.employment_type,
    payType: row.pay_type,
    payRateCents: row.pay_rate_cents,
    payRate: row.pay_rate_cents / 100,
    hireDate: row.hire_date ? toIsoDate(row.hire_date) : null,
    phone: row.phone,
    email: row.email,
    note: row.note,
    isActive: row.is_active,
    separatedOn: row.separated_on ? toIsoDate(row.separated_on) : null,
    address: row.address,
    emergencyContactName: row.emergency_contact_name,
    emergencyContactPhone: row.emergency_contact_phone,
    bankName: row.bank_name,
    bankAccountName: row.bank_account_name,
    bankAccountLast4: last4(row.bank_account_number),
    ptoBalanceDays: Number(row.pto_balance_days),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const EMP_COLUMNS = `id, user_id, name, position, employment_type, pay_type, pay_rate_cents,
  hire_date, phone, email, note, is_active, separated_on, address, emergency_contact_name,
  emergency_contact_phone, bank_name, bank_account_name, bank_account_number, pto_balance_days,
  created_at, updated_at`;

export async function listEmployees(tenantId: string): Promise<Employee[]> {
  const { rows } = await query<EmployeeRow>(
    `SELECT ${EMP_COLUMNS} FROM employees WHERE tenant_id = $1
      ORDER BY is_active DESC, lower(name) ASC`,
    [tenantId],
  );
  return rows.map(toEmployee);
}

export async function getEmployee(tenantId: string, id: string): Promise<Employee | null> {
  const { rows } = await query<EmployeeRow>(
    `SELECT ${EMP_COLUMNS} FROM employees WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  );
  return rows[0] ? toEmployee(rows[0]) : null;
}

export async function createEmployee(tenantId: string, input: EmployeeCreateInput): Promise<Employee> {
  const { rows } = await query<EmployeeRow>(
    `INSERT INTO employees
       (tenant_id, name, position, employment_type, pay_type, pay_rate_cents, hire_date, phone, email, note,
        is_active, address, emergency_contact_name, emergency_contact_phone,
        bank_name, bank_account_name, bank_account_number, pto_balance_days)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
     RETURNING ${EMP_COLUMNS}`,
    [
      tenantId,
      input.name,
      input.position ?? null,
      input.employmentType,
      input.payType,
      input.payRate,
      input.hireDate ?? null,
      input.phone ?? null,
      input.email ?? null,
      input.note ?? null,
      input.isActive ?? true,
      input.address ?? null,
      input.emergencyContactName ?? null,
      input.emergencyContactPhone ?? null,
      input.bankName ?? null,
      input.bankAccountName ?? null,
      input.bankAccountNumber ?? null,
      input.ptoBalanceDays ?? 0,
    ],
  );
  return toEmployee(rows[0]);
}

export async function updateEmployee(
  tenantId: string,
  id: string,
  input: EmployeeUpdateInput,
): Promise<Employee | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  const set = (col: string, val: unknown) => {
    sets.push(`${col} = $${sets.length + 3}`);
    vals.push(val);
  };
  if (input.name !== undefined) set("name", input.name);
  if (input.position !== undefined) set("position", input.position ?? null);
  if (input.employmentType !== undefined) set("employment_type", input.employmentType);
  if (input.payType !== undefined) set("pay_type", input.payType);
  if (input.payRate !== undefined) set("pay_rate_cents", input.payRate);
  if (input.hireDate !== undefined) set("hire_date", input.hireDate ?? null);
  if (input.phone !== undefined) set("phone", input.phone ?? null);
  if (input.email !== undefined) set("email", input.email ?? null);
  if (input.note !== undefined) set("note", input.note ?? null);
  if (input.address !== undefined) set("address", input.address ?? null);
  if (input.emergencyContactName !== undefined) set("emergency_contact_name", input.emergencyContactName ?? null);
  if (input.emergencyContactPhone !== undefined) set("emergency_contact_phone", input.emergencyContactPhone ?? null);
  if (input.bankName !== undefined) set("bank_name", input.bankName ?? null);
  if (input.bankAccountName !== undefined) set("bank_account_name", input.bankAccountName ?? null);
  // Account number is write-only: only overwrite when a new value is supplied.
  if (input.bankAccountNumber !== undefined) set("bank_account_number", input.bankAccountNumber ?? null);
  if (input.ptoBalanceDays !== undefined) set("pto_balance_days", input.ptoBalanceDays);
  if (input.isActive !== undefined) {
    set("is_active", input.isActive);
    // Stamp/clear the separation date so monthly retention stays truthful.
    set("separated_on", input.isActive ? null : new Date());
  }
  if (sets.length === 0) return getEmployee(tenantId, id);
  sets.push("updated_at = now()");

  const { rows } = await query<EmployeeRow>(
    `UPDATE employees SET ${sets.join(", ")} WHERE id = $1 AND tenant_id = $2 RETURNING ${EMP_COLUMNS}`,
    [id, tenantId, ...vals],
  );
  return rows[0] ? toEmployee(rows[0]) : null;
}

export async function deleteEmployee(tenantId: string, id: string): Promise<boolean> {
  const { rowCount } = await query(`DELETE FROM employees WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
  return (rowCount ?? 0) > 0;
}

// ── Attendance ───────────────────────────────────────────────────────────────

/** Active employees with their attendance for `date` (status null = unmarked). */
export async function getAttendanceForDate(tenantId: string, date: string): Promise<AttendanceRow[]> {
  const { rows } = await query<{
    employee_id: string;
    name: string;
    position: string | null;
    pay_type: string;
    status: string | null;
    hours: string | null;
  }>(
    `SELECT e.id AS employee_id, e.name, e.position, e.pay_type,
            a.status, a.hours
       FROM employees e
       LEFT JOIN attendance a ON a.employee_id = e.id AND a.work_date = $2
      WHERE e.tenant_id = $1 AND e.is_active = TRUE
      ORDER BY lower(e.name) ASC`,
    [tenantId, date],
  );
  return rows.map((r) => ({
    employeeId: r.employee_id,
    name: r.name,
    position: r.position,
    payType: r.pay_type,
    status: r.status,
    hours: r.hours ? Number(r.hours) : 0,
  }));
}

/** Upsert one employee's attendance for a day. Verifies the employee is ours. */
export async function upsertAttendance(
  tenantId: string,
  input: AttendanceUpsertInput,
): Promise<boolean> {
  const owns = await query(`SELECT 1 FROM employees WHERE id = $1 AND tenant_id = $2`, [
    input.employeeId,
    tenantId,
  ]);
  if (owns.rowCount === 0) return false;
  await query(
    `INSERT INTO attendance (tenant_id, employee_id, work_date, status, hours, note)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (employee_id, work_date)
       DO UPDATE SET status = EXCLUDED.status, hours = EXCLUDED.hours,
                     note = EXCLUDED.note, updated_at = now()`,
    [tenantId, input.employeeId, input.workDate, input.status, input.hours, input.note ?? null],
  );
  return true;
}

/**
 * Automated attendance. Opening a cashier shift is the operational signal that a
 * worker showed up today, so we stamp their linked employee record `Present` for
 * the current Manila day — no one keys it by hand. Resolves the employee from the
 * cashier login (`employees.user_id = cashierUserId`); a login with no linked
 * employee row (or an inactive one) is simply a no-op.
 *
 * Idempotent and non-destructive: `ON CONFLICT DO NOTHING` means a status already
 * recorded for the day — whether an earlier auto-Present or a manual override like
 * Leave/Absent set in the console — is never clobbered, and re-opening a shift
 * within the same day writes nothing new. Returns true only when a fresh Present
 * row was created. Best-effort by design: callers fire it without blocking the
 * till, and a failure here must never fail a shift open.
 */
export async function markPresentFromShift(tenantId: string, cashierUserId: string): Promise<boolean> {
  const { rowCount } = await query(
    `INSERT INTO attendance (tenant_id, employee_id, work_date, status, hours, note)
     SELECT e.tenant_id, e.id, (now() AT TIME ZONE $3)::date, 'Present', 0, 'Auto: shift opened'
       FROM employees e
      WHERE e.tenant_id = $1 AND e.user_id = $2 AND e.is_active = TRUE
     ON CONFLICT (employee_id, work_date) DO NOTHING`,
    [tenantId, cashierUserId, MNL],
  );
  return (rowCount ?? 0) > 0;
}

// ── Payroll ──────────────────────────────────────────────────────────────────

interface RunRow {
  id: string;
  reference: string;
  period_start: Date;
  period_end: Date;
  total_gross_cents: number;
  headcount: number;
  note: string | null;
  created_at: Date;
}

function toRunSummary(row: RunRow): PayrollRunSummary {
  return {
    id: row.id,
    reference: row.reference,
    periodStart: toIsoDate(row.period_start),
    periodEnd: toIsoDate(row.period_end),
    totalGrossCents: row.total_gross_cents,
    headcount: row.headcount,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * Run payroll for a period: gross is derived from each active employee's pay
 * type and the attendance in [start, end] —
 *   Monthly → flat monthly rate (basis 1)
 *   Daily   → rate × (Present days + ½ Half-days)
 *   Hourly  → rate × total hours logged
 * Written in one transaction with a per-Tenant serial. Records GROSS pay;
 * statutory deductions are out of scope for v1.
 */
export async function createPayrollRun(
  tenantId: string,
  createdBy: string | null,
  input: PayrollRunInput,
): Promise<PayrollRunDetail> {
  const employees = await query<{ id: string; name: string; pay_type: string; pay_rate_cents: number }>(
    `SELECT id, name, pay_type, pay_rate_cents FROM employees
      WHERE tenant_id = $1 AND is_active = TRUE ORDER BY lower(name) ASC`,
    [tenantId],
  );

  const agg = await query<{ employee_id: string; days: string; hours: string }>(
    `SELECT employee_id,
            sum(CASE status WHEN 'Present' THEN 1 WHEN 'Half-day' THEN 0.5 ELSE 0 END) AS days,
            coalesce(sum(hours), 0) AS hours
       FROM attendance
      WHERE tenant_id = $1 AND work_date BETWEEN $2 AND $3
      GROUP BY employee_id`,
    [tenantId, input.periodStart, input.periodEnd],
  );
  const byEmp = new Map(agg.rows.map((r) => [r.employee_id, { days: Number(r.days), hours: Number(r.hours) }]));

  const items = employees.rows.map((e) => {
    const a = byEmp.get(e.id) ?? { days: 0, hours: 0 };
    let basisQty: number;
    let grossCents: number;
    if (e.pay_type === "Daily") {
      basisQty = a.days;
      grossCents = Math.round(e.pay_rate_cents * a.days);
    } else if (e.pay_type === "Hourly") {
      basisQty = a.hours;
      grossCents = Math.round(e.pay_rate_cents * a.hours);
    } else {
      basisQty = 1;
      grossCents = e.pay_rate_cents;
    }
    return { employeeId: e.id, name: e.name, payType: e.pay_type, payRateCents: e.pay_rate_cents, basisQty, grossCents };
  });
  const totalGross = items.reduce((s, i) => s + i.grossCents, 0);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const seqRes = await client.query<{ next_seq: string }>(
      `INSERT INTO payroll_counters (tenant_id, next_seq)
       VALUES ($1, (SELECT count(*) FROM payroll_runs WHERE tenant_id = $1) + 1)
       ON CONFLICT (tenant_id)
         DO UPDATE SET next_seq = payroll_counters.next_seq + 1, updated_at = now()
       RETURNING next_seq`,
      [tenantId],
    );
    const reference = `PAY-${String(Number(seqRes.rows[0].next_seq)).padStart(6, "0")}`;

    const runRes = await client.query<{ id: string }>(
      `INSERT INTO payroll_runs
         (tenant_id, reference, period_start, period_end, total_gross_cents, headcount, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [tenantId, reference, input.periodStart, input.periodEnd, totalGross, items.length, input.note ?? null, createdBy],
    );
    const runId = runRes.rows[0].id;
    for (const it of items) {
      await client.query(
        `INSERT INTO payroll_items (run_id, employee_id, name, pay_type, pay_rate_cents, basis_qty, gross_cents)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [runId, it.employeeId, it.name, it.payType, it.payRateCents, it.basisQty, it.grossCents],
      );
    }
    await client.query("COMMIT");
    const detail = await getPayrollRun(tenantId, runId);
    if (!detail) throw new Error("Payroll run vanished immediately after insert.");
    return detail;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listPayrollRuns(tenantId: string): Promise<PayrollRunSummary[]> {
  const { rows } = await query<RunRow>(
    `SELECT id, reference, period_start, period_end, total_gross_cents, headcount, note, created_at
       FROM payroll_runs WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId],
  );
  return rows.map(toRunSummary);
}

export async function getPayrollRun(tenantId: string, id: string): Promise<PayrollRunDetail | null> {
  const { rows } = await query<RunRow>(
    `SELECT id, reference, period_start, period_end, total_gross_cents, headcount, note, created_at
       FROM payroll_runs WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  );
  if (!rows[0]) return null;
  const itemsRes = await query<{
    id: string;
    employee_id: string | null;
    name: string;
    pay_type: string;
    pay_rate_cents: number;
    basis_qty: string;
    gross_cents: number;
  }>(
    `SELECT id, employee_id, name, pay_type, pay_rate_cents, basis_qty, gross_cents
       FROM payroll_items WHERE run_id = $1 ORDER BY lower(name) ASC`,
    [id],
  );
  const items: PayrollItem[] = itemsRes.rows.map((i) => ({
    id: i.id,
    employeeId: i.employee_id,
    name: i.name,
    payType: i.pay_type,
    payRateCents: i.pay_rate_cents,
    basisQty: Number(i.basis_qty),
    grossCents: i.gross_cents,
  }));
  return { ...toRunSummary(rows[0]), note: rows[0].note, items };
}

// ── Summary KPIs ──────────────────────────────────────────────────────────────

export interface HrSummary {
  headcount: number;
  presentToday: number;
  payrollRunsThisMonth: number;
  lastPayrollGrossCents: number;
}

export async function getHrSummary(tenantId: string): Promise<HrSummary> {
  const res = await query<{
    headcount: number;
    present_today: number;
    runs_month: number;
    last_gross: string | null;
  }>(
    `SELECT
        (SELECT count(*)::int FROM employees WHERE tenant_id = $1 AND is_active = TRUE) AS headcount,
        (SELECT count(*)::int FROM attendance
           WHERE tenant_id = $1 AND status = 'Present'
             AND work_date = (now() AT TIME ZONE $2)::date) AS present_today,
        (SELECT count(*)::int FROM payroll_runs
           WHERE tenant_id = $1
             AND (created_at AT TIME ZONE $2) >= date_trunc('month', now() AT TIME ZONE $2)) AS runs_month,
        (SELECT total_gross_cents FROM payroll_runs
           WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1) AS last_gross`,
    [tenantId, MNL],
  );
  const r = res.rows[0];
  return {
    headcount: r.headcount,
    presentToday: r.present_today,
    payrollRunsThisMonth: r.runs_month,
    lastPayrollGrossCents: r.last_gross ? Number(r.last_gross) : 0,
  };
}

// ── Shared date / hours helpers ───────────────────────────────────────────────

const ISO_MONTH = /^\d{4}-\d{2}$/;

/** First and last calendar day of a YYYY-MM month, as ISO date strings. */
export function monthBounds(month: string): { start: string; end: string } {
  const safe = ISO_MONTH.test(month) ? month : new Date().toISOString().slice(0, 7);
  const [y, m] = safe.split("-").map(Number);
  const start = `${safe}-01`;
  const end = toIsoDate(new Date(y, m, 0)); // day 0 of next month = last day of this one
  return { start, end };
}

const STD_DAY_HOURS = 8; // PH standard working day; hours past it on a day are OT.

/**
 * Roll daily attendance into worked / regular / overtime hours. Hourly staff log
 * real hours; Daily/Monthly staff don't, so a Present day counts as a standard
 * 8h day and a Half-day as 4h. Attendance rate excludes approved Leave from the
 * denominator (you're not "unreliable" for taking sanctioned time off).
 */
function summarizeHours(rows: { status: string; hours: number }[]): HoursBreakdown {
  let daysPresent = 0;
  let regular = 0;
  let overtime = 0;
  let scheduled = 0; // Present + Absent + Half-day (the days you were expected)
  for (const r of rows) {
    if (r.status === "Present") {
      daysPresent += 1;
      scheduled += 1;
    } else if (r.status === "Half-day") {
      daysPresent += 0.5;
      scheduled += 1;
    } else if (r.status === "Absent") {
      scheduled += 1;
    }
    const eff = r.hours > 0 ? r.hours : r.status === "Present" ? STD_DAY_HOURS : r.status === "Half-day" ? 4 : 0;
    regular += Math.min(eff, STD_DAY_HOURS);
    overtime += Math.max(eff - STD_DAY_HOURS, 0);
  }
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    daysPresent: round1(daysPresent),
    hoursWorked: round1(regular + overtime),
    regularHours: round1(regular),
    overtimeHours: round1(overtime),
    attendanceRatePct: scheduled > 0 ? Math.round((daysPresent / scheduled) * 100) : 0,
  };
}

async function attendanceMonthFor(tenantId: string, employeeId: string, month: string): Promise<AttendanceDay[]> {
  const { start, end } = monthBounds(month);
  const { rows } = await query<{ work_date: Date; status: string; hours: string }>(
    `SELECT work_date, status, hours FROM attendance
      WHERE tenant_id = $1 AND employee_id = $2 AND work_date BETWEEN $3 AND $4
      ORDER BY work_date ASC`,
    [tenantId, employeeId, start, end],
  );
  return rows.map((r) => ({ date: toIsoDate(r.work_date), status: r.status, hours: Number(r.hours) }));
}

/** Days of approved 'Leave' the employee has drawn so far this Manila year. */
async function ptoUsedYtdFor(tenantId: string, employeeId: string): Promise<number> {
  const { rows } = await query<{ used: string }>(
    `SELECT coalesce(sum(CASE status WHEN 'Leave' THEN 1 WHEN 'Half-day' THEN 0.5 ELSE 0 END), 0) AS used
       FROM attendance
      WHERE tenant_id = $1 AND employee_id = $2
        AND work_date >= date_trunc('year', now() AT TIME ZONE $3)::date`,
    [tenantId, employeeId, MNL],
  );
  return Number(rows[0]?.used ?? 0);
}

async function payslipsFor(tenantId: string, employeeId: string): Promise<EmployeePayslip[]> {
  const { rows } = await query<{
    run_id: string;
    reference: string;
    period_start: Date;
    period_end: Date;
    pay_type: string;
    pay_rate_cents: number;
    basis_qty: string;
    gross_cents: number;
    created_at: Date;
  }>(
    `SELECT pr.id AS run_id, pr.reference, pr.period_start, pr.period_end,
            pi.pay_type, pi.pay_rate_cents, pi.basis_qty, pi.gross_cents, pr.created_at
       FROM payroll_items pi
       JOIN payroll_runs pr ON pr.id = pi.run_id
      WHERE pr.tenant_id = $1 AND pi.employee_id = $2
      ORDER BY pr.created_at DESC`,
    [tenantId, employeeId],
  );
  return rows.map((r) => ({
    runId: r.run_id,
    reference: r.reference,
    periodStart: toIsoDate(r.period_start),
    periodEnd: toIsoDate(r.period_end),
    payType: r.pay_type,
    payRateCents: r.pay_rate_cents,
    basisQty: Number(r.basis_qty),
    grossCents: r.gross_cents,
    createdAt: r.created_at.toISOString(),
  }));
}

// ── Deep-dive employee profile ────────────────────────────────────────────────

export async function getEmployeeDetail(
  tenantId: string,
  id: string,
  month: string,
): Promise<EmployeeDetail | null> {
  const employee = await getEmployee(tenantId, id);
  if (!employee) return null;
  const { start, end } = monthBounds(month);
  const [attendanceMonth, ptoUsedYtd, payslips, perf] = await Promise.all([
    attendanceMonthFor(tenantId, id, month),
    ptoUsedYtdFor(tenantId, id),
    payslipsFor(tenantId, id),
    getPerformance(tenantId, start, end, id),
  ]);
  return {
    ...employee,
    month: monthBounds(month).start.slice(0, 7),
    attendanceMonth,
    hours: summarizeHours(attendanceMonth.map((a) => ({ status: a.status, hours: a.hours }))),
    ptoUsedYtd,
    payslips,
    performance: perf.rows[0] ?? null,
  };
}

// ── Performance matrix ────────────────────────────────────────────────────────

/**
 * Per-employee operational performance over [from, to] (inclusive ISO dates,
 * evaluated in Manila time). Joins the HR roster to the register: attendance →
 * hours, sales rung by the linked cashier login → revenue + throughput, and
 * closed cashier shifts → drawer accuracy. Employees with no `user_id` still
 * appear with their attendance, just without register figures.
 */
export async function getPerformance(
  tenantId: string,
  from: string,
  to: string,
  employeeId?: string,
): Promise<PerformanceReport> {
  const employees = await query<{ id: string; user_id: string | null; name: string; position: string | null }>(
    `SELECT id, user_id, name, position FROM employees
      WHERE tenant_id = $1 AND ($2::uuid IS NULL OR id = $2) AND (is_active = TRUE OR id = $2)
      ORDER BY lower(name) ASC`,
    [tenantId, employeeId ?? null],
  );

  // Attendance rolled up per employee (per-day OT split done in SQL on the 8h cap).
  const att = await query<{
    employee_id: string;
    days_present: string;
    scheduled: string;
    regular: string;
    overtime: string;
  }>(
    `SELECT employee_id,
            sum(CASE status WHEN 'Present' THEN 1 WHEN 'Half-day' THEN 0.5 ELSE 0 END) AS days_present,
            sum(CASE WHEN status IN ('Present','Absent','Half-day') THEN 1 ELSE 0 END) AS scheduled,
            sum(LEAST(eff, ${STD_DAY_HOURS})) AS regular,
            sum(GREATEST(eff - ${STD_DAY_HOURS}, 0)) AS overtime
       FROM (
         SELECT employee_id, status,
                CASE WHEN hours > 0 THEN hours
                     WHEN status = 'Present' THEN ${STD_DAY_HOURS}
                     WHEN status = 'Half-day' THEN 4 ELSE 0 END AS eff
           FROM attendance
          WHERE tenant_id = $1 AND work_date BETWEEN $2 AND $3
       ) d
      GROUP BY employee_id`,
    [tenantId, from, to],
  );
  const attByEmp = new Map(att.rows.map((r) => [r.employee_id, r]));

  // Net sales + transaction count per cashier login over the window (contra rows
  // for voids/returns carry negative money, so SUM nets refunds out naturally).
  const sales = await query<{ cashier_user_id: string; net_cents: string; txns: string }>(
    `SELECT cashier_user_id,
            coalesce(sum(total_cents), 0) AS net_cents,
            count(*) FILTER (WHERE kind = 'sale') AS txns
       FROM sales
      WHERE tenant_id = $1 AND cashier_user_id IS NOT NULL
        AND (created_at AT TIME ZONE $4)::date BETWEEN $2 AND $3
      GROUP BY cashier_user_id`,
    [tenantId, from, to, MNL],
  );
  const salesByUser = new Map(sales.rows.map((r) => [r.cashier_user_id, r]));

  // Drawer reconciliation per cashier from shifts CLOSED in the window.
  const drawer = await query<{
    cashier_user_id: string;
    shifts: string;
    variance: string;
    abs_variance: string;
    cash_base: string;
  }>(
    `SELECT cashier_user_id,
            count(*) AS shifts,
            coalesce(sum(cash_variance_cents), 0) AS variance,
            coalesce(sum(abs(cash_variance_cents)), 0) AS abs_variance,
            coalesce(sum(expected_cash_cents), 0) AS cash_base
       FROM cashier_shifts
      WHERE tenant_id = $1 AND status = 'closed' AND cashier_user_id IS NOT NULL
        AND (closed_at AT TIME ZONE $4)::date BETWEEN $2 AND $3
      GROUP BY cashier_user_id`,
    [tenantId, from, to, MNL],
  );
  const drawerByUser = new Map(drawer.rows.map((r) => [r.cashier_user_id, r]));

  const round1 = (n: number) => Math.round(n * 10) / 10;
  const rows: PerformanceRow[] = employees.rows.map((e) => {
    const a = attByEmp.get(e.id);
    const daysPresent = round1(Number(a?.days_present ?? 0));
    const scheduled = Number(a?.scheduled ?? 0);
    const regularHours = round1(Number(a?.regular ?? 0));
    const overtimeHours = round1(Number(a?.overtime ?? 0));
    const hoursWorked = round1(regularHours + overtimeHours);

    const s = e.user_id ? salesByUser.get(e.user_id) : undefined;
    const d = e.user_id ? drawerByUser.get(e.user_id) : undefined;
    const salesCents = Number(s?.net_cents ?? 0);
    const txnCount = Number(s?.txns ?? 0);
    const shiftsClosed = Number(d?.shifts ?? 0);
    const absVariance = Number(d?.abs_variance ?? 0);
    const cashBase = Number(d?.cash_base ?? 0);

    return {
      employeeId: e.id,
      userId: e.user_id,
      name: e.name,
      position: e.position,
      linked: e.user_id !== null,
      daysPresent,
      hoursWorked,
      regularHours,
      overtimeHours,
      attendanceRatePct: scheduled > 0 ? Math.round((daysPresent / scheduled) * 100) : 0,
      salesCents,
      txnCount,
      salesPerHourCents: hoursWorked > 0 ? Math.round(salesCents / hoursWorked) : 0,
      shiftsClosed,
      drawerVarianceCents: Number(d?.variance ?? 0),
      drawerAccuracyPct:
        shiftsClosed === 0
          ? null
          : cashBase > 0
            ? Math.max(0, Math.round((1 - absVariance / cashBase) * 100))
            : absVariance === 0
              ? 100
              : 0,
    };
  });

  return { from, to, rows };
}

// ── Executive overview hub ────────────────────────────────────────────────────

export async function getHrOverview(tenantId: string): Promise<HrOverview> {
  const [counts, depts, types, pays, roster, pins] = await Promise.all([
    query<{
      active: number;
      total: number;
      new_hires: number;
      separations: number;
      separated_window: number;
      present_today: number;
    }>(
      `SELECT
         (SELECT count(*)::int FROM employees WHERE tenant_id = $1 AND is_active = TRUE) AS active,
         (SELECT count(*)::int FROM employees WHERE tenant_id = $1) AS total,
         (SELECT count(*)::int FROM employees
            WHERE tenant_id = $1 AND hire_date >= date_trunc('month', now() AT TIME ZONE $2)::date) AS new_hires,
         (SELECT count(*)::int FROM employees
            WHERE tenant_id = $1 AND separated_on >= date_trunc('month', now() AT TIME ZONE $2)::date) AS separations,
         (SELECT count(*)::int FROM employees
            WHERE tenant_id = $1 AND separated_on >= (now() AT TIME ZONE $2)::date - INTERVAL '30 days') AS separated_window,
         (SELECT count(*)::int FROM attendance
            WHERE tenant_id = $1 AND status = 'Present'
              AND work_date = (now() AT TIME ZONE $2)::date) AS present_today`,
      [tenantId, MNL],
    ),
    query<{ name: string | null; count: number }>(
      `SELECT coalesce(nullif(trim(position), ''), 'Unassigned') AS name, count(*)::int AS count
         FROM employees WHERE tenant_id = $1 AND is_active = TRUE
        GROUP BY 1 ORDER BY count DESC, 1 ASC`,
      [tenantId],
    ),
    query<{ type: string; count: number }>(
      `SELECT employment_type AS type, count(*)::int AS count
         FROM employees WHERE tenant_id = $1 AND is_active = TRUE GROUP BY 1 ORDER BY count DESC`,
      [tenantId],
    ),
    query<{ type: string; count: number }>(
      `SELECT pay_type AS type, count(*)::int AS count
         FROM employees WHERE tenant_id = $1 AND is_active = TRUE GROUP BY 1 ORDER BY count DESC`,
      [tenantId],
    ),
    query<{ id: string; cashier_user_id: string | null; cashier_name: string; opening_cents: number; opened_at: Date }>(
      `SELECT id, cashier_user_id, cashier_name, opening_cents, opened_at
         FROM cashier_shifts WHERE tenant_id = $1 AND status = 'open'
        ORDER BY opened_at ASC`,
      [tenantId],
    ),
    query<{ count: number }>(
      `SELECT count(*)::int AS count FROM cashier_pin_requests
        WHERE tenant_id = $1 AND status = 'pending'`,
      [tenantId],
    ),
  ]);

  const c = counts.rows[0];
  const separatedWindow = c.separated_window;
  // Retention base = everyone still employed plus those who left in the window.
  const base = c.active + separatedWindow;
  const retentionRatePct = base > 0 ? Math.round((c.active / base) * 100) : 100;

  const rosterEntries: RosterEntry[] = roster.rows.map((r) => ({
    shiftId: r.id,
    userId: r.cashier_user_id,
    name: r.cashier_name,
    openingCents: r.opening_cents,
    openedAt: r.opened_at.toISOString(),
  }));

  return {
    headcount: c.total,
    activeHeadcount: c.active,
    newHiresThisMonth: c.new_hires,
    separationsThisMonth: c.separations,
    retentionRatePct,
    departments: depts.rows.map((d) => ({ name: d.name ?? "Unassigned", count: d.count })),
    employmentTypes: types.rows.map((t) => ({ type: t.type, count: t.count })),
    payTypes: pays.rows.map((p) => ({ type: p.type, count: p.count })),
    presentToday: c.present_today,
    roster: rosterEntries,
    pendingPinRequests: pins.rows[0]?.count ?? 0,
  };
}

// ── Employee Self-Service ─────────────────────────────────────────────────────

/**
 * One staff member's own record, resolved from their login `userId` (never a
 * client-supplied id). Returns null when the signed-in user has no linked
 * employee record (e.g. the owner themselves isn't on the roster).
 */
export async function getEssProfile(tenantId: string, userId: string, month: string): Promise<EssProfile | null> {
  const { rows } = await query<{
    id: string;
    name: string;
    position: string | null;
    employment_type: string;
    pay_type: string;
    pay_rate_cents: number;
    hire_date: Date | null;
    pto_balance_days: string | number;
    store_name: string | null;
  }>(
    `SELECT e.id, e.name, e.position, e.employment_type, e.pay_type, e.pay_rate_cents,
            e.hire_date, e.pto_balance_days, t.name AS store_name
       FROM employees e
       JOIN tenants t ON t.id = e.tenant_id
      WHERE e.tenant_id = $1 AND e.user_id = $2
      LIMIT 1`,
    [tenantId, userId],
  );
  const e = rows[0];
  if (!e) return null;

  const [attendanceMonth, ptoUsedYtd, payslips] = await Promise.all([
    attendanceMonthFor(tenantId, e.id, month),
    ptoUsedYtdFor(tenantId, e.id),
    payslipsFor(tenantId, e.id),
  ]);

  return {
    employee: {
      id: e.id,
      name: e.name,
      position: e.position,
      employmentType: e.employment_type,
      payType: e.pay_type,
      payRateCents: e.pay_rate_cents,
      hireDate: e.hire_date ? toIsoDate(e.hire_date) : null,
      ptoBalanceDays: Number(e.pto_balance_days),
    },
    storeName: e.store_name,
    month: monthBounds(month).start.slice(0, 7),
    attendanceMonth,
    hours: summarizeHours(attendanceMonth.map((a) => ({ status: a.status, hours: a.hours }))),
    ptoUsedYtd,
    payslips,
  };
}
