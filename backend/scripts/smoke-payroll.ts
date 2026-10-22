/**
 * Dev-database smoke test for payroll (capstone step 4). Drives the REAL HTTP
 * routes in-process against DATABASE_URL — run it on the dev branch only.
 *
 * In an Enterprise store it adds a temporary employee (linked to an off-the-
 * clock staff login), backdates a week of timecards into March 2025, starts a
 * draft run, and walks the whole review: suggested daily rate → blockers →
 * self-approval refusal → missing Shift Out → overtime + manual adjustment →
 * approve → lock → CSV → overlap refusal. The draft also contains the store's
 * real employees; their daily rates are recorded first and restored at the end,
 * and the run itself is deleted. Prints amounts and statuses — no names.
 *
 *   npx tsx scripts/smoke-payroll.ts
 */
import "dotenv/config";
import request from "supertest";
import { pool, query } from "../src/db.js";
import { createApp } from "../src/app.js";
import { signSession } from "../src/auth/auth.jwt.js";
import { env } from "../src/env.js";
import type { Role } from "../src/auth/auth.types.js";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
}

const app = createApp();
const ORIGIN = env.corsOrigins[0];
type User = { user_id: string; tenant_id: string; name: string; email: string; role: Role };
const cookie = (u: User, role: Role = u.role) =>
  `${env.session.cookieName}=${signSession({ userId: u.user_id, tenantId: u.tenant_id, role, email: u.email, name: u.name })}`;

const created = { employee: null as string | null, cards: [] as string[], runs: [] as string[] };
let restoreRates: { id: string; daily_rate_cents: number | null }[] = [];

async function addCard(u: User, inAt: string, outAt: string | null) {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO timecards (tenant_id, user_id, clock_in, clock_out, status) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [u.tenant_id, u.user_id, inAt, outAt, outAt ? "COMPLETED" : "ACTIVE"],
  );
  created.cards.push(rows[0].id);
  return rows[0].id;
}

type Line = {
  id: string;
  employeeId: string;
  rateConfirmed: boolean;
  dailyRateCents: number;
  baseCents: number;
  payableCents: number;
  regularMinutes: number;
  overtimeMinutes: number;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  adjustments: { id: string; kind: string; amountCents: number; approved: boolean }[];
};

async function main() {
  const owners = await query<User & { tier: string }>(
    `SELECT u.id AS user_id, u.tenant_id, u.name, u.email, u.role, t.tier
       FROM users u JOIN tenants t ON t.id = u.tenant_id
      WHERE u.role = 'MERCHANT_OWNER' AND u.status = 'active' AND t.tier = 'ENTERPRISE'`,
  );
  let owner: User | undefined;
  let worker: User | undefined;
  for (const o of owners.rows) {
    const w = await query<User>(
      `SELECT u.id AS user_id, u.tenant_id, u.name, u.email, u.role FROM users u
        WHERE u.tenant_id = $1 AND u.status = 'active' AND u.role IN ('CASHIER', 'MANAGER')
          AND NOT EXISTS (SELECT 1 FROM timecards t WHERE t.user_id = u.id AND t.status = 'ACTIVE')
        LIMIT 1`,
      [o.tenant_id],
    );
    if (w.rows[0]) {
      owner = o;
      worker = w.rows[0];
      break;
    }
  }
  if (!owner || !worker) throw new Error("No Enterprise store with an off-the-clock cashier/manager.");
  const T = owner.tenant_id;

  const clash = await query(`SELECT 1 FROM payroll_runs WHERE tenant_id = $1 AND period_start <= '2025-03-08' AND period_end >= '2025-03-03'`, [T]);
  if (clash.rowCount) throw new Error("This store already has a payroll run in 3–8 Mar 2025; pick another week.");

  restoreRates = (await query<{ id: string; daily_rate_cents: number | null }>(`SELECT id, daily_rate_cents FROM employees WHERE tenant_id = $1`, [T])).rows;

  const emp = await query<{ id: string }>(
    `INSERT INTO employees (tenant_id, user_id, name, position, pay_type, pay_rate_cents, work_days, standard_daily_hours, unpaid_break_minutes)
     VALUES ($1, $2, 'SMOKE Payroll', 'Smoke test', 'Daily', 60000, '{1,2,3,4,5,6}', 8, 60) RETURNING id`,
    [T, worker.user_id],
  );
  created.employee = emp.rows[0].id;

  // Mon 3: 9h (−1h break) = 8h · Tue 4: 7h = 6h · Wed 5: 11h = 10h (2h OT) · Thu 6: none · Fri 7: Leave · Sat 8: none
  await addCard(worker, "2025-03-03T08:00:00+08:00", "2025-03-03T17:00:00+08:00");
  await addCard(worker, "2025-03-04T08:00:00+08:00", "2025-03-04T15:00:00+08:00");
  await addCard(worker, "2025-03-05T08:00:00+08:00", "2025-03-05T19:00:00+08:00");
  await query(
    `INSERT INTO attendance (tenant_id, employee_id, work_date, status, hours, note) VALUES ($1, $2, '2025-03-07', 'Leave', 0, 'smoke')`,
    [T, created.employee],
  );

  const asOwner = (r: request.Test) => r.set("Cookie", cookie(owner!)).set("Origin", ORIGIN);
  const asManagerSelf = (r: request.Test) => r.set("Cookie", cookie(worker!, "MANAGER")).set("Origin", ORIGIN);

  const startRes = await asOwner(request(app).post("/api/v1/hr/payroll")).send({ periodStart: "2025-03-03", periodEnd: "2025-03-08" });
  check("draft run created", startRes.status === 201, `status ${startRes.status}`);
  const runId: string = startRes.body.run?.id;
  if (runId) created.runs.push(runId);
  const mine = (run: { lines: Line[] }) => run.lines.find((l) => l.employeeId === created.employee)!;

  let run = startRes.body.run;
  let l = mine(run);
  check("status is draft", run.status === "draft");
  check("rate is a suggestion (unconfirmed) from the old Daily ₱600", !l.rateConfirmed && l.dailyRateCents === 60000);
  check("counts: 3 present, 1 leave, 2 absent (Thu, Sat)", l.presentDays === 3 && l.leaveDays === 1 && l.absentDays === 2, `${l.presentDays}/${l.leaveDays}/${l.absentDays}`);
  check("regular = 8h + 6h + 8h = 22h; overtime = 2h", l.regularMinutes === 1320 && l.overtimeMinutes === 120);
  check("base = ₱600 ÷ 8 × 22h = ₱1,650.00", l.baseCents === 165000, `${l.baseCents}`);
  const ot = l.adjustments.find((a) => a.kind === "overtime");
  const leave = l.adjustments.find((a) => a.kind === "paid_leave");
  check("overtime suggested at 125% = ₱187.50, not approved", ot?.amountCents === 18750 && ot?.approved === false);
  check("paid leave suggested = ₱600, not approved", leave?.amountCents === 60000 && leave?.approved === false);
  check("payable = base until something is approved", l.payableCents === 165000);
  check("approval is blocked by unconfirmed rates", run.blockers.some((b: string) => b.includes("daily rate")));

  // A manager can't touch or approve their own pay line.
  const selfRate = await asManagerSelf(request(app).put(`/api/v1/hr/payroll/${runId}/lines/${l.id}/rate`)).send({ dailyRateCents: 99900 });
  check("manager can't set their own daily rate (403)", selfRate.status === 403, `status ${selfRate.status}`);
  const selfEmp = await asManagerSelf(request(app).patch(`/api/v1/hr/employees/${created.employee}`)).send({ dailyRate: "999" });
  check("manager can't raise their own rate on the employee record (403)", selfEmp.status === 403, `status ${selfEmp.status}`);

  // Owner confirms every rate in the run (real employees' rates restored at the end).
  for (const line of run.lines as Line[]) {
    const r = await asOwner(request(app).put(`/api/v1/hr/payroll/${runId}/lines/${line.id}/rate`)).send({ dailyRateCents: line.dailyRateCents });
    run = r.body.run;
  }
  l = mine(run);
  check("rates confirmed; base unchanged", l.rateConfirmed && l.baseCents === 165000);
  const empRate = await query<{ daily_rate_cents: number }>(`SELECT daily_rate_cents FROM employees WHERE id = $1`, [created.employee]);
  check("confirmed rate saved on the employee record", empRate.rows[0]?.daily_rate_cents === 60000);

  // A missing Shift Out in the period blocks approval until fixed.
  const stale = await addCard(worker, "2025-03-08T08:00:00+08:00", null);
  run = (await asOwner(request(app).post(`/api/v1/hr/payroll/${runId}/recalculate`))).body.run;
  check("missing Shift Out blocks approval", run.blockers.some((b: string) => b.includes("Shift Out")));
  const blocked = await asOwner(request(app).post(`/api/v1/hr/payroll/${runId}/approve`));
  check("server refuses to approve while blocked (409)", blocked.status === 409, `status ${blocked.status}`);
  await asOwner(request(app).patch(`/api/v1/hr/timecards/${stale}`)).send({ clockOut: "2025-03-08T12:00:00+08:00" });
  run = (await asOwner(request(app).post(`/api/v1/hr/payroll/${runId}/recalculate`))).body.run;
  l = mine(run);
  check("after the fix + recalc: Sat 4h added → base ₱1,950.00, no blockers", l.baseCents === 195000 && run.blockers.length === 0, `${l.baseCents}`);

  // Approve the overtime, add a cash-advance deduction; leave stays unapproved.
  const otNow = l.adjustments.find((a) => a.kind === "overtime")!;
  run = (await asOwner(request(app).patch(`/api/v1/hr/payroll/${runId}/adjustments/${otNow.id}`)).send({ approved: true })).body.run;
  run = (await asOwner(request(app).post(`/api/v1/hr/payroll/${runId}/lines/${l.id}/adjustments`)).send({ label: "Cash advance", amountCents: -50000 })).body.run;
  l = mine(run);
  check("payable = 1,950 + 187.50 − 500 = ₱1,637.50", l.payableCents === 163750, `${l.payableCents}`);

  const selfApprove = await asManagerSelf(request(app).post(`/api/v1/hr/payroll/${runId}/approve`));
  check("manager can't approve a run with their own pay in it (403)", selfApprove.status === 403, `status ${selfApprove.status}`);

  const approved = await asOwner(request(app).post(`/api/v1/hr/payroll/${runId}/approve`));
  check("owner approves", approved.status === 200 && approved.body.run?.status === "approved", `status ${approved.status}`);
  check("approved payable frozen at ₱1,637.50", mine(approved.body.run).payableCents === 163750);

  const late = await asOwner(request(app).put(`/api/v1/hr/payroll/${runId}/lines/${l.id}/rate`)).send({ dailyRateCents: 70000 });
  check("an approved run is locked (409)", late.status === 409, `status ${late.status}`);
  const del = await asOwner(request(app).delete(`/api/v1/hr/payroll/${runId}`));
  check("an approved run can't be deleted (409)", del.status === 409, `status ${del.status}`);

  const csv = await request(app).get(`/api/v1/hr/payroll/${runId}/csv`).set("Cookie", cookie(owner));
  check("CSV export has the line and total", csv.status === 200 && csv.text.includes("SMOKE Payroll") && csv.text.includes("1637.50"));

  const overlap = await asOwner(request(app).post("/api/v1/hr/payroll")).send({ periodStart: "2025-03-05", periodEnd: "2025-03-12" });
  check("a run overlapping an existing one is refused (409)", overlap.status === 409, `status ${overlap.status}`);

  await new Promise((r) => setTimeout(r, 400));
  const logged = await query(`SELECT 1 FROM pos_audit_logs WHERE action = 'payroll_approved' AND ref_id = $1`, [runId]);
  check("approval is on the activity log", (logged.rowCount ?? 0) > 0);
}

main()
  .catch((err) => {
    failures++;
    console.error("smoke test crashed:", err);
  })
  .finally(async () => {
    // Clean up: the run (cascades to lines/adjustments), timecards, the leave
    // entry, the temp employee, and every real employee's original daily rate.
    if (created.runs.length) await query(`DELETE FROM payroll_runs WHERE id = ANY($1)`, [created.runs]);
    if (created.cards.length) await query(`DELETE FROM timecards WHERE id = ANY($1)`, [created.cards]);
    if (created.employee) {
      await query(`DELETE FROM attendance WHERE employee_id = $1`, [created.employee]);
      await query(`DELETE FROM employees WHERE id = $1`, [created.employee]);
    }
    for (const r of restoreRates) await query(`UPDATE employees SET daily_rate_cents = $2 WHERE id = $1`, [r.id, r.daily_rate_cents]);
    await pool.end();
    console.log(failures === 0 ? "\nALL SMOKE CHECKS PASSED" : `\n${failures} SMOKE CHECK(S) FAILED`);
    process.exit(failures === 0 ? 0 : 1);
  });
