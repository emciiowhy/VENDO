import { query } from "../db.js";
import {
  processPayroll,
  type PayrollEmployee,
  type PayrollReport,
  type PayrollTimecard,
} from "./payroll.processor.js";

/**
 * Data access for the Automated Payroll Exporter. EVERY query is scoped by
 * `tenantId` (read from the verified session, never the request) so a manager
 * can only ever export their OWN store's labour — the calculation engine
 * (payroll.processor.ts) is pure and never sees a tenant id. Hours come from the
 * labor clock (timecards); the employee roster supplies the pay rates.
 */
const MNL = "Asia/Manila";

/**
 * Build a priced payroll report for [from, to] (inclusive Manila dates). Pulls
 * every active employee plus the COMPLETED punches whose clock-in falls in the
 * window (the same attribution the labor-analytics view uses), and prices them
 * with the requested night-differential treatment. Optionally narrows to a
 * single employee for the filtered preview.
 */
export async function buildPayrollExport(
  tenantId: string,
  from: string,
  to: string,
  includeNightDifferential: boolean,
  employeeId?: string,
): Promise<PayrollReport> {
  const [empRes, tcRes] = await Promise.all([
    query<{
      id: string;
      user_id: string | null;
      name: string;
      position: string | null;
      pay_type: string;
      pay_rate_cents: number;
    }>(
      `SELECT id, user_id, name, position, pay_type, pay_rate_cents
         FROM employees
        WHERE tenant_id = $1 AND is_active = TRUE
          AND ($2::uuid IS NULL OR id = $2)
        ORDER BY lower(name) ASC`,
      [tenantId, employeeId ?? null],
    ),
    query<{ user_id: string; clock_in: Date; clock_out: Date }>(
      `SELECT user_id, clock_in, clock_out
         FROM timecards
        WHERE tenant_id = $1
          AND status = 'COMPLETED'
          AND clock_out IS NOT NULL
          AND (clock_in AT TIME ZONE $4)::date BETWEEN $2 AND $3`,
      [tenantId, from, to, MNL],
    ),
  ]);

  const employees: PayrollEmployee[] = empRes.rows.map((e) => ({
    id: e.id,
    name: e.name,
    position: e.position,
    payType: e.pay_type,
    payRateCents: e.pay_rate_cents,
    userId: e.user_id,
  }));

  const timecards: PayrollTimecard[] = tcRes.rows.map((t) => ({
    userId: t.user_id,
    clockIn: t.clock_in.toISOString(),
    clockOut: t.clock_out.toISOString(),
  }));

  return processPayroll(employees, timecards, from, to, { includeNightDifferential });
}
