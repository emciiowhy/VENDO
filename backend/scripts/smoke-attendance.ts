/**
 * Dev-database smoke test for attendance (capstone step 3). Drives the REAL HTTP
 * routes in-process (supertest + createApp) against DATABASE_URL — run it on the
 * dev branch only. It adds a temporary employee linked to a staff login in an
 * Enterprise store (one who is NOT on the clock, so no real open timecard is
 * touched), backdates a few timecards into February 2025, checks the derived
 * statuses, exercises the forgotten-Shift-Out flow end to end, then deletes
 * everything it created. Prints counts and statuses only — no names or emails.
 *
 *   npx tsx scripts/smoke-attendance.ts
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
const cookie = (u: User) =>
  `${env.session.cookieName}=${signSession({ userId: u.user_id, tenantId: u.tenant_id, role: u.role, email: u.email, name: u.name })}`;

const created = { employee: null as string | null, cards: [] as string[] };

async function addCard(u: User, inAt: string, outAt: string | null): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO timecards (tenant_id, user_id, clock_in, clock_out, status)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [u.tenant_id, u.user_id, inAt, outAt, outAt ? "COMPLETED" : "ACTIVE"],
  );
  created.cards.push(rows[0].id);
  return rows[0].id;
}

type Day = { date: string; status: string; workedMinutes: number; breakMinutes: number };

async function main() {
  const owners = await query<User & { tier: string }>(
    `SELECT u.id AS user_id, u.tenant_id, u.name, u.email, u.role, t.tier
       FROM users u JOIN tenants t ON t.id = u.tenant_id
      WHERE u.role = 'MERCHANT_OWNER' AND u.status = 'active'`,
  );
  // The worker whose clock we use: any Enterprise store's staff member who is
  // not on the clock right now (so no real open timecard is touched), and that
  // store's owner for the People & Payroll calls.
  let owner: User | undefined;
  let worker: User | undefined;
  for (const o of owners.rows.filter((x) => x.tier === "ENTERPRISE")) {
    const workers = await query<User>(
      `SELECT u.id AS user_id, u.tenant_id, u.name, u.email, u.role FROM users u
        WHERE u.tenant_id = $1 AND u.status = 'active' AND u.role IN ('CASHIER', 'MANAGER', 'MERCHANT_OWNER')
          AND NOT EXISTS (SELECT 1 FROM timecards t WHERE t.user_id = u.id AND t.status = 'ACTIVE')
        ORDER BY (u.role = 'MERCHANT_OWNER'), u.id LIMIT 1`,
      [o.tenant_id],
    );
    if (workers.rows[0]) {
      owner = o;
      worker = workers.rows[0];
      break;
    }
  }
  if (!owner || !worker) throw new Error("No Enterprise store has a staff member off the clock.");
  // Another ENTERPRISE store, so the request passes the plan gate and the
  // store fence itself is what answers (404, never another store's card).
  const otherOwner = owners.rows.find((o) => o.tier === "ENTERPRISE" && o.tenant_id !== owner!.tenant_id);
  console.log(`info  worker role: ${worker.role}`);

  const emp = await query<{ id: string }>(
    `INSERT INTO employees (tenant_id, user_id, name, position, work_days, standard_daily_hours, unpaid_break_minutes)
     VALUES ($1, $2, 'SMOKE Attendance', 'Smoke test', '{1,2,3,4,5,6}', 8, 60) RETURNING id`,
    [owner.tenant_id, worker.user_id],
  );
  created.employee = emp.rows[0].id;

  // Feb 2025: Mon 3rd full day, Tue 4th short day, Wed 5th nothing, Sun 9th rest.
  await addCard(worker, "2025-02-03T08:00:00+08:00", "2025-02-03T17:00:00+08:00");
  await addCard(worker, "2025-02-04T08:00:00+08:00", "2025-02-04T11:00:00+08:00");

  let days: Day[] = [];
  let summary: { presentDays: number; halfDays: number } = { presentDays: 0, halfDays: 0 };
  const load = async () => {
    const res = await request(app)
      .get(`/api/v1/hr/employees/${created.employee}/attendance?month=2025-02`)
      .set("Cookie", cookie(owner));
    days = res.body.days ?? [];
    summary = res.body.summary;
    return res.status;
  };
  const day = (d: string) => days.find((x) => x.date === d)!;

  check("attendance report loads", (await load()) === 200);
  check("Mon: 9h on the clock − 60 min break = 8h, present", day("2025-02-03").status === "present" && day("2025-02-03").workedMinutes === 480);
  check("Tue: 3h, no break → half-day", day("2025-02-04").status === "half_day" && day("2025-02-04").breakMinutes === 0);
  check("Wed: scheduled, no punch → absent", day("2025-02-05").status === "absent");
  check("Sun: not scheduled → rest day", day("2025-02-09").status === "rest_day");

  // Forgotten Shift Out on Thu 6th; today's Shift In auto-closes it for review.
  const stale = await addCard(worker, "2025-02-06T08:00:00+08:00", null);
  const cin = await request(app).post("/api/v1/merchant/shifts/clock-in").set("Cookie", cookie(worker)).set("Origin", ORIGIN);
  if (cin.body.timecard?.id) created.cards.push(cin.body.timecard.id);
  check("Shift In is not blocked by an old open card", cin.status === 201, `status ${cin.status}`);
  const flagged = await query<{ needs_review: boolean; status: string }>(
    `SELECT needs_review, status FROM timecards WHERE id = $1`,
    [stale],
  );
  check("the forgotten card was auto-closed and flagged", flagged.rows[0]?.needs_review === true && flagged.rows[0]?.status === "COMPLETED");
  await load();
  check("Thu shows needs review at 0 hours", day("2025-02-06").status === "needs_review" && day("2025-02-06").workedMinutes === 0);

  if (otherOwner) {
    const theirs = await request(app)
      .patch(`/api/v1/hr/timecards/${stale}`)
      .set("Cookie", cookie(otherOwner))
      .set("Origin", ORIGIN)
      .send({ clockOut: "2025-02-06T17:00:00+08:00" });
    check("another store's owner can't correct this card (store fence → 404)", theirs.status === 404, `status ${theirs.status}`);
  }
  const fix = await request(app)
    .patch(`/api/v1/hr/timecards/${stale}`)
    .set("Cookie", cookie(owner))
    .set("Origin", ORIGIN)
    .send({ clockOut: "2025-02-06T17:00:00+08:00" });
  check("manager enters the real Time Out", fix.status === 200, `status ${fix.status}`);
  await load();
  check("Thu is now present with 8h", day("2025-02-06").status === "present" && day("2025-02-06").workedMinutes === 480);
  await new Promise((r) => setTimeout(r, 400));
  const logged = await query(`SELECT 1 FROM pos_audit_logs WHERE action = 'timecard_corrected' AND ref_id = $1`, [stale]);
  check("the correction is on the activity log", (logged.rowCount ?? 0) > 0);
  await request(app).post("/api/v1/merchant/shifts/clock-out").set("Cookie", cookie(worker)).set("Origin", ORIGIN);

  check("summary: 2 present (Mon, Thu), 1 half-day", summary.presentDays === 2 && summary.halfDays === 1, JSON.stringify(summary));
}

main()
  .catch((err) => {
    failures++;
    console.error("smoke test crashed:", err);
  })
  .finally(async () => {
    // Remove everything this run created (activity-log rows stay: the log is append-only).
    if (created.cards.length) await query(`DELETE FROM timecards WHERE id = ANY($1)`, [created.cards]);
    if (created.employee) await query(`DELETE FROM employees WHERE id = $1`, [created.employee]);
    await pool.end();
    console.log(failures === 0 ? "\nALL SMOKE CHECKS PASSED" : `\n${failures} SMOKE CHECK(S) FAILED`);
    process.exit(failures === 0 ? 0 : 1);
  });
