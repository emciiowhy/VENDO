/**
 * Dev-database smoke test for the predefined-discount checkout (capstone step 1).
 * Runs the REAL createOrder / reverseSale against whatever DATABASE_URL points
 * at, so only run it on the dev branch. It rings up one Senior sale, checks the
 * figures and the stock deduction, voids it (restoring stock), and probes the
 * member + tenant-isolation guards. Prints amounts and counts only — no names.
 *
 *   npx tsx scripts/smoke-discounts.ts
 */
import "dotenv/config";
import { pool, query } from "../src/db.js";
import { createOrder, getPricingSettings } from "../src/pos/pos.repository.js";
import { reverseSale } from "../src/pos/refunds.repository.js";
import { priceCart } from "../src/pos/pos.schema.js";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
}

async function main() {
  // A tenant with two sellable products (stock ≥ 2) to ring up.
  const pick = await query<{ tenant_id: string }>(
    `SELECT tenant_id FROM products WHERE is_active AND stock >= 2
      GROUP BY tenant_id HAVING count(*) >= 2 LIMIT 1`,
  );
  const tenantId = pick.rows[0]?.tenant_id;
  if (!tenantId) throw new Error("No tenant with two stocked products on this database.");
  const prods = await query<{ id: string; price_cents: number; stock: number; vat_class: string; sc_pwd_eligible: boolean }>(
    `SELECT id, price_cents, stock, vat_class, sc_pwd_eligible FROM products
      WHERE tenant_id = $1 AND is_active AND stock >= 2 ORDER BY id LIMIT 2`,
    [tenantId],
  );
  const [a, b] = prods.rows;
  const other = await query<{ id: string }>(`SELECT id FROM tenants WHERE id <> $1 LIMIT 1`, [tenantId]);

  // Temporarily mark product B ineligible (restored in finally).
  await query(`UPDATE products SET sc_pwd_eligible = FALSE WHERE id = $1`, [b.id]);
  try {
    const card = { idNumber: "SMOKE-TEST", holderName: "Smoke Test", exclusiveUse: true as const };
    const pricing = await getPricingSettings(tenantId);
    const expected = priceCart({
      lines: [
        { vatClass: a.vat_class as "VATABLE", grossCents: a.price_cents, scPwdEligible: true },
        { vatClass: b.vat_class as "VATABLE", grossCents: b.price_cents, scPwdEligible: false },
      ],
      discount: { kind: "senior" },
      requestedPoints: 0,
      pointsBalance: 0,
      pointValueCents: pricing.pointValueCents,
    });

    const order = await createOrder(tenantId, null, {
      items: [
        { productId: a.id, qty: 1 },
        { productId: b.id, qty: 1 },
      ],
      paymentMethod: "GCash",
      discount: { type: "senior", ...card },
    });
    check("senior sale commits", order.ok, order.ok ? "" : JSON.stringify(order.error));
    if (!order.ok) return;
    const sale = order.sale;
    check("total matches priceCart", sale.totalCents === expected.netCents, `${sale.totalCents} vs ${expected.netCents}`);
    check("ineligible line keeps its VAT", sale.vatCents === expected.vatCents, `vat ${sale.vatCents}`);
    check("gross = total + discount", sale.grossCents === sale.totalCents + sale.discountCents);
    check("label says Senior Citizen", sale.discountLabel === "Senior Citizen (20% + VAT-exempt)");

    const row = await query<{ sc_pwd_type: string | null }>(`SELECT sc_pwd_type FROM sales WHERE id = $1`, [sale.id]);
    check("sc_pwd_type stored as 'senior'", row.rows[0]?.sc_pwd_type === "senior");

    const after = await query<{ id: string; stock: number }>(`SELECT id, stock FROM products WHERE id = ANY($1)`, [[a.id, b.id]]);
    const stockOf = (id: string) => after.rows.find((r) => r.id === id)!.stock;
    check("stock deducted on both lines", stockOf(a.id) === a.stock - 1 && stockOf(b.id) === b.stock - 1);

    const voided = await reverseSale(tenantId, null, sale.id, { kind: "void" }, "smoke test cleanup", null);
    check("void succeeds", voided.ok);
    const restored = await query<{ id: string; stock: number }>(`SELECT id, stock FROM products WHERE id = ANY($1)`, [[a.id, b.id]]);
    const restoredOf = (id: string) => restored.rows.find((r) => r.id === id)!.stock;
    check("void restores stock", restoredOf(a.id) === a.stock && restoredOf(b.id) === b.stock);

    const member = await createOrder(tenantId, null, {
      items: [{ productId: a.id, qty: 1 }],
      paymentMethod: "GCash",
      discount: { type: "member" },
    });
    check("member discount without a customer is refused", !member.ok && member.error.code === "MEMBER_REQUIRES_CUSTOMER");

    const allIneligible = await createOrder(tenantId, null, {
      items: [{ productId: b.id, qty: 1 }],
      paymentMethod: "GCash",
      discount: { type: "pwd", ...card },
    });
    check("PWD on only-ineligible items is refused", !allIneligible.ok && allIneligible.error.code === "NO_ELIGIBLE_ITEMS");

    if (other.rows[0]) {
      const cross = await createOrder(other.rows[0].id, null, {
        items: [{ productId: a.id, qty: 1 }],
        paymentMethod: "GCash",
      });
      check("another tenant cannot sell this product", !cross.ok && cross.error.code === "UNAVAILABLE");
    }
  } finally {
    await query(`UPDATE products SET sc_pwd_eligible = $2 WHERE id = $1`, [b.id, b.sc_pwd_eligible]);
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
