/**
 * Dev-database smoke test for server-side pagination. Read-only: it signs a
 * session for an existing store owner (and the Super Admin) and pages through
 * the real endpoints, checking that pages don't overlap, that `total` matches a
 * direct count, and that the KPI totals cover every row, not one page.
 *
 *   npx tsx scripts/smoke-paging.ts
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
const cookie = (userId: string, tenantId: string | null, role: Role) =>
  `${env.session.cookieName}=${signSession({ userId, tenantId, role, email: "smoke@example.com", name: "Smoke" })}`;

async function pages(path: string, c: string, key: string) {
  const p1 = await request(app).get(`${path}${path.includes("?") ? "&" : "?"}page=1&pageSize=5`).set("Cookie", c);
  const p2 = await request(app).get(`${path}${path.includes("?") ? "&" : "?"}page=2&pageSize=5`).set("Cookie", c);
  const ids1 = (p1.body[key] ?? []).map((r: { id: string }) => r.id);
  const ids2 = (p2.body[key] ?? []).map((r: { id: string }) => r.id);
  return { p1, p2, ids1, ids2 };
}

async function main() {
  // The store with the most activity, so there is something to page through.
  const top = await query<{ tenant_id: string; n: string }>(
    `SELECT tenant_id, count(*) AS n FROM pos_audit_logs GROUP BY tenant_id ORDER BY n DESC LIMIT 1`,
  );
  const tenantId = top.rows[0]?.tenant_id;
  if (!tenantId) throw new Error("No activity on this database to page through.");
  const owner = await query<{ id: string }>(`SELECT id FROM users WHERE tenant_id = $1 AND role = 'MERCHANT_OWNER' LIMIT 1`, [tenantId]);
  const c = cookie(owner.rows[0].id, tenantId, "MERCHANT_OWNER");

  // Activity log
  const real = Number((await query<{ n: string }>(`SELECT count(*) AS n FROM pos_audit_logs WHERE tenant_id = $1`, [tenantId])).rows[0].n);
  const a = await pages("/api/v1/pos/audit", c, "logs");
  check("activity: total matches a direct count", a.p1.body.total === real, `${a.p1.body.total} vs ${real}`);
  check("activity: page 1 has 5 rows", a.ids1.length === Math.min(5, real));
  check("activity: pages 1 and 2 don't overlap", a.ids2.every((id: string) => !a.ids1.includes(id)));
  check("activity: KPI total covers every row, not one page", a.p1.body.summary.total === real);
  const big = await request(app).get("/api/v1/pos/audit?pageSize=5000").set("Cookie", c);
  check("activity: page size is capped at 100", big.body.pageSize === 100 && big.body.logs.length <= 100);

  // Refunds & voids
  const realRev = Number(
    (await query<{ n: string }>(`SELECT count(*) AS n FROM sales WHERE tenant_id = $1 AND kind IN ('void','return')`, [tenantId])).rows[0].n,
  );
  const r = await pages("/api/v1/pos/reversals", c, "reversals");
  check("reversals: total + summary cover every reversal", r.p1.body.total === realRev && r.p1.body.summary.total === realRev, `${r.p1.body.total} vs ${realRev}`);
  check("reversals: pages don't overlap", r.ids2.every((id: string) => !r.ids1.includes(id)));

  // POS sales picker
  const realSales = Number((await query<{ n: string }>(`SELECT count(*) AS n FROM sales WHERE tenant_id = $1 AND kind = 'sale'`, [tenantId])).rows[0].n);
  const s = await pages("/api/v1/pos/sales", c, "sales");
  check("sales picker: total matches; pages don't overlap", s.p1.body.total === realSales && s.ids2.every((id: string) => !s.ids1.includes(id)), `${s.p1.body.total} vs ${realSales}`);

  // Drawer audit, now served by the POS router
  const realShifts = Number(
    (await query<{ n: string }>(`SELECT count(*) AS n FROM cashier_shifts WHERE tenant_id = $1 AND status = 'closed' AND closed_at >= now() - interval '30 days'`, [tenantId])).rows[0].n,
  );
  const d = await request(app).get("/api/v1/pos/shift-reconciliations").set("Cookie", c);
  check("drawer audit: served from POS for the owner", d.status === 200 && Array.isArray(d.body.report?.rows), `status ${d.status}`);
  check("drawer audit: covers the last 30 days of closed shifts", d.body.report?.rows?.length === realShifts, `${d.body.report?.rows?.length} vs ${realShifts}`);

  // Super Admin audit trail
  const admin = await query<{ id: string }>(`SELECT id FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1`);
  if (admin.rows[0]) {
    const realAdmin = Number((await query<{ n: string }>(`SELECT count(*) AS n FROM admin_audit_logs`)).rows[0].n);
    const t = await pages("/api/v1/admin/audit", cookie(admin.rows[0].id, null, "SUPER_ADMIN"), "entries");
    check("admin audit: total matches; pages don't overlap", t.p1.body.total === realAdmin && t.ids2.every((id: string) => !t.ids1.includes(id)), `${t.p1.body.total} vs ${realAdmin}`);
  } else {
    console.log("SKIP  admin audit — no Super Admin on this database");
  }
}

main()
  .catch((err) => {
    failures++;
    console.error("smoke test crashed:", err);
  })
  .finally(async () => {
    await pool.end();
    console.log(failures === 0 ? "\nALL SMOKE CHECKS PASSED" : `\n${failures} SMOKE CHECK(S) FAILED`);
    process.exit(failures === 0 ? 0 : 1);
  });
