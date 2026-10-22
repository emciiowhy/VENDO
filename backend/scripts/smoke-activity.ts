/**
 * Dev-database smoke test for the activity log (capstone step 2). Drives the
 * REAL HTTP routes in-process (supertest + createApp) against DATABASE_URL, so
 * only run it on the dev branch. As a real store owner it rings up a sale,
 * voids it, clocks in and out, and signs out — then checks each landed in the
 * activity log, and that another store's owner can't see any of it. Prints
 * counts only — no names or emails.
 *
 *   npx tsx scripts/smoke-activity.ts
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

type Owner = { user_id: string; tenant_id: string; name: string; email: string };

function cookie(o: Owner) {
  const token = signSession({ userId: o.user_id, tenantId: o.tenant_id, role: "MERCHANT_OWNER", email: o.email, name: o.name });
  return `${env.session.cookieName}=${token}`;
}

async function logFor(o: Owner, qs = "") {
  const res = await request(app).get(`/api/v1/pos/audit?${qs}`).set("Cookie", cookie(o));
  return res.body.logs as { action: string; refId: string | null; cashierUserId: string | null }[];
}

const settle = () => new Promise((r) => setTimeout(r, 400)); // log writes are fire-and-forget

async function main() {
  // An active owner whose store has a stocked product, and an owner of another store.
  const owners = await query<Owner & { has_stock: boolean }>(
    `SELECT u.id AS user_id, u.tenant_id, u.name, u.email,
            EXISTS (SELECT 1 FROM products p WHERE p.tenant_id = u.tenant_id AND p.is_active AND p.stock >= 1) AS has_stock
       FROM users u
      WHERE u.role = 'MERCHANT_OWNER' AND u.tenant_id IS NOT NULL AND u.status = 'active'`,
  );
  const a = owners.rows.find((o) => o.has_stock);
  const b = owners.rows.find((o) => a && o.tenant_id !== a.tenant_id);
  if (!a) throw new Error("No owner with a stocked product on this database.");
  const product = await query<{ id: string }>(
    `SELECT id FROM products WHERE tenant_id = $1 AND is_active AND stock >= 1 LIMIT 1`,
    [a.tenant_id],
  );

  // 1. Sale → `sale` row.
  const sale = await request(app)
    .post("/api/v1/pos/orders")
    .set("Cookie", cookie(a))
    .set("Origin", ORIGIN)
    .send({ items: [{ productId: product.rows[0].id, qty: 1 }], paymentMethod: "GCash" });
  check("sale rings up over HTTP", sale.status === 201, `status ${sale.status}`);
  const saleId: string = sale.body.sale?.id;

  // 2. Void → `void_sale` row (also restores the stock).
  const voided = await request(app)
    .post(`/api/v1/pos/sales/${saleId}/void`)
    .set("Cookie", cookie(a))
    .set("Origin", ORIGIN)
    .send({ reason: "smoke test cleanup" });
  check("sale voids over HTTP", voided.status === 201, `status ${voided.status}`);
  await settle();

  const mine = await logFor(a);
  check("`sale` row logged with the sale id", mine.some((l) => l.action === "sale" && l.refId === saleId));
  check("`void_sale` row logged with the sale id", mine.some((l) => l.action === "void_sale" && l.refId === saleId));
  check("rows are attributed to the acting user", mine.filter((l) => l.refId === saleId).every((l) => l.cashierUserId === a.user_id));

  const onlySales = await logFor(a, "action=sale");
  check("action filter returns only that action", onlySales.length > 0 && onlySales.every((l) => l.action === "sale"));

  // 3. Shift In / Shift Out on the labor clock (skipped if already on the clock).
  const status = await request(app).get("/api/v1/merchant/shifts/status").set("Cookie", cookie(a));
  if (status.body.timecard) {
    console.log("SKIP  clock in/out — this owner is already clocked in on dev");
  } else {
    const cin = await request(app).post("/api/v1/merchant/shifts/clock-in").set("Cookie", cookie(a)).set("Origin", ORIGIN);
    const cout = await request(app).post("/api/v1/merchant/shifts/clock-out").set("Cookie", cookie(a)).set("Origin", ORIGIN);
    await settle();
    const tcId: string = cin.body.timecard?.id;
    const after = await logFor(a);
    check("Shift In logged", cin.status === 201 && after.some((l) => l.action === "clock_in" && l.refId === tcId));
    check("Shift Out logged", cout.status === 200 && after.some((l) => l.action === "clock_out" && l.refId === tcId));
  }

  // 4. Sign-out → `logout` row.
  const before = (await logFor(a, "action=logout")).length;
  await request(app).post("/auth/logout").set("Cookie", cookie(a)).set("Origin", ORIGIN);
  await settle();
  check("sign-out logged", (await logFor(a, "action=logout")).length === before + 1);

  // 5. Tenant isolation: another store's owner sees none of it.
  if (b) {
    const theirs = await logFor(b);
    check("another store's owner can't see these events", !theirs.some((l) => l.refId === saleId));
  } else {
    console.log("SKIP  tenant isolation — only one store on dev");
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
