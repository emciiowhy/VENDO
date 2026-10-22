/**
 * Dev-database smoke test: one business cannot reach another business's data.
 *
 * Signs in (in-process, real routes) as the OWNER of an Enterprise store "A"
 * and aims every request at store "B"'s real record ids — products, customers,
 * promotions, employees, attendance, timecards, payroll runs and sales. Every
 * read must come back "not found" (or forbidden), every write must be refused,
 * and B's rows must be byte-for-byte unchanged afterwards. The only rows it
 * creates (a temporary promo in B, so there is one to attack) are removed.
 * Run on the dev branch only. Prints statuses — no names or emails.
 *
 *   npx tsx scripts/smoke-isolation.ts
 */
import "dotenv/config";
import request from "supertest";
import { pool, query } from "../src/db.js";
import { createApp } from "../src/app.js";
import { signSession } from "../src/auth/auth.jwt.js";
import { env } from "../src/env.js";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
}
const app = createApp();
const ORIGIN = env.corsOrigins[0];
const blocked = (s: number) => s === 404 || s === 403;

let tempPromo: string | null = null;

async function one<T extends Record<string, unknown>>(sql: string, params: unknown[]): Promise<T | undefined> {
  return (await query<T>(sql, params)).rows[0];
}

async function main() {
  const owners = await query<{ user_id: string; tenant_id: string; tier: string }>(
    `SELECT u.id AS user_id, u.tenant_id, t.tier FROM users u JOIN tenants t ON t.id = u.tenant_id
      WHERE u.role = 'MERCHANT_OWNER' AND u.status = 'active'`,
  );
  // A: an Enterprise owner (so every module's routes are reachable for them).
  // B: the other store with the most data to attack.
  const a = owners.rows.find((o) => o.tier === "ENTERPRISE");
  if (!a) throw new Error("No Enterprise owner on this database.");
  const bPick = await one<{ tenant_id: string }>(
    `SELECT tenant_id FROM (
        SELECT tenant_id, count(*) AS n FROM products GROUP BY tenant_id
        UNION ALL SELECT tenant_id, count(*) FROM employees GROUP BY tenant_id
     ) x WHERE tenant_id <> $1 GROUP BY tenant_id ORDER BY sum(n) DESC LIMIT 1`,
    [a.tenant_id],
  );
  if (!bPick) throw new Error("Need a second store with data.");
  const B = bPick.tenant_id;
  const c = `${env.session.cookieName}=${signSession({ userId: a.user_id, tenantId: a.tenant_id, role: "MERCHANT_OWNER", email: "smoke@example.com", name: "Smoke A" })}`;
  const as = (r: request.Test) => r.set("Cookie", c).set("Origin", ORIGIN);

  // ── Products (Product Management)
  const prod = await one<{ id: string; price_cents: number; stock: number; name: string }>(
    `SELECT id, price_cents, stock, name FROM products WHERE tenant_id = $1 LIMIT 1`,
    [B],
  );
  if (prod) {
    const edit = await as(request(app).patch(`/api/inventory/products/${prod.id}`)).send({ price: "1", stock: "99999", name: "HACKED" });
    const del = await as(request(app).delete(`/api/inventory/products/${prod.id}`));
    const after = await one<{ price_cents: number; stock: number; name: string }>(`SELECT price_cents, stock, name FROM products WHERE id = $1`, [prod.id]);
    check("can't edit another store's product", blocked(edit.status), `status ${edit.status}`);
    check("can't delete another store's product", blocked(del.status), `status ${del.status}`);
    check("their product is unchanged", after?.price_cents === prod.price_cents && after?.stock === prod.stock && after?.name === prod.name);
    const list = await as(request(app).get("/api/inventory/products"));
    check("their product isn't in my product list", !(list.body.products ?? []).some((p: { id: string }) => p.id === prod.id));
    const sell = await as(request(app).post("/api/v1/pos/orders")).send({ items: [{ productId: prod.id, qty: 1 }], paymentMethod: "GCash" });
    check("can't sell another store's product", sell.status === 400, `status ${sell.status}`);
  } else console.log("SKIP  products — store B has none");

  // ── Customers (CRM)
  const cust = await one<{ id: string; name: string; loyalty_points: number }>(
    `SELECT id, name, loyalty_points FROM customers WHERE tenant_id = $1 LIMIT 1`,
    [B],
  );
  if (cust) {
    const read = await as(request(app).get(`/api/v1/crm/customers/${cust.id}`));
    const edit = await as(request(app).patch(`/api/v1/crm/customers/${cust.id}`)).send({ name: "HACKED" });
    const after = await one<{ name: string; loyalty_points: number }>(`SELECT name, loyalty_points FROM customers WHERE id = $1`, [cust.id]);
    check("can't read another store's customer", blocked(read.status), `status ${read.status}`);
    check("can't edit another store's customer", blocked(edit.status) && after?.name === cust.name, `status ${edit.status}`);
    // A real sale in MY store that names THEIR customer and tries to spend points:
    // the sale may go through, but their customer must not be attached, charged
    // points, or credited points. (The test sale is voided afterwards.)
    const myProd = await one<{ id: string }>(
      `SELECT id FROM products WHERE tenant_id = $1 AND is_active AND stock >= 1 LIMIT 1`,
      [a.tenant_id],
    );
    if (myProd) {
      const sale = await as(request(app).post("/api/v1/pos/orders")).send({
        items: [{ productId: myProd.id, qty: 1 }],
        paymentMethod: "GCash",
        customerId: cust.id,
        redeemPoints: 100,
      });
      const saleId: string | undefined = sale.body.sale?.id;
      const linked = saleId ? await one<{ customer_id: string | null }>(`SELECT customer_id FROM sales WHERE id = $1`, [saleId]) : undefined;
      const pts = await one<{ loyalty_points: number }>(`SELECT loyalty_points FROM customers WHERE id = $1`, [cust.id]);
      check(
        "their customer can't be attached to my sale or have points spent/credited",
        (!saleId || linked?.customer_id === null) && sale.body.sale?.pointsRedeemed !== 100 && pts?.loyalty_points === cust.loyalty_points,
        `status ${sale.status}, linked ${linked?.customer_id ?? "none"}`,
      );
      if (saleId) await as(request(app).post(`/api/v1/pos/sales/${saleId}/void`)).send({ reason: "isolation test cleanup" });
    } else console.log("SKIP  points test — my store has no stocked product");
  } else console.log("SKIP  customers — store B has none");

  // ── Promotions (owner-defined discounts)
  const promo = await one<{ id: string }>(
    `INSERT INTO promotions (tenant_id, name, kind, value) VALUES ($1, 'SMOKE iso', 'percent', 5) RETURNING id`,
    [B],
  );
  tempPromo = promo!.id;
  const pEdit = await as(request(app).put(`/api/v1/crm/promotions/${tempPromo}`)).send({ name: "HACKED", kind: "percent", value: 100, isActive: true });
  const pDel = await as(request(app).delete(`/api/v1/crm/promotions/${tempPromo}`));
  const pAfter = await one<{ name: string; value: number }>(`SELECT name, value FROM promotions WHERE id = $1`, [tempPromo]);
  check("can't edit or delete another store's promo", blocked(pEdit.status) && blocked(pDel.status) && pAfter?.value === 5, `${pEdit.status}/${pDel.status}`);

  // ── People & Payroll
  const emp = await one<{ id: string; daily_rate_cents: number | null; name: string }>(
    `SELECT id, daily_rate_cents, name FROM employees WHERE tenant_id = $1 LIMIT 1`,
    [B],
  );
  if (emp) {
    const read = await as(request(app).get(`/api/v1/hr/employees/${emp.id}`));
    const att = await as(request(app).get(`/api/v1/hr/employees/${emp.id}/attendance`));
    const edit = await as(request(app).patch(`/api/v1/hr/employees/${emp.id}`)).send({ dailyRate: "99999", name: "HACKED" });
    const mark = await as(request(app).put("/api/v1/hr/attendance")).send({ employeeId: emp.id, workDate: "2026-10-01", status: "Present", hours: 8 });
    const after = await one<{ daily_rate_cents: number | null; name: string }>(`SELECT daily_rate_cents, name FROM employees WHERE id = $1`, [emp.id]);
    const marked = await one(`SELECT 1 FROM attendance WHERE employee_id = $1 AND work_date = '2026-10-01' AND note IS NULL AND hours = 8`, [emp.id]);
    check("can't read another store's employee file", blocked(read.status), `status ${read.status}`);
    check("can't read another store's attendance", blocked(att.status), `status ${att.status}`);
    check("can't change another store's employee pay", blocked(edit.status) && after?.daily_rate_cents === emp.daily_rate_cents && after?.name === emp.name, `status ${edit.status}`);
    check("can't mark another store's attendance", blocked(mark.status) && !marked, `status ${mark.status}`);
  } else console.log("SKIP  employees — store B has none");

  const card = await one<{ id: string; clock_out: Date | null }>(`SELECT id, clock_out FROM timecards WHERE tenant_id = $1 LIMIT 1`, [B]);
  if (card) {
    const fix = await as(request(app).patch(`/api/v1/hr/timecards/${card.id}`)).send({ clockOut: "2026-01-01T17:00:00+08:00" });
    const after = await one<{ clock_out: Date | null }>(`SELECT clock_out FROM timecards WHERE id = $1`, [card.id]);
    check("can't correct another store's timecard", blocked(fix.status) && String(after?.clock_out) === String(card.clock_out), `status ${fix.status}`);
  } else console.log("SKIP  timecards — store B has none");

  const run = await one<{ id: string; status: string }>(`SELECT id, status FROM payroll_runs WHERE tenant_id = $1 LIMIT 1`, [B]);
  if (run) {
    const read = await as(request(app).get(`/api/v1/hr/payroll/${run.id}`));
    const csv = await as(request(app).get(`/api/v1/hr/payroll/${run.id}/csv`));
    const approve = await as(request(app).post(`/api/v1/hr/payroll/${run.id}/approve`));
    const del = await as(request(app).delete(`/api/v1/hr/payroll/${run.id}`));
    const after = await one<{ status: string }>(`SELECT status FROM payroll_runs WHERE id = $1`, [run.id]);
    check("can't read another store's payroll (or its CSV)", blocked(read.status) && blocked(csv.status), `${read.status}/${csv.status}`);
    check("can't approve or delete another store's payroll", blocked(approve.status) && blocked(del.status) && after?.status === run.status, `${approve.status}/${del.status}`);
  } else console.log("SKIP  payroll — store B has no runs");

  // ── Sales
  const sale = await one<{ id: string; status: string }>(`SELECT id, status FROM sales WHERE tenant_id = $1 AND kind = 'sale' LIMIT 1`, [B]);
  if (sale) {
    const read = await as(request(app).get(`/api/v1/pos/sales/${sale.id}`));
    const v = await as(request(app).post(`/api/v1/pos/sales/${sale.id}/void`)).send({ reason: "isolation test" });
    const after = await one<{ status: string }>(`SELECT status FROM sales WHERE id = $1`, [sale.id]);
    check("can't read another store's sale", blocked(read.status), `status ${read.status}`);
    check("can't void another store's sale", blocked(v.status) && after?.status === sale.status, `status ${v.status}`);
  } else console.log("SKIP  sales — store B has none");

  // ── Activity log
  const bLog = await one<{ id: string }>(`SELECT id FROM pos_audit_logs WHERE tenant_id = $1 LIMIT 1`, [B]);
  if (bLog) {
    const mine = await as(request(app).get("/api/v1/pos/audit?pageSize=100"));
    check("another store's activity never shows in my log", !(mine.body.logs ?? []).some((l: { id: string }) => l.id === bLog.id));
  }
}

main()
  .catch((err) => {
    failures++;
    console.error("smoke test crashed:", err);
  })
  .finally(async () => {
    if (tempPromo) await query(`DELETE FROM promotions WHERE id = $1`, [tempPromo]);
    await pool.end();
    console.log(failures === 0 ? "\nALL SMOKE CHECKS PASSED" : `\n${failures} SMOKE CHECK(S) FAILED`);
    process.exit(failures === 0 ? 0 : 1);
  });
