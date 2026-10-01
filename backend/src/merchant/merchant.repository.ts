import { query } from "../db.js";
import {
  DEFAULT_FORECAST_OPTIONS,
  buildForecast,
  type ForecastOptions,
  type ProductSalesRow,
  type ReorderForecast,
} from "./forecast.js";

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
            count(*) FILTER (WHERE kind = 'sale')::int AS txns,
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
            count(*) FILTER (WHERE kind = 'sale')::int AS txns
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
    `SELECT payment_method AS method, count(*) FILTER (WHERE kind = 'sale')::int AS txns,
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

// ── Ranged sales totals (owner overview strip) ──────────────────────────────

/** The windows the owner overview can total sales over. */
export const SALES_RANGES = ["today", "7d", "30d", "month", "all"] as const;
export type SalesRange = (typeof SALES_RANGES)[number];

export interface SalesTotals {
  range: SalesRange;
  /** Inclusive window start (YYYY-MM-DD, Manila). */
  from: string;
  /** Window end = today (YYYY-MM-DD, Manila). */
  to: string;
  /** Total sales over the window (centavos); voids/returns net automatically. */
  grossCents: number;
  /** Count of forward sales (contra void/return rows excluded). */
  txns: number;
  /** Average order value = gross / txns (centavos), 0 when no sales. */
  aovCents: number;
  /** Store expenses over the window (centavos); null when not entitled to Finance. */
  expensesCents: number | null;
  /** Sales − expenses (centavos); null when expenses aren't available. */
  netCents: number | null;
}

/** Subtract `n` calendar days from a YYYY-MM-DD string (PH has no DST). */
function subtractDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Total sales over a range for the owner overview. One cheap aggregate over
 * `sales`, scoped to the Tenant and the Manila calendar window. `grossCents`
 * sums `total_cents` across all rows so contra void/return rows net out (they
 * already net in the Pulse); `txns` counts only forward `kind = 'sale'` rows.
 *
 * When `includeExpenses` is set (the caller gates this on the Finance feature),
 * store expenses over the same window are summed from the `expenses` ledger and
 * `netCents = gross − expenses`; otherwise both are null so the UI hides them.
 */
export async function getSalesTotals(
  tenantId: string,
  range: SalesRange,
  includeExpenses = false,
): Promise<SalesTotals> {
  const day = `(s.created_at AT TIME ZONE $2)::date`;
  const today = `(now() AT TIME ZONE $2)::date`;
  // `range` is a validated enum (never user text), safe to interpolate.
  const windowClause =
    range === "today"
      ? `${day} = ${today}`
      : range === "7d"
        ? `${day} > ${today} - 7`
        : range === "30d"
          ? `${day} > ${today} - 30`
          : range === "month"
            ? `${day} >= date_trunc('month', ${today})::date`
            : `TRUE`;

  const { rows } = await query<{ gross: string; txns: number; first_day: string | null; today: string }>(
    `SELECT coalesce(sum(s.total_cents), 0)::bigint          AS gross,
            count(*) FILTER (WHERE s.kind = 'sale')::int     AS txns,
            to_char(min(${day}), 'YYYY-MM-DD')               AS first_day,
            to_char(${today}, 'YYYY-MM-DD')                  AS today
       FROM sales s
      WHERE s.tenant_id = $1 AND (${windowClause})`,
    [tenantId, MNL],
  );
  const r = rows[0];
  const to = r.today;
  const grossCents = Number(r.gross);
  const txns = r.txns;
  const from =
    range === "today"
      ? to
      : range === "7d"
        ? subtractDays(to, 6)
        : range === "30d"
          ? subtractDays(to, 29)
          : range === "month"
            ? `${to.slice(0, 7)}-01`
            : (r.first_day ?? to);

  let expensesCents: number | null = null;
  let netCents: number | null = null;
  if (includeExpenses) {
    // Expenses are dated by `incurred_on` (a plain DATE). "all" has no lower
    // bound so expenses predating the first sale still count toward net.
    const exp = await query<{ expenses: string }>(
      `SELECT coalesce(sum(amount_cents), 0)::bigint AS expenses
         FROM expenses
        WHERE tenant_id = $1 AND incurred_on <= $2::date
          AND ($3::date IS NULL OR incurred_on >= $3::date)`,
      [tenantId, to, range === "all" ? null : from],
    );
    expensesCents = Number(exp.rows[0].expenses);
    netCents = grossCents - expensesCents;
  }

  return {
    range,
    from,
    to,
    grossCents,
    txns,
    aovCents: txns > 0 ? Math.round(grossCents / txns) : 0,
    expensesCents,
    netCents,
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

// ── Owner at-a-glance summary (mobile) ──────────────────────────────────────

export interface OwnerSummary {
  /** Local calendar day these figures cover (YYYY-MM-DD, Manila). */
  day: string;
  /** Today's gross takings (net of any voids/returns), centavos. */
  grossCents: number;
  /** Registers currently open (cashier shifts in the `open` state). */
  activeRegisters: number;
  /** Products currently at/below their low-stock floor. */
  lowStockCount: number;
}

/**
 * The three vital signs an owner glances at from their phone while away from the
 * shop: today's takings, how many tills are open right now, and how many items
 * need restocking. One cheap round of aggregates, strictly tenant-fenced and
 * evaluated in Manila time so "today" lines up with the local retail day.
 */
export async function getOwnerSummary(tenantId: string): Promise<OwnerSummary> {
  const res = await query<{
    day: string;
    gross: string;
    active_registers: number;
    low_stock: number;
  }>(
    `SELECT
        to_char((now() AT TIME ZONE $2)::date, 'YYYY-MM-DD') AS day,
        (SELECT coalesce(sum(total_cents), 0)::bigint FROM sales
           WHERE tenant_id = $1
             AND (created_at AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date) AS gross,
        (SELECT count(*)::int FROM cashier_shifts
           WHERE tenant_id = $1 AND status = 'open') AS active_registers,
        (SELECT count(*)::int FROM products
           WHERE tenant_id = $1 AND is_active = TRUE
             AND low_stock_threshold > 0 AND stock <= low_stock_threshold) AS low_stock`,
    [tenantId, MNL],
  );
  const r = res.rows[0];
  return {
    day: r.day,
    grossCents: Number(r.gross),
    activeRegisters: r.active_registers,
    lowStockCount: r.low_stock,
  };
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

// ── Predictive inventory forecast (ENTERPRISE) ──────────────────────────────

/**
 * Per active product: current on-hand + its low-stock floor, plus the units it
 * actually sold in the trailing window (real sales only — `kind = 'sale'`, so
 * voids/returns don't inflate the pace). This is the live input the pure
 * forecast engine projects from; strictly fenced to one Tenant on both sides of
 * the join. The pure maths + filtering live in forecast.ts so they're testable
 * without a database.
 */
export async function getReorderForecast(
  tenantId: string,
  opts: ForecastOptions = DEFAULT_FORECAST_OPTIONS,
): Promise<ReorderForecast> {
  const { rows } = await query<{
    id: string;
    name: string;
    sku: string | null;
    stock: number;
    low_stock_threshold: number;
    units_sold: string;
  }>(
    `SELECT p.id, p.name, p.sku, p.stock, p.low_stock_threshold,
            coalesce(v.units_sold, 0)::bigint AS units_sold
       FROM products p
       LEFT JOIN (
         SELECT si.product_id, sum(si.qty) AS units_sold
           FROM sale_items si
           JOIN sales s ON s.id = si.sale_id
          WHERE s.tenant_id = $1
            AND s.kind = 'sale'
            AND s.created_at >= now() - make_interval(days => $2::int)
          GROUP BY si.product_id
       ) v ON v.product_id = p.id
      WHERE p.tenant_id = $1 AND p.is_active = TRUE`,
    [tenantId, opts.windowDays],
  );

  const sales: ProductSalesRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    sku: r.sku,
    stock: r.stock,
    lowStockThreshold: r.low_stock_threshold,
    unitsSold: Number(r.units_sold),
  }));

  return buildForecast(sales, opts);
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
