/**
 * Dev-database smoke test for VAT registration (non-VAT stores). Drives the
 * REAL routes in-process against DATABASE_URL — dev branch only.
 *
 * In a store with stock: the owner switches it to NON-VAT (a manager can't),
 * a promo sale and a Senior sale are rung up and checked (₱0 VAT, lines booked
 * as non-VAT, "20% off" label), the Senior sale is voided (no VAT reversed),
 * then the store is switched back and a VAT sale is checked unchanged. Every
 * sale is voided and the store's setting is restored. No names printed.
 *
 *   npx tsx scripts/smoke-vat.ts
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
let restore: { tenantId: string; vat: boolean } | null = null;
let promoId: string | null = null;

async function main() {
  const pick = await query<{ tenant_id: string; owner: string; vat_registered: boolean }>(
    `SELECT t.id AS tenant_id, u.id AS owner, t.vat_registered FROM tenants t
       JOIN users u ON u.tenant_id = t.id AND u.role = 'MERCHANT_OWNER' AND u.status = 'active'
      WHERE EXISTS (SELECT 1 FROM products p WHERE p.tenant_id = t.id AND p.is_active AND p.stock >= 3 AND p.vat_class = 'VATABLE' AND p.sc_pwd_eligible)
      LIMIT 1`,
  );
  const s = pick.rows[0];
  if (!s) throw new Error("Need a store with a stocked, VATable, Senior-eligible product.");
  restore = { tenantId: s.tenant_id, vat: s.vat_registered };
  const cookie = (role: Role, userId = s.owner) =>
    `${env.session.cookieName}=${signSession({ userId, tenantId: s.tenant_id, role, email: "smoke@example.com", name: "Smoke" })}`;
  const owner = (r: request.Test) => r.set("Cookie", cookie("MERCHANT_OWNER")).set("Origin", ORIGIN);
  const prod = (await query<{ id: string; price_cents: number }>(
    `SELECT id, price_cents FROM products WHERE tenant_id = $1 AND is_active AND stock >= 3 AND vat_class = 'VATABLE' AND sc_pwd_eligible LIMIT 1`,
    [s.tenant_id],
  )).rows[0];
  const price = prod.price_cents;

  // Settings: a manager can't flip it; the owner can.
  const mgr = await request(app)
    .patch("/api/v1/account/receipt")
    .set("Cookie", cookie("MANAGER"))
    .set("Origin", ORIGIN)
    .send({ vatRegistered: !s.vat_registered, showLogo: true });
  check("a manager can't change the VAT registration (403)", mgr.status === 403, `status ${mgr.status}`);
  const off = await owner(request(app).patch("/api/v1/account/receipt")).send({ vatRegistered: false, showLogo: true });
  check("the owner switches the store to non-VAT", off.status === 200 && off.body.settings?.vatRegistered === false, `status ${off.status}`);

  const cat = await owner(request(app).get("/api/v1/pos/catalog"));
  check("the register is told the store is non-VAT", cat.body.pricing?.vatRegistered === false && cat.body.store?.vatRegistered === false);

  // A 10% promo sale: same total as before, but no VAT booked.
  promoId = (await query<{ id: string }>(
    `INSERT INTO promotions (tenant_id, name, kind, value) VALUES ($1, 'SMOKE VAT', 'percent', 10) RETURNING id`,
    [s.tenant_id],
  )).rows[0].id;
  const promoSale = await owner(request(app).post("/api/v1/pos/orders")).send({
    items: [{ productId: prod.id, qty: 1 }],
    paymentMethod: "GCash",
    discount: { type: "promo", promoId },
  });
  const ps = promoSale.body.sale;
  check("non-VAT promo sale: total unchanged (price − 10%)", ps?.totalCents === price - Math.round(price * 0.1), `${ps?.totalCents}`);
  check("non-VAT promo sale: ₱0 VAT, nothing VATable", ps?.vatCents === 0 && ps?.vatableSalesCents === 0);
  const lineClass = await query<{ vat_class: string }>(`SELECT vat_class FROM sale_items WHERE sale_id = $1`, [ps.id]);
  check("non-VAT sale lines are stored with no VAT (so refunds reverse none)", lineClass.rows.every((r) => r.vat_class === "EXEMPT"));

  // Senior: a plain 20% off (no VAT to strip).
  const senior = await owner(request(app).post("/api/v1/pos/orders")).send({
    items: [{ productId: prod.id, qty: 1 }],
    paymentMethod: "GCash",
    discount: { type: "senior", idNumber: "SMOKE-1234", holderName: "Smoke Test", exclusiveUse: true },
  });
  const ss = senior.body.sale;
  check("non-VAT Senior sale: plain 20% off", ss?.totalCents === price - Math.round(price * 0.2), `${ss?.totalCents} vs ${price - Math.round(price * 0.2)}`);
  check("non-VAT Senior label says 20% off, not VAT-exempt", ss?.discountLabel === "Senior Citizen (20% off)", ss?.discountLabel);
  const v = await owner(request(app).post(`/api/v1/pos/sales/${ss.id}/void`)).send({ reason: "smoke test cleanup" });
  check("voiding it reverses ₱0 VAT", v.status === 201 && v.body.reversal?.vatCents === 0, `vat ${v.body.reversal?.vatCents}`);
  await owner(request(app).post(`/api/v1/pos/sales/${ps.id}/void`)).send({ reason: "smoke test cleanup" });

  // Back to VAT-registered: pricing is exactly as before.
  const on = await owner(request(app).patch("/api/v1/account/receipt")).send({ vatRegistered: true, showLogo: true });
  check("the owner switches back to VAT-registered", on.body.settings?.vatRegistered === true);
  const vatSale = await owner(request(app).post("/api/v1/pos/orders")).send({ items: [{ productId: prod.id, qty: 1 }], paymentMethod: "GCash" });
  const vs = vatSale.body.sale;
  check("VAT store: price is VAT-inclusive, VAT = price × 12/112", vs?.totalCents === price && vs?.vatCents === Math.round((price * 12) / 112), `vat ${vs?.vatCents}`);
  await owner(request(app).post(`/api/v1/pos/sales/${vs.id}/void`)).send({ reason: "smoke test cleanup" });
}

main()
  .catch((err) => {
    failures++;
    console.error("smoke test crashed:", err);
  })
  .finally(async () => {
    if (restore) await query(`UPDATE tenants SET vat_registered = $2 WHERE id = $1`, [restore.tenantId, restore.vat]);
    if (promoId) await query(`DELETE FROM promotions WHERE id = $1`, [promoId]);
    await pool.end();
    console.log(failures === 0 ? "\nALL SMOKE CHECKS PASSED" : `\n${failures} SMOKE CHECK(S) FAILED`);
    process.exit(failures === 0 ? 0 : 1);
  });
