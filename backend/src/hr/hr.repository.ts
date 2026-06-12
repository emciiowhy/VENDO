import { pool, query } from "../db.js";
import type {
  AttendanceRow,
  AttendanceUpsertInput,
  Employee,
  EmployeeCreateInput,
  EmployeeUpdateInput,
  PayrollItem,
  PayrollRunDetail,
  PayrollRunInput,
  PayrollRunSummary,
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
  created_at: Date;
  updated_at: Date;
}

function toIsoDate(d: Date): string {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
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
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const EMP_COLUMNS = `id, user_id, name, position, employment_type, pay_type, pay_rate_cents,
  hire_date, phone, email, note, is_active, created_at, updated_at`;

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
       (tenant_id, name, position, employment_type, pay_type, pay_rate_cents, hire_date, phone, email, note, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
  if (input.isActive !== undefined) set("is_active", input.isActive);
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
