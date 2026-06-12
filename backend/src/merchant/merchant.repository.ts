import { query } from "../db.js";

/**
 * Merchant-side business intelligence + BIR compliance, all strictly fenced to
 * a single `tenantId` (read from the verified session cookie by the router —
 * never the request body). Money is integer centavos throughout.
 *
 * "Today" and monthly buckets are evaluated in Manila time (`AT TIME ZONE
 * 'Asia/Manila'`) so a store's figures line up with the local retail day and
 * the books it files, regardless of the server's UTC clock.
 */

const MNL = "Asia/Manila";

// ── "Pulse" dashboard analytics ─────────────────────────────────────────────

export interface HourPoint {
  /** Hour of the local day, 0–23. */
  hour: number;
  grossCents: number;
  txns: number;
}

export interface MethodSlice {
  method: string;
  txns: number;
  grossCents: number;
}

export interface TopItem {
  name: string;
  qty: number;
  revenueCents: number;
}

export interface DashboardPulse {
  /** Local calendar day these figures cover (YYYY-MM-DD, Manila). */
  day: string;
  grossCents: number;
  txns: number;
  /** Average order value = gross / txns (centavos), 0 when no sales. */
  aovCents: number;
  /** Total units sold across all line items today. */
  itemsSold: number;
  /** Net-of-VAT taxable sales today (subtotal), centavos. */
  netCents: number;
  /** Output VAT collected today (12% inclusive extraction), centavos. */
  vatCents: number;
  /** Total customer discounts applied today, centavos. */
  discountCents: number;
  hourly: HourPoint[];
  byMethod: MethodSlice[];
  topItems: TopItem[];
  /** Count of products currently at/below their low-stock floor. */
  lowStockCount: number;
}

/**
 * One round of cheap aggregates over today's `sales` / `sale_items` rows for
 * this Tenant. Replaces the old hard-coded dashboard arrays with live SUM/COUNT
 * models.
 */
export async function getDashboardPulse(tenantId: string): Promise<DashboardPulse> {
  const totals = await query<{
    day: string;
    gross: string;
    txns: number;
    net: string;
    vat: string;
    discount: string;
  }>(
    `SELECT to_char((now() AT TIME ZONE $2)::date, 'YYYY-MM-DD') AS day,
            coalesce(sum(total_cents), 0)::bigint    AS gross,
            count(*)::int                            AS txns,
            coalesce(sum(subtotal_cents), 0)::bigint AS net,
            coalesce(sum(vat_cents), 0)::bigint      AS vat,
            coalesce(sum(discount_cents), 0)::bigint AS discount
       FROM sales
      WHERE tenant_id = $1
        AND (created_at AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date`,
    [tenantId, MNL],
  );
  const t = totals.rows[0];
  const grossCents = Number(t.gross);
  const txns = t.txns;

  const hourlyRes = await query<{ hour: number; gross: string; txns: number }>(
    `SELECT extract(hour FROM created_at AT TIME ZONE $2)::int AS hour,
            coalesce(sum(total_cents), 0)::bigint AS gross,
            count(*)::int AS txns
       FROM sales
      WHERE tenant_id = $1
        AND (created_at AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date
      GROUP BY 1
      ORDER BY 1 ASC`,
    [tenantId, MNL],
  );
  const hourly: HourPoint[] = hourlyRes.rows.map((r) => ({
    hour: r.hour,
    grossCents: Number(r.gross),
    txns: r.txns,
  }));

  const methodRes = await query<{ method: string; txns: number; gross: string }>(
    `SELECT payment_method AS method, count(*)::int AS txns,
            coalesce(sum(total_cents), 0)::bigint AS gross
       FROM sales
      WHERE tenant_id = $1
        AND (created_at AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date
      GROUP BY 1
      ORDER BY gross DESC`,
    [tenantId, MNL],
  );
  const byMethod: MethodSlice[] = methodRes.rows.map((r) => ({
    method: r.method,
    txns: r.txns,
    grossCents: Number(r.gross),
  }));

  const itemsRes = await query<{ name: string; qty: string; revenue: string }>(
    `SELECT si.name,
            sum(si.qty)::bigint AS qty,
            sum(si.line_total_cents)::bigint AS revenue
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
      WHERE s.tenant_id = $1
        AND (s.created_at AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date
      GROUP BY si.name
      ORDER BY qty DESC
      LIMIT 6`,
    [tenantId, MNL],
  );
  const topItems: TopItem[] = itemsRes.rows.map((r) => ({
    name: r.name,
    qty: Number(r.qty),
    revenueCents: Number(r.revenue),
  }));
  const itemsSold = topItems.length
    ? (
        await query<{ n: string }>(
          `SELECT coalesce(sum(si.qty), 0)::bigint AS n
             FROM sale_items si JOIN sales s ON s.id = si.sale_id
            WHERE s.tenant_id = $1
              AND (s.created_at AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date`,
          [tenantId, MNL],
        )
      ).rows[0].n
    : "0";

  const low = await query<{ n: number }>(
    `SELECT count(*)::int AS n
       FROM products
      WHERE tenant_id = $1 AND is_active = TRUE
        AND low_stock_threshold > 0 AND stock <= low_stock_threshold`,
    [tenantId],
  );

  return {
    day: t.day,
    grossCents,
    txns,
    aovCents: txns > 0 ? Math.round(grossCents / txns) : 0,
    itemsSold: Number(itemsSold),
    netCents: Number(t.net),
    vatCents: Number(t.vat),
    discountCents: Number(t.discount),
    hourly,
    byMethod,
    topItems,
    lowStockCount: low.rows[0]?.n ?? 0,
  };
}

// ── Low-stock alert engine ──────────────────────────────────────────────────

export interface StockAlert {
  id: string;
  name: string;
  sku: string | null;
  stock: number;
  lowStockThreshold: number;
  /** true when fully depleted (stock = 0), the most urgent tier. */
  depleted: boolean;
}

/**
 * Active products whose stock has fallen to or below their configured
 * `low_stock_threshold` (a threshold of 0 means "don't track", so it's
 * excluded). Most urgent — fewest units, then depleted — first.
 */
export async function getStockAlerts(tenantId: string): Promise<StockAlert[]> {
  const { rows } = await query<{
    id: string;
    name: string;
    sku: string | null;
    stock: number;
    low_stock_threshold: number;
  }>(
    `SELECT id, name, sku, stock, low_stock_threshold
       FROM products
      WHERE tenant_id = $1 AND is_active = TRUE
        AND low_stock_threshold > 0 AND stock <= low_stock_threshold
      ORDER BY stock ASC, lower(name) ASC`,
    [tenantId],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    sku: r.sku,
    stock: r.stock,
    lowStockThreshold: r.low_stock_threshold,
    depleted: r.stock === 0,
  }));
}

/**
 * Low-stock products whose row changed since `since` (exclusive) — the live
 * feed behind the real-time alert pipeline. A checkout decrements stock and
 * bumps `updated_at`, so a sale that drops an item to/below its threshold
 * surfaces here on the next poll; items already low but untouched do not
 * re-fire. Each carries its own `at` so the caller can advance its high-water.
 */
export async function getLowStockCrossingsSince(
  tenantId: string,
  since: Date,
): Promise<{ alert: StockAlert; at: string }[]> {
  const { rows } = await query<{
    id: string;
    name: string;
    sku: string | null;
    stock: number;
    low_stock_threshold: number;
    updated_at: Date;
  }>(
    `SELECT id, name, sku, stock, low_stock_threshold, updated_at
       FROM products
      WHERE tenant_id = $1 AND is_active = TRUE
        AND low_stock_threshold > 0 AND stock <= low_stock_threshold
        AND updated_at > $2
      ORDER BY updated_at ASC
      LIMIT 25`,
    [tenantId, since.toISOString()],
  );
  return rows.map((r) => ({
    at: r.updated_at.toISOString(),
    alert: {
      id: r.id,
      name: r.name,
      sku: r.sku,
      stock: r.stock,
      lowStockThreshold: r.low_stock_threshold,
      depleted: r.stock === 0,
    },
  }));
}

// ── BIR compliance export ───────────────────────────────────────────────────

export interface ComplianceRow {
  reference: string;
  /** ISO timestamp of the sale. */
  at: string;
  paymentMethod: string;
  paymentRef: string | null;
  /** VAT-inclusive official sale total (centavos). */
  grossCents: number;
  /** Net of VAT — the taxable base (centavos). */
  netCents: number;
  /** 12% output VAT extracted from the inclusive total (centavos). */
  vatCents: number;
  /** Customer discount applied (centavos). */
  discountCents: number;
}

export interface ComplianceLedger {
  /** Period covered, first day of month (YYYY-MM-01). */
  periodStart: string;
  /** Exclusive end (first day of the next month). */
  periodEnd: string;
  rows: ComplianceRow[];
  totals: {
    grossCents: number;
    netCents: number;
    vatCents: number;
    discountCents: number;
    count: number;
  };
}

interface SaleLedgerRow {
  reference: string;
  at: Date;
  payment_method: string;
  payment_ref: string | null;
  total_cents: number;
  subtotal_cents: number;
  vat_cents: number;
  discount_cents: number;
}

/**
 * Compile this Tenant's serialized sales for one calendar month (Manila) into
 * an ordered, immutable ledger ready for BIR-style tax preparation: gross
 * (VAT-inclusive) revenue, net taxable base, 12% output VAT, applied discounts
 * and the e-wallet reference. Chronological by invoice.
 *
 * `periodStart`/`periodEnd` are the local-month boundaries the caller resolved;
 * the comparison is done in Manila time so a sale at 11pm on the last day lands
 * in the right month.
 */
export async function getComplianceLedger(
  tenantId: string,
  periodStart: string,
  periodEnd: string,
): Promise<ComplianceLedger> {
  const { rows } = await query<SaleLedgerRow>(
    `SELECT reference, created_at AS at, payment_method, payment_ref,
            total_cents, subtotal_cents, vat_cents, discount_cents
       FROM sales
      WHERE tenant_id = $1
        AND (created_at AT TIME ZONE $4) >= $2::timestamp
        AND (created_at AT TIME ZONE $4) <  $3::timestamp
      ORDER BY created_at ASC, reference ASC`,
    [tenantId, periodStart, periodEnd, MNL],
  );

  const out: ComplianceRow[] = rows.map((r) => ({
    reference: r.reference,
    at: r.at.toISOString(),
    paymentMethod: r.payment_method,
    paymentRef: r.payment_ref,
    grossCents: r.total_cents,
    netCents: r.subtotal_cents,
    vatCents: r.vat_cents,
    discountCents: r.discount_cents,
  }));

  const totals = out.reduce(
    (acc, r) => {
      acc.grossCents += r.grossCents;
      acc.netCents += r.netCents;
      acc.vatCents += r.vatCents;
      acc.discountCents += r.discountCents;
      acc.count += 1;
      return acc;
    },
    { grossCents: 0, netCents: 0, vatCents: 0, discountCents: 0, count: 0 },
  );

  return { periodStart, periodEnd, rows: out, totals };
}
