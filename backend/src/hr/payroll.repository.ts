import type pg from "pg";
import { pool, query } from "../db.js";
import { countTimecardsNeedingReview, getAttendanceReport } from "./attendance.repository.js";
import { computePayLine, hoursLabel, payableCents, suggestDailyRateCents, type PayLine } from "./payroll.js";

/**
 * Payroll runs: Draft → Approved. Every query is scoped by `tenantId` from the
 * verified session (a run, line or adjustment of another store is "not found").
 * Every change to a draft re-checks `status = 'draft'` in the same statement, so
 * an approved run can never be edited — it is the locked payroll record.
 * Money is integer centavos.
 */

function toIsoDate(d: Date): string {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

export type RunStatus = "draft" | "approved";

export interface PayrollAdjustment {
  id: string;
  itemId: string;
  kind: "overtime" | "paid_leave" | "manual";
  label: string;
  amountCents: number;
  approved: boolean;
}

export interface PayrollLine {
  id: string;
  employeeId: string | null;
  name: string;
  /** True for lines from before this payroll rework (gross only). */
  legacy: boolean;
  dailyRateCents: number;
  rateConfirmed: boolean;
  standardDailyHours: number;
  presentDays: number;
  halfDays: number;
  absentDays: number;
  leaveDays: number;
  workedMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  baseCents: number;
  adjustments: PayrollAdjustment[];
  approvedAdjustmentsCents: number;
  payableCents: number;
}

export interface PayrollRunSummary {
  id: string;
  reference: string;
  status: RunStatus;
  periodStart: string;
  periodEnd: string;
  headcount: number;
  totalBaseCents: number;
  totalPayableCents: number;
  approvedAt: string | null;
  createdAt: string;
}

export interface PayrollRunDetail extends PayrollRunSummary {
  note: string | null;
  approvedByName: string | null;
  lines: PayrollLine[];
  /** Why the run can't be approved yet (empty = ready). Drafts only. */
  blockers: string[];
}

// ── Reads ─────────────────────────────────────────────────────────────────────

interface RunRow {
  id: string;
  reference: string;
  status: RunStatus;
  period_start: Date;
  period_end: Date;
  headcount: number;
  total_gross_cents: number;
  total_payable_cents: number | null;
  note: string | null;
  approved_at: Date | null;
  approved_by_name: string | null;
  created_at: Date;
}

const RUN_COLS = `r.id, r.reference, r.status, r.period_start, r.period_end, r.headcount, r.total_gross_cents,
  r.total_payable_cents, r.note, r.approved_at, r.created_at, u.name AS approved_by_name`;

function toSummary(r: RunRow): PayrollRunSummary {
  return {
    id: r.id,
    reference: r.reference,
    status: r.status,
    periodStart: toIsoDate(r.period_start),
    periodEnd: toIsoDate(r.period_end),
    headcount: r.headcount,
    totalBaseCents: r.total_gross_cents,
    // Legacy runs pre-date adjustments: what they paid is their gross.
    totalPayableCents: r.total_payable_cents ?? r.total_gross_cents,
    approvedAt: r.approved_at ? r.approved_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
  };
}

export async function listPayrollRuns(tenantId: string): Promise<PayrollRunSummary[]> {
  const { rows } = await query<RunRow>(
    `SELECT ${RUN_COLS} FROM payroll_runs r LEFT JOIN users u ON u.id = r.approved_by
      WHERE r.tenant_id = $1 ORDER BY r.period_start DESC, r.created_at DESC`,
    [tenantId],
  );
  return rows.map(toSummary);
}

interface ItemRow {
  id: string;
  employee_id: string | null;
  name: string;
  pay_rate_cents: number;
  gross_cents: number;
  daily_rate_cents: number | null;
  rate_confirmed: boolean;
  standard_daily_hours: string | null;
  present_days: number | null;
  half_days: number | null;
  absent_days: number | null;
  leave_days: number | null;
  worked_minutes: number | null;
  regular_minutes: number | null;
  overtime_minutes: number | null;
  base_cents: number | null;
  payable_cents: number | null;
}

export async function getPayrollRun(tenantId: string, id: string): Promise<PayrollRunDetail | null> {
  const run = await query<RunRow>(
    `SELECT ${RUN_COLS} FROM payroll_runs r LEFT JOIN users u ON u.id = r.approved_by
      WHERE r.id = $1 AND r.tenant_id = $2`,
    [id, tenantId],
  );
  const r = run.rows[0];
  if (!r) return null;
  const [items, adjs] = await Promise.all([
    query<ItemRow>(
      `SELECT id, employee_id, name, pay_rate_cents, gross_cents, daily_rate_cents, rate_confirmed, standard_daily_hours,
              present_days, half_days, absent_days, leave_days, worked_minutes, regular_minutes, overtime_minutes,
              base_cents, payable_cents
         FROM payroll_items WHERE run_id = $1 ORDER BY lower(name) ASC`,
      [id],
    ),
    query<{ id: string; item_id: string; kind: PayrollAdjustment["kind"]; label: string; amount_cents: number; approved: boolean }>(
      `SELECT id, item_id, kind, label, amount_cents, approved FROM payroll_adjustments
        WHERE run_id = $1 ORDER BY created_at ASC`,
      [id],
    ),
  ]);
  const adjByItem = new Map<string, PayrollAdjustment[]>();
  for (const a of adjs.rows) {
    const list = adjByItem.get(a.item_id) ?? [];
    list.push({ id: a.id, itemId: a.item_id, kind: a.kind, label: a.label, amountCents: a.amount_cents, approved: a.approved });
    adjByItem.set(a.item_id, list);
  }
  const lines: PayrollLine[] = items.rows.map((i) => {
    const legacy = i.base_cents === null;
    const adjustments = adjByItem.get(i.id) ?? [];
    const base = legacy ? i.gross_cents : i.base_cents!;
    const approvedAdj = adjustments.reduce((s, a) => (a.approved ? s + a.amountCents : s), 0);
    return {
      id: i.id,
      employeeId: i.employee_id,
      name: i.name,
      legacy,
      dailyRateCents: i.daily_rate_cents ?? i.pay_rate_cents,
      rateConfirmed: i.rate_confirmed,
      standardDailyHours: Number(i.standard_daily_hours ?? 8),
      presentDays: i.present_days ?? 0,
      halfDays: i.half_days ?? 0,
      absentDays: i.absent_days ?? 0,
      leaveDays: i.leave_days ?? 0,
      workedMinutes: i.worked_minutes ?? 0,
      regularMinutes: i.regular_minutes ?? 0,
      overtimeMinutes: i.overtime_minutes ?? 0,
      baseCents: base,
      adjustments,
      approvedAdjustmentsCents: approvedAdj,
      // An approved line is frozen at what was approved; a draft is live.
      payableCents: r.status === "approved" && i.payable_cents !== null ? i.payable_cents : base + approvedAdj,
    };
  });

  const summary = toSummary(r);
  if (r.status === "draft") summary.totalPayableCents = lines.reduce((s, l) => s + l.payableCents, 0);
  const blockers: string[] = [];
  if (r.status === "draft") {
    const unconfirmed = lines.filter((l) => !l.rateConfirmed).length;
    if (unconfirmed > 0) blockers.push(`${unconfirmed} daily rate${unconfirmed === 1 ? "" : "s"} still to confirm.`);
    const review = await countTimecardsNeedingReview(tenantId, summary.periodStart, summary.periodEnd);
    if (review > 0) {
      blockers.push(`${review} timecard${review === 1 ? "" : "s"} in this period have a missing Shift Out — fix them in Attendance first.`);
    }
  }
  return { ...summary, note: r.note, approvedByName: r.approved_by_name, lines, blockers };
}

// ── Create / recalculate ──────────────────────────────────────────────────────

interface EmpRow {
  id: string;
  name: string;
  pay_type: string;
  pay_rate_cents: number;
  daily_rate_cents: number | null;
  standard_daily_hours: string;
}

/** Compute one employee's line for the period from their derived attendance. */
async function lineFor(
  tenantId: string,
  e: EmpRow,
  from: string,
  to: string,
  dailyRateCents: number,
): Promise<PayLine & { standardDailyHours: number }> {
  const report = await getAttendanceReport(tenantId, e.id, from, to);
  const standardDailyHours = report?.schedule.standardDailyHours ?? Number(e.standard_daily_hours);
  return { ...computePayLine({ days: report?.days ?? [], dailyRateCents, standardDailyHours }), standardDailyHours };
}

/** Write a line's attendance numbers + base, and replace its suggestions. */
async function writeLine(
  client: pg.PoolClient,
  runId: string,
  itemId: string,
  line: PayLine & { standardDailyHours: number },
  userId: string | null,
): Promise<void> {
  await client.query(
    `UPDATE payroll_items SET standard_daily_hours = $2, present_days = $3, half_days = $4, absent_days = $5,
            leave_days = $6, worked_minutes = $7, regular_minutes = $8, overtime_minutes = $9,
            base_cents = $10, gross_cents = $10, basis_qty = $11
      WHERE id = $1`,
    [
      itemId,
      line.standardDailyHours,
      line.presentDays,
      line.halfDays,
      line.absentDays,
      line.leaveDays,
      line.workedMinutes,
      line.regularMinutes,
      line.overtimeMinutes,
      line.baseCents,
      Math.round((line.regularMinutes / 60) * 100) / 100,
    ],
  );
  // Suggestions are regenerated from the figures; manual lines are kept.
  await client.query(`DELETE FROM payroll_adjustments WHERE item_id = $1 AND kind IN ('overtime', 'paid_leave')`, [itemId]);
  if (line.overtimeCents > 0) {
    await client.query(
      `INSERT INTO payroll_adjustments (run_id, item_id, kind, label, amount_cents, approved, created_by)
       VALUES ($1, $2, 'overtime', $3, $4, FALSE, $5)`,
      [runId, itemId, `Overtime 125% (${hoursLabel(line.overtimeMinutes)} h)`, line.overtimeCents, userId],
    );
  }
  if (line.paidLeaveCents > 0) {
    await client.query(
      `INSERT INTO payroll_adjustments (run_id, item_id, kind, label, amount_cents, approved, created_by)
       VALUES ($1, $2, 'paid_leave', $3, $4, FALSE, $5)`,
      [runId, itemId, `Paid leave (${line.leaveDays} day${line.leaveDays === 1 ? "" : "s"})`, line.paidLeaveCents, userId],
    );
  }
}

async function refreshTotals(client: pg.PoolClient, runId: string): Promise<void> {
  await client.query(
    `UPDATE payroll_runs SET total_gross_cents = coalesce((SELECT sum(base_cents) FROM payroll_items WHERE run_id = $1), 0),
            headcount = (SELECT count(*) FROM payroll_items WHERE run_id = $1)
      WHERE id = $1`,
    [runId],
  );
}

export type CreateResult =
  | { ok: true; runId: string }
  | { ok: false; code: "OVERLAP"; reference: string }
  | { ok: false; code: "NO_EMPLOYEES" };

/**
 * Start a DRAFT run for [from, to]: one line per employee active in the period,
 * each priced from their derived attendance. A run may not overlap another
 * run's dates (no paying the same day twice). Employees with no confirmed daily
 * rate get a suggested one, marked unconfirmed, which blocks approval.
 */
export async function createDraftRun(
  tenantId: string,
  userId: string | null,
  input: { periodStart: string; periodEnd: string; note?: string | null },
): Promise<CreateResult> {
  const overlap = await query<{ reference: string }>(
    `SELECT reference FROM payroll_runs
      WHERE tenant_id = $1 AND period_start <= $3 AND period_end >= $2 LIMIT 1`,
    [tenantId, input.periodStart, input.periodEnd],
  );
  if (overlap.rows[0]) return { ok: false, code: "OVERLAP", reference: overlap.rows[0].reference };

  const emps = await query<EmpRow>(
    `SELECT id, name, pay_type, pay_rate_cents, daily_rate_cents, standard_daily_hours FROM employees
      WHERE tenant_id = $1
        AND (hire_date IS NULL OR hire_date <= $3)
        AND (is_active OR (separated_on IS NOT NULL AND separated_on >= $2))
      ORDER BY lower(name) ASC`,
    [tenantId, input.periodStart, input.periodEnd],
  );
  if (emps.rows.length === 0) return { ok: false, code: "NO_EMPLOYEES" };

  // Attendance is read before the transaction (it's a read-only derivation).
  const priced = [];
  for (const e of emps.rows) {
    const confirmed = e.daily_rate_cents !== null;
    const rate = confirmed
      ? e.daily_rate_cents!
      : suggestDailyRateCents(e.pay_type, e.pay_rate_cents, Number(e.standard_daily_hours));
    priced.push({ e, rate, confirmed, line: await lineFor(tenantId, e, input.periodStart, input.periodEnd, rate) });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const seq = await client.query<{ next_seq: string }>(
      `INSERT INTO payroll_counters (tenant_id, next_seq)
       VALUES ($1, (SELECT count(*) FROM payroll_runs WHERE tenant_id = $1) + 1)
       ON CONFLICT (tenant_id) DO UPDATE SET next_seq = payroll_counters.next_seq + 1, updated_at = now()
       RETURNING next_seq`,
      [tenantId],
    );
    const reference = `PAY-${String(Number(seq.rows[0].next_seq)).padStart(6, "0")}`;
    const run = await client.query<{ id: string }>(
      `INSERT INTO payroll_runs (tenant_id, reference, period_start, period_end, total_gross_cents, headcount, note, created_by, status)
       VALUES ($1, $2, $3, $4, 0, 0, $5, $6, 'draft') RETURNING id`,
      [tenantId, reference, input.periodStart, input.periodEnd, input.note ?? null, userId],
    );
    const runId = run.rows[0].id;
    for (const p of priced) {
      const item = await client.query<{ id: string }>(
        `INSERT INTO payroll_items (run_id, employee_id, name, pay_type, pay_rate_cents, basis_qty, gross_cents,
                                    daily_rate_cents, rate_confirmed)
         VALUES ($1, $2, $3, 'Daily', $4, 0, 0, $4, $5) RETURNING id`,
        [runId, p.e.id, p.e.name, p.rate, p.confirmed],
      );
      await writeLine(client, runId, item.rows[0].id, p.line, userId);
    }
    await refreshTotals(client, runId);
    await client.query("COMMIT");
    return { ok: true, runId };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Is this run ours and still a draft? Locks it for the transaction. */
async function lockDraft(client: pg.PoolClient, tenantId: string, runId: string) {
  const { rows } = await client.query<{ period_start: Date; period_end: Date }>(
    `SELECT period_start, period_end FROM payroll_runs WHERE id = $1 AND tenant_id = $2 AND status = 'draft' FOR UPDATE`,
    [runId, tenantId],
  );
  return rows[0] ? { from: toIsoDate(rows[0].period_start), to: toIsoDate(rows[0].period_end) } : null;
}

export type DraftResult = { ok: true } | { ok: false; code: "NOT_FOUND" | "NOT_DRAFT" | "OWN_PAY" };

async function draftState(tenantId: string, runId: string): Promise<"missing" | "approved" | "draft"> {
  const { rows } = await query<{ status: RunStatus }>(`SELECT status FROM payroll_runs WHERE id = $1 AND tenant_id = $2`, [runId, tenantId]);
  return rows[0] ? rows[0].status : "missing";
}

const notDraft = async (tenantId: string, runId: string): Promise<DraftResult> =>
  (await draftState(tenantId, runId)) === "missing" ? { ok: false, code: "NOT_FOUND" } : { ok: false, code: "NOT_DRAFT" };

/** Re-read attendance for every line of a draft (after timecard fixes, etc.). */
export async function recalculateRun(tenantId: string, runId: string, userId: string | null): Promise<DraftResult> {
  const head = await query<{ period_start: Date; period_end: Date }>(
    `SELECT period_start, period_end FROM payroll_runs WHERE id = $1 AND tenant_id = $2 AND status = 'draft'`,
    [runId, tenantId],
  );
  if (!head.rows[0]) return notDraft(tenantId, runId);
  const from = toIsoDate(head.rows[0].period_start);
  const to = toIsoDate(head.rows[0].period_end);
  const items = await query<{ id: string; daily_rate_cents: number } & EmpRow>(
    `SELECT i.id, i.daily_rate_cents, e.id AS emp_id, e.name, e.pay_type, e.pay_rate_cents, e.standard_daily_hours
       FROM payroll_items i JOIN employees e ON e.id = i.employee_id
      WHERE i.run_id = $1`,
    [runId],
  );
  const priced = [];
  for (const i of items.rows) {
    const e = { ...i, id: (i as unknown as { emp_id: string }).emp_id };
    priced.push({ itemId: i.id, line: await lineFor(tenantId, e, from, to, i.daily_rate_cents) });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (!(await lockDraft(client, tenantId, runId))) {
      await client.query("ROLLBACK");
      return notDraft(tenantId, runId);
    }
    for (const p of priced) await writeLine(client, runId, p.itemId, p.line, userId);
    await refreshTotals(client, runId);
    await client.query("COMMIT");
    return { ok: true };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Does this payroll line belong to the given login (a manager's own pay)? */
async function isOwnLine(itemId: string, userId: string): Promise<boolean> {
  const { rows } = await query(
    `SELECT 1 FROM payroll_items i JOIN employees e ON e.id = i.employee_id WHERE i.id = $1 AND e.user_id = $2`,
    [itemId, userId],
  );
  return rows.length > 0;
}

/**
 * The manager enters or confirms a line's daily rate. Saved on the line AND on
 * the employee (so the next run starts confirmed), then the line is re-priced.
 * A MANAGER can't set the rate on their own line — only the owner can.
 */
export async function setLineRate(
  tenantId: string,
  runId: string,
  itemId: string,
  dailyRateCents: number,
  actor: { userId: string | null; role: string },
): Promise<DraftResult> {
  if (actor.role === "MANAGER" && actor.userId && (await isOwnLine(itemId, actor.userId))) {
    return { ok: false, code: "OWN_PAY" };
  }
  const head = await query<{ period_start: Date; period_end: Date }>(
    `SELECT period_start, period_end FROM payroll_runs WHERE id = $1 AND tenant_id = $2 AND status = 'draft'`,
    [runId, tenantId],
  );
  if (!head.rows[0]) return notDraft(tenantId, runId);
  const emp = await query<EmpRow>(
    `SELECT e.id, e.name, e.pay_type, e.pay_rate_cents, e.daily_rate_cents, e.standard_daily_hours
       FROM payroll_items i JOIN employees e ON e.id = i.employee_id
      WHERE i.id = $1 AND i.run_id = $2 AND e.tenant_id = $3`,
    [itemId, runId, tenantId],
  );
  if (!emp.rows[0]) return { ok: false, code: "NOT_FOUND" };
  const line = await lineFor(
    tenantId,
    emp.rows[0],
    toIsoDate(head.rows[0].period_start),
    toIsoDate(head.rows[0].period_end),
    dailyRateCents,
  );
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (!(await lockDraft(client, tenantId, runId))) {
      await client.query("ROLLBACK");
      return notDraft(tenantId, runId);
    }
    await client.query(
      `UPDATE payroll_items SET daily_rate_cents = $2, pay_rate_cents = $2, rate_confirmed = TRUE WHERE id = $1`,
      [itemId, dailyRateCents],
    );
    await client.query(`UPDATE employees SET daily_rate_cents = $2, updated_at = now() WHERE id = $1 AND tenant_id = $3`, [
      emp.rows[0].id,
      dailyRateCents,
      tenantId,
    ]);
    await writeLine(client, runId, itemId, line, actor.userId);
    await refreshTotals(client, runId);
    await client.query("COMMIT");
    return { ok: true };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Add a manual +/- adjustment to a draft line (approved on entry). */
export async function addAdjustment(
  tenantId: string,
  runId: string,
  itemId: string,
  input: { label: string; amountCents: number },
  actor: { userId: string | null; role: string },
): Promise<DraftResult> {
  if (actor.role === "MANAGER" && actor.userId && (await isOwnLine(itemId, actor.userId))) {
    return { ok: false, code: "OWN_PAY" };
  }
  const { rowCount } = await query(
    `INSERT INTO payroll_adjustments (run_id, item_id, kind, label, amount_cents, approved, created_by)
     SELECT $1, i.id, 'manual', $4, $5, TRUE, $6
       FROM payroll_items i JOIN payroll_runs r ON r.id = i.run_id
      WHERE i.id = $3 AND r.id = $1 AND r.tenant_id = $2 AND r.status = 'draft'`,
    [runId, tenantId, itemId, input.label, input.amountCents, actor.userId],
  );
  return (rowCount ?? 0) > 0 ? { ok: true } : notDraft(tenantId, runId);
}

/** Approve or un-approve one adjustment (e.g. tick the overtime suggestion). */
export async function setAdjustmentApproved(
  tenantId: string,
  runId: string,
  adjustmentId: string,
  approved: boolean,
  actor: { userId: string | null; role: string },
): Promise<DraftResult> {
  const owner = await query<{ item_id: string }>(`SELECT item_id FROM payroll_adjustments WHERE id = $1 AND run_id = $2`, [
    adjustmentId,
    runId,
  ]);
  if (!owner.rows[0]) return { ok: false, code: "NOT_FOUND" };
  if (actor.role === "MANAGER" && actor.userId && (await isOwnLine(owner.rows[0].item_id, actor.userId))) {
    return { ok: false, code: "OWN_PAY" };
  }
  const { rowCount } = await query(
    `UPDATE payroll_adjustments a SET approved = $4
       FROM payroll_runs r
      WHERE a.id = $3 AND a.run_id = r.id AND r.id = $1 AND r.tenant_id = $2 AND r.status = 'draft'`,
    [runId, tenantId, adjustmentId, approved],
  );
  return (rowCount ?? 0) > 0 ? { ok: true } : notDraft(tenantId, runId);
}

export async function deleteAdjustment(
  tenantId: string,
  runId: string,
  adjustmentId: string,
  actor: { userId: string | null; role: string },
): Promise<DraftResult> {
  const owner = await query<{ item_id: string }>(`SELECT item_id FROM payroll_adjustments WHERE id = $1 AND run_id = $2`, [
    adjustmentId,
    runId,
  ]);
  if (!owner.rows[0]) return { ok: false, code: "NOT_FOUND" };
  if (actor.role === "MANAGER" && actor.userId && (await isOwnLine(owner.rows[0].item_id, actor.userId))) {
    return { ok: false, code: "OWN_PAY" };
  }
  const { rowCount } = await query(
    `DELETE FROM payroll_adjustments a USING payroll_runs r
      WHERE a.id = $3 AND a.run_id = r.id AND r.id = $1 AND r.tenant_id = $2 AND r.status = 'draft' AND a.kind = 'manual'`,
    [runId, tenantId, adjustmentId],
  );
  return (rowCount ?? 0) > 0 ? { ok: true } : notDraft(tenantId, runId);
}

export async function deleteDraftRun(tenantId: string, runId: string): Promise<DraftResult> {
  const { rowCount } = await query(`DELETE FROM payroll_runs WHERE id = $1 AND tenant_id = $2 AND status = 'draft'`, [
    runId,
    tenantId,
  ]);
  return (rowCount ?? 0) > 0 ? { ok: true } : notDraft(tenantId, runId);
}

// ── Approve ──────────────────────────────────────────────────────────────────

export type ApproveResult =
  | { ok: true; reference: string; totalPayableCents: number; headcount: number }
  | { ok: false; code: "NOT_FOUND" | "NOT_DRAFT" | "OWN_PAY" }
  | { ok: false; code: "BLOCKED"; blockers: string[] };

/**
 * Approve a draft: re-checks every blocker server-side (rates confirmed, no
 * timecard needing review in the period), refuses a MANAGER approving a run
 * that contains their own pay line, then freezes each line's payable amount and
 * locks the run. One transaction; the run row is locked against a double click.
 */
export async function approveRun(
  tenantId: string,
  runId: string,
  approver: { userId: string | null; role: string },
): Promise<ApproveResult> {
  const detail = await getPayrollRun(tenantId, runId);
  if (!detail) return { ok: false, code: "NOT_FOUND" };
  if (detail.status !== "draft") return { ok: false, code: "NOT_DRAFT" };
  if (approver.role === "MANAGER" && approver.userId) {
    const own = await query(
      `SELECT 1 FROM payroll_items i JOIN employees e ON e.id = i.employee_id WHERE i.run_id = $1 AND e.user_id = $2`,
      [runId, approver.userId],
    );
    if ((own.rowCount ?? 0) > 0) return { ok: false, code: "OWN_PAY" };
  }
  if (detail.blockers.length > 0) return { ok: false, code: "BLOCKED", blockers: detail.blockers };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (!(await lockDraft(client, tenantId, runId))) {
      await client.query("ROLLBACK");
      return { ok: false, code: "NOT_DRAFT" };
    }
    let total = 0;
    for (const l of detail.lines) {
      const pay = payableCents(l.baseCents, l.adjustments);
      total += pay;
      await client.query(`UPDATE payroll_items SET payable_cents = $2 WHERE id = $1`, [l.id, pay]);
    }
    await client.query(
      `UPDATE payroll_runs SET status = 'approved', approved_by = $2, approved_at = now(), total_payable_cents = $3
        WHERE id = $1`,
      [runId, approver.userId, total],
    );
    await client.query("COMMIT");
    return { ok: true, reference: detail.reference, totalPayableCents: total, headcount: detail.lines.length };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** CSV of an APPROVED run's final payable figures (pesos, 2 decimals). */
export function payrollCsv(run: PayrollRunDetail): string {
  const peso = (c: number) => (c / 100).toFixed(2);
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const head = [
    "Employee",
    "Period",
    "Present days",
    "Half-days",
    "Absent days",
    "Leave days",
    "Hours worked",
    "Regular hours",
    "Daily rate",
    "Base earnings",
    "Approved adjustments",
    "Final payable",
  ];
  const rows = run.lines.map((l) =>
    [
      esc(l.name),
      `${run.periodStart} to ${run.periodEnd}`,
      l.presentDays,
      l.halfDays,
      l.absentDays,
      l.leaveDays,
      hoursLabel(l.workedMinutes),
      hoursLabel(l.regularMinutes),
      peso(l.dailyRateCents),
      peso(l.baseCents),
      peso(l.approvedAdjustmentsCents),
      peso(l.payableCents),
    ].join(","),
  );
  const total = ["TOTAL", "", "", "", "", "", "", "", "", "", "", peso(run.totalPayableCents)].join(",");
  return [head.join(","), ...rows, total].join("\n") + "\n";
}
