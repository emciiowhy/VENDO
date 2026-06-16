import type { PoolClient } from "pg";
import { hashPin } from "./auth.crypto.js";

/**
 * Demo-workspace seeder — the "utility hook" that runs right after a fresh
 * tenant's isolation is set up during self-service signup. It populates the new
 * store with just enough real rows that the dashboard opens with readable
 * analytics instead of a hollow empty state: a small cashier team, three starter
 * products, one settled transaction wired through the same ledger a real
 * checkout writes, and a week of backdated labor history (timecards + sales) so
 * the Labor Analytics workspace opens with a populated active-staff tracker,
 * labor-to-sales cards and a multi-cashier efficiency matrix.
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

// ── Backdated labor-history generation (pure + unit-testable) ────────────────

/**
 * The demo cashier team. The first is "Sample Cashier" (whose PIN is surfaced to
 * the owner); the rest round out the efficiency matrix. Each has a deterministic
 * shift window inside trading hours so the labor and sales records overlap.
 */
export const DEMO_CASHIERS: { name: string; startHour: number; hours: number }[] = [
  { name: "Sample Cashier", startHour: 8, hours: 8 }, // 08:00–16:00
  { name: "Maria Santos", startHour: 10, hours: 7 }, //  10:00–17:00
  { name: "Diego Ramos", startHour: 11, hours: 6 }, //   11:00–17:00
];

/** Which cashier is left clocked-in "now" for the live floor tracker. */
const ACTIVE_CASHIER_INDEX = 1;

/** Days of backdated COMPLETED history per cashier (the past week). */
const HISTORY_DAYS = 7;

/** Sales rung per completed shift (one of each basket, for realistic revenue). */
const BASKETS: { p: number; q: number }[][] = [
  [{ p: 0, q: 2 }, { p: 1, q: 1 }],
  [{ p: 0, q: 1 }, { p: 2, q: 2 }],
  [{ p: 1, q: 3 }, { p: 0, q: 1 }],
  [{ p: 2, q: 1 }, { p: 1, q: 1 }],
];

const HOUR_MS = 3_600_000;
const MIN_MS = 60_000;

export interface SeedShift {
  cashierIndex: number;
  clockIn: Date;
  clockOut: Date | null;
  status: "ACTIVE" | "COMPLETED";
}

export interface SeedSale {
  cashierIndex: number;
  createdAt: Date;
  /** Lines as { product index into DEMO products, qty }. */
  lines: { p: number; q: number }[];
}

/**
 * Build the backdated labor history relative to `now`: for each cashier, one
 * COMPLETED shift on each of the past `HISTORY_DAYS` days (6–8h inside trading
 * hours) with a handful of sales rung within that window — plus exactly ONE
 * still-open ACTIVE shift (clock_out null) ending at `now`, so the real-time
 * tracker has someone on the floor. Pure: no DB, no wall-clock read beyond the
 * injected `now`, so the invariants (one active, day spread, sales-in-window)
 * are unit-testable without a database.
 */
export function buildLaborHistory(now: Date): { shifts: SeedShift[]; sales: SeedSale[] } {
  const shifts: SeedShift[] = [];
  const sales: SeedSale[] = [];

  DEMO_CASHIERS.forEach((plan, cashierIndex) => {
    for (let d = 1; d <= HISTORY_DAYS; d++) {
      const day = new Date(now);
      day.setDate(day.getDate() - d);
      const clockIn = new Date(day.getFullYear(), day.getMonth(), day.getDate(), plan.startHour, 0, 0, 0);
      const clockOut = new Date(clockIn.getTime() + plan.hours * HOUR_MS);
      shifts.push({ cashierIndex, clockIn, clockOut, status: "COMPLETED" });

      // Spread the day's sales evenly across the shift so each lands inside the
      // [clock_in, clock_out] window (trading hours), never on the boundary.
      const span = plan.hours * HOUR_MS;
      BASKETS.forEach((lines, k) => {
        const createdAt = new Date(clockIn.getTime() + Math.round((span * (k + 1)) / (BASKETS.length + 1)));
        sales.push({ cashierIndex, createdAt, lines });
      });
    }
  });

  // Exactly one cashier stays clocked in right up to now (open card, no punch-out).
  shifts.push({
    cashierIndex: ACTIVE_CASHIER_INDEX,
    clockIn: new Date(now.getTime() - (2 * HOUR_MS + 45 * MIN_MS)),
    clockOut: null,
    status: "ACTIVE",
  });

  return { shifts, sales };
}

/** Build a multi-row `VALUES ($1,$2,…),($n,…)` clause for `rows × cols` params. */
function valuesClause(rows: number, cols: number): string {
  const out: string[] = [];
  let p = 1;
  for (let r = 0; r < rows; r++) {
    const cells: string[] = [];
    for (let c = 0; c < cols; c++) cells.push(`$${p++}`);
    out.push(`(${cells.join(",")})`);
  }
  return out.join(",");
}

/** SI-000002, SI-000003, … (historical sales continue after the SI-000001 sample). */
function historyRef(i: number): string {
  return `SI-${String(i + 2).padStart(6, "0")}`;
}

export async function seedDemoWorkspace(
  client: PoolClient,
  tenantId: string,
): Promise<DemoSeedResult> {
  // 1. The cashier team. `users.email` is the global identity key, so — like the
  //    owner's roster seeder — mint a unique synthetic address per row. All share
  //    the demo PIN so the owner can PIN-switch to any of them at the till.
  const pin = hashPin(DEMO_CASHIER_PIN);
  const cashierParams: unknown[] = [];
  const cashierValues = DEMO_CASHIERS.map((c, i) => {
    cashierParams.push(tenantId, c.name, pin);
    return `($${i * 3 + 1}, 'cashier.' || gen_random_uuid() || '@cashier.local', $${i * 3 + 2}, 'CASHIER', 'active', $${i * 3 + 3})`;
  }).join(",");
  const cashiersRes = await client.query<{ id: string; name: string }>(
    `INSERT INTO users (tenant_id, email, name, role, status, pin_hash)
     VALUES ${cashierValues}
     RETURNING id, name`,
    cashierParams,
  );
  const idByName = new Map(cashiersRes.rows.map((r) => [r.name, r.id]));
  // Resolve ids back in DEMO_CASHIERS order (names are unique within the team).
  const cashierIds = DEMO_CASHIERS.map((c) => idByName.get(c.name) as string);

  // 2. Three starter inventory products (index 0/1/2 = A/B/C, used by the baskets).
  const productsRes = await client.query<{ id: string; name: string; price_cents: number }>(
    `INSERT INTO products (tenant_id, name, sku, price_cents, stock, low_stock_threshold, is_active)
     VALUES
       ($1, 'Sample Item A', 'SAMPLE-A', 12000, 100, 10, TRUE),
       ($1, 'Sample Item B', 'SAMPLE-B',  8500, 100, 10, TRUE),
       ($1, 'Sample Item C', 'SAMPLE-C', 25000,  50,  5, TRUE)
     RETURNING id, name, price_cents`,
    [tenantId],
  );
  const products = productsRes.rows;
  const [itemA, itemB] = products;

  // 3. One mock CURRENT transaction (SI-000001, today): 2× Item A + 1× Item B,
  //    paid in cash. Money is VAT-inclusive exactly like a real checkout so the
  //    compliance/finance figures read correctly from the first second. This one
  //    decrements stock (it's the live sample); the backdated history below does
  //    not (on-hand reflects the present, not a week of replayed sales).
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
    [tenantId, cashierIds[0], subtotalCents, vatCents, grossCents, tenderedCents, tenderedCents - grossCents],
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

  // Reflect the live sale in on-hand stock so the Inventory view stays consistent.
  await client.query(`UPDATE products SET stock = stock - $2 WHERE id = $1`, [itemA.id, qtyA]);
  await client.query(`UPDATE products SET stock = stock - $2 WHERE id = $1`, [itemB.id, qtyB]);

  // 4. Backdated labor history — a week of shifts + the sales rung during them.
  const { shifts, sales } = buildLaborHistory(new Date());

  // 4a. Timecards (one batched insert). Exactly one row is ACTIVE (clock_out
  //     null), so the partial unique index `timecards_one_active_per_user`
  //     is satisfied by construction.
  const tcParams: unknown[] = [];
  for (const s of shifts) {
    tcParams.push(
      tenantId,
      cashierIds[s.cashierIndex],
      s.clockIn.toISOString(),
      s.clockOut ? s.clockOut.toISOString() : null,
      s.status,
    );
  }
  await client.query(
    `INSERT INTO timecards (tenant_id, user_id, clock_in, clock_out, status)
     VALUES ${valuesClause(shifts.length, 5)}`,
    tcParams,
  );

  // 4b. Historical sales (one batched insert), referenced SI-000002…, gap-free
  //     after the live SI-000001. RETURNING id+reference lets us map line items
  //     back without depending on row order.
  const saleParams: unknown[] = [];
  sales.forEach((sale, i) => {
    const gross = sale.lines.reduce((sum, l) => sum + products[l.p].price_cents * l.q, 0);
    const vat = Math.round((gross * VAT_NUM) / VAT_DEN);
    const tendered = Math.ceil(gross / 10000) * 10000;
    saleParams.push(
      tenantId,
      cashierIds[sale.cashierIndex],
      historyRef(i),
      gross - vat,
      vat,
      gross,
      "Cash",
      tendered,
      tendered - gross,
      0,
      "sale",
      sale.createdAt.toISOString(),
    );
  });
  const historySales = await client.query<{ id: string; reference: string }>(
    `INSERT INTO sales
       (tenant_id, cashier_user_id, reference, subtotal_cents, vat_cents, total_cents,
        payment_method, tendered_cents, change_cents, discount_cents, kind, created_at)
     VALUES ${valuesClause(sales.length, 12)}
     RETURNING id, reference`,
    saleParams,
  );
  const saleIdByRef = new Map(historySales.rows.map((r) => [r.reference, r.id]));

  // 4c. Historical sale line items (one batched insert).
  const itemParams: unknown[] = [];
  let itemRows = 0;
  sales.forEach((sale, i) => {
    const sid = saleIdByRef.get(historyRef(i));
    for (const l of sale.lines) {
      const prod = products[l.p];
      itemParams.push(sid, prod.id, prod.name, prod.price_cents, l.q, prod.price_cents * l.q);
      itemRows++;
    }
  });
  await client.query(
    `INSERT INTO sale_items (sale_id, product_id, name, unit_price_cents, qty, line_total_cents)
     VALUES ${valuesClause(itemRows, 6)}`,
    itemParams,
  );

  // Seed the per-tenant invoice serial counter at the highest serial used (1 live
  // + the historical batch) so the next real receipt continues the gap-free
  // sequence at SI-000002… +1.
  await client.query(
    `INSERT INTO invoice_counters (tenant_id, next_seq) VALUES ($1, $2)
     ON CONFLICT (tenant_id) DO UPDATE SET next_seq = EXCLUDED.next_seq`,
    [tenantId, 1 + sales.length],
  );

  return { cashierPin: DEMO_CASHIER_PIN };
}
