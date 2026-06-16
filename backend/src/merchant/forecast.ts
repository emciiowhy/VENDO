/**
 * Predictive inventory forecasting — the ENTERPRISE reorder engine.
 *
 * The maths is a PURE function (no database) so it can be unit-tested in
 * isolation (see forecast.test.ts); the repository feeds it real per-product
 * aggregates pulled from the `sales` / `sale_items` ledger. Nothing here is
 * fabricated: a product's projected days-to-stockout and suggested order
 * quantity are derived from its ACTUAL trailing-window selling pace.
 *
 * Velocity model: average daily sales = units sold in the trailing window ÷
 * the window length (a conservative trailing mean — a product created
 * mid-window reads slightly slow rather than spiking). A reorder is suggested
 * to cover `coverDays` of that pace, less what's already on the shelf.
 */

/** Knobs for the forecast horizon, defaulted by the router. */
export interface ForecastOptions {
  /** Trailing window (days) over which selling pace is measured. */
  windowDays: number;
  /** Days of stock a suggested reorder should cover going forward. */
  coverDays: number;
  /** Only flag items projected to deplete within this many days. */
  horizonDays: number;
}

export const DEFAULT_FORECAST_OPTIONS: ForecastOptions = {
  windowDays: 30,
  coverDays: 14,
  horizonDays: 21,
};

/** One product's trailing-window aggregate, as read from the ledger. */
export interface ProductSalesRow {
  id: string;
  name: string;
  sku: string | null;
  /** Current on-hand. */
  stock: number;
  /** Configured low-stock floor (0 = not tracked). */
  lowStockThreshold: number;
  /** Units sold in the trailing window (actual sales only — voids/returns excluded). */
  unitsSold: number;
}

/** How soon a flagged item needs attention. */
export type ForecastUrgency = "out" | "critical" | "soon" | "low";

export interface ForecastItem {
  productId: string;
  name: string;
  sku: string | null;
  stock: number;
  lowStockThreshold: number;
  unitsSoldInWindow: number;
  /** Average units sold per day across the window (2 d.p.). */
  dailyVelocity: number;
  /** Whole days until stock hits zero at the current pace; null when not selling. */
  daysToStockout: number | null;
  /** Units to order to cover `coverDays` of demand (or refill a slow low item). */
  suggestedOrderQty: number;
  urgency: ForecastUrgency;
}

export interface ReorderForecast {
  generatedAt: string;
  windowDays: number;
  coverDays: number;
  horizonDays: number;
  items: ForecastItem[];
  summary: {
    /** Number of at-risk items in the forecast. */
    atRisk: number;
    /** How many of those are already fully out of stock. */
    outOfStock: number;
    /** Total units the forecast suggests ordering. */
    suggestedUnitsTotal: number;
  };
}

/** Rank for sorting the urgency tiers most-pressing first. */
const URGENCY_RANK: Record<ForecastUrgency, number> = {
  out: 0,
  critical: 1,
  soon: 2,
  low: 3,
};

/** Round to 2 decimal places (velocity is a rate, not money). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Build a reorder forecast from per-product sales aggregates.
 *
 * An item is "at risk" (and so appears in the forecast) when its pace projects
 * it to run out within `horizonDays`, OR it's already at/below its low-stock
 * floor. Items with nothing to do (suggested order of 0) are dropped. Results
 * are ordered most-urgent first: out of stock, then soonest to deplete.
 */
export function buildForecast(
  rows: ProductSalesRow[],
  opts: ForecastOptions = DEFAULT_FORECAST_OPTIONS,
  now: Date = new Date(),
): ReorderForecast {
  const windowDays = Math.max(1, opts.windowDays);
  const coverDays = Math.max(1, opts.coverDays);
  const horizonDays = Math.max(1, opts.horizonDays);

  const items: ForecastItem[] = [];
  for (const row of rows) {
    const velocity = row.unitsSold / windowDays;
    const selling = velocity > 0;
    const daysToStockout = selling ? Math.floor(row.stock / velocity) : null;
    const lowFloor = row.lowStockThreshold > 0 && row.stock <= row.lowStockThreshold;

    const atRisk =
      (daysToStockout !== null && daysToStockout <= horizonDays) || lowFloor;
    if (!atRisk) continue;

    const suggestedOrderQty = selling
      ? Math.max(Math.ceil(velocity * coverDays) - row.stock, 0)
      : Math.max(row.lowStockThreshold - row.stock, 0);
    if (suggestedOrderQty <= 0) continue;

    let urgency: ForecastUrgency;
    if (row.stock === 0) urgency = "out";
    else if (daysToStockout !== null && daysToStockout <= 3) urgency = "critical";
    else if (daysToStockout !== null && daysToStockout <= horizonDays) urgency = "soon";
    else urgency = "low";

    items.push({
      productId: row.id,
      name: row.name,
      sku: row.sku,
      stock: row.stock,
      lowStockThreshold: row.lowStockThreshold,
      unitsSoldInWindow: row.unitsSold,
      dailyVelocity: round2(velocity),
      daysToStockout,
      suggestedOrderQty,
      urgency,
    });
  }

  items.sort((a, b) => {
    if (a.urgency !== b.urgency) return URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
    // Within a tier: soonest stockout first (nulls last), then lowest stock.
    const da = a.daysToStockout ?? Number.POSITIVE_INFINITY;
    const db = b.daysToStockout ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    if (a.stock !== b.stock) return a.stock - b.stock;
    return a.name.localeCompare(b.name);
  });

  return {
    generatedAt: now.toISOString(),
    windowDays,
    coverDays,
    horizonDays,
    items,
    summary: {
      atRisk: items.length,
      outOfStock: items.filter((i) => i.stock === 0).length,
      suggestedUnitsTotal: items.reduce((sum, i) => sum + i.suggestedOrderQty, 0),
    },
  };
}
