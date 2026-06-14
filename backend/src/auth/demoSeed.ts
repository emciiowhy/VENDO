import type { PoolClient } from "pg";
import { hashPin } from "./auth.crypto.js";

/**
 * Demo-workspace seeder — the "utility hook" that runs right after a fresh
 * tenant's isolation is set up during self-service signup. It populates the new
 * store with just enough real rows that the dashboard opens with readable
 * analytics instead of a hollow empty state: one sample cashier, three starter
 * products, and one settled transaction wired through the same ledger a real
 * checkout writes (sale + line items + serial counter + stock decrement).
 *
 * Everything runs on the CALLER'S transaction client, so if signup rolls back,
 * the seed rolls back with it — a half-seeded tenant can never be left behind.
 * Strictly scoped to the one `tenantId` passed in; it never touches another
 * store's rows.
 */

// VAT is 12% and PRICE-INCLUSIVE in PH retail, so vat = gross × 12/112
// (mirrors the POS checkout serializer).
const VAT_NUM = 12;
const VAT_DEN = 112;

/** The demo cashier's PIN — surfaced to the new owner so they can try the till. */
export const DEMO_CASHIER_PIN = "1234";

export interface DemoSeedResult {
  cashierPin: string;
}

export async function seedDemoWorkspace(
  client: PoolClient,
  tenantId: string,
): Promise<DemoSeedResult> {
  // 1. One active sample cashier. `users.email` is the global identity key, so —
  //    like the owner's roster seeder — mint a unique synthetic address.
  const cashierRes = await client.query<{ id: string }>(
    `INSERT INTO users (tenant_id, email, name, role, status, pin_hash)
     VALUES ($1, 'cashier.' || gen_random_uuid() || '@cashier.local',
             'Sample Cashier', 'CASHIER', 'active', $2)
     RETURNING id`,
    [tenantId, hashPin(DEMO_CASHIER_PIN)],
  );
  const cashierId = cashierRes.rows[0].id;

  // 2. Three starter inventory products.
  const productsRes = await client.query<{ id: string; name: string; price_cents: number }>(
    `INSERT INTO products (tenant_id, name, sku, price_cents, stock, low_stock_threshold, is_active)
     VALUES
       ($1, 'Sample Item A', 'SAMPLE-A', 12000, 100, 10, TRUE),
       ($1, 'Sample Item B', 'SAMPLE-B',  8500, 100, 10, TRUE),
       ($1, 'Sample Item C', 'SAMPLE-C', 25000,  50,  5, TRUE)
     RETURNING id, name, price_cents`,
    [tenantId],
  );
  const [itemA, itemB] = productsRes.rows;

  // 3. One mock initial transaction: 2× Item A + 1× Item B, paid in cash. The
  //    money is computed VAT-inclusive exactly like a real checkout so the
  //    compliance/finance figures read correctly from the first second.
  const qtyA = 2;
  const qtyB = 1;
  const grossCents = itemA.price_cents * qtyA + itemB.price_cents * qtyB;
  const vatCents = Math.round((grossCents * VAT_NUM) / VAT_DEN);
  const subtotalCents = grossCents - vatCents;
  const tenderedCents = Math.ceil(grossCents / 10000) * 10000; // next whole ₱100 note up

  const saleRes = await client.query<{ id: string }>(
    `INSERT INTO sales
       (tenant_id, cashier_user_id, reference, subtotal_cents, vat_cents, total_cents,
        payment_method, tendered_cents, change_cents, discount_cents, kind)
     VALUES ($1, $2, 'SI-000001', $3, $4, $5, 'Cash', $6, $7, 0, 'sale')
     RETURNING id`,
    [tenantId, cashierId, subtotalCents, vatCents, grossCents, tenderedCents, tenderedCents - grossCents],
  );
  const saleId = saleRes.rows[0].id;

  await client.query(
    `INSERT INTO sale_items (sale_id, product_id, name, unit_price_cents, qty, line_total_cents)
     VALUES ($1, $2, $3, $4, $5, $6), ($1, $7, $8, $9, $10, $11)`,
    [
      saleId,
      itemA.id, itemA.name, itemA.price_cents, qtyA, itemA.price_cents * qtyA,
      itemB.id, itemB.name, itemB.price_cents, qtyB, itemB.price_cents * qtyB,
    ],
  );

  // Reflect the sale in on-hand stock so the Inventory view stays consistent.
  await client.query(`UPDATE products SET stock = stock - $2 WHERE id = $1`, [itemA.id, qtyA]);
  await client.query(`UPDATE products SET stock = stock - $2 WHERE id = $1`, [itemB.id, qtyB]);

  // Seed the per-tenant invoice serial counter at 1 so the next real receipt
  // continues the gap-free sequence at SI-000002.
  await client.query(
    `INSERT INTO invoice_counters (tenant_id, next_seq) VALUES ($1, 1)
     ON CONFLICT (tenant_id) DO NOTHING`,
    [tenantId],
  );

  return { cashierPin: DEMO_CASHIER_PIN };
}
