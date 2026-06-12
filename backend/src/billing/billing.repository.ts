import { query } from "../db.js";
import {
  PLATFORM_FEE_RATE,
  PLAN_SPECS,
  PLANS,
  asPlan,
  productLimitFor,
  type Plan,
} from "./plans.js";

/**
 * Billing & MRR analytics for the Super Admin console, plus the small per-Tenant
 * lookups the merchant capacity guardrail needs.
 *
 * The analytics here are platform-wide (the Super Admin sits above every
 * Tenant), so — unlike the merchant queries — they are deliberately NOT fenced
 * to a single tenant_id. The merchant-facing helpers below (`getTenantPlan`,
 * `countProducts`) ARE scoped, since they answer "may THIS store add another
 * product?".
 */

// ── Per-Tenant capacity guardrail support ──────────────────────────────────

/** The plan a Tenant is on (defaults Starter if somehow unset). */
export async function getTenantPlan(tenantId: string): Promise<Plan> {
  const { rows } = await query<{ plan: string }>(`SELECT plan FROM tenants WHERE id = $1`, [
    tenantId,
  ]);
  return asPlan(rows[0]?.plan);
}

/** How many catalog products a Tenant currently holds (active + inactive). */
export async function countProducts(tenantId: string): Promise<number> {
  const { rows } = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM products WHERE tenant_id = $1`,
    [tenantId],
  );
  return rows[0]?.n ?? 0;
}

// ── Platform MRR analytics ──────────────────────────────────────────────────

export interface PlanBreakdownRow {
  plan: Plan;
  label: string;
  /** Active subscribing stores on this tier. */
  stores: number;
  /** Per-store monthly price (centavos). */
  priceCents: number;
  /** stores × priceCents — this tier's MRR contribution (centavos). */
  mrrCents: number;
}

export interface FeeTrendPoint {
  /** First day of the month, ISO date (YYYY-MM-01). */
  month: string;
  /** Gross merchandise value settled that month (centavos). */
  gmvCents: number;
  /** Platform transaction-fee revenue that month (centavos). */
  feeCents: number;
  /** Receipts committed that month. */
  txns: number;
}

export interface MrrTrendPoint {
  /** First day of the month, ISO date (YYYY-MM-01). */
  month: string;
  /** Cumulative MRR from Tenants active and onboarded by the end of that month. */
  mrrCents: number;
  /** Active subscribing stores onboarded by then. */
  stores: number;
}

export interface BillingAnalytics {
  /** Total Monthly Recurring Revenue across all active Tenants (centavos). */
  mrrCents: number;
  /** Active subscribing stores (status = 'active'). */
  activeStores: number;
  /** Blended Average Revenue Per Account (mrr / activeStores), centavos. */
  arpaCents: number;
  /** Annual Run Rate (mrr × 12), centavos. */
  arrCents: number;
  byPlan: PlanBreakdownRow[];
  feeTrend: FeeTrendPoint[];
  mrrTrend: MrrTrendPoint[];
  feeRatePct: number;
}

/**
 * Aggregate the platform's recurring-revenue picture in a couple of cheap
 * GROUP BY scans: subscriber counts per plan (→ MRR from the plan catalogue),
 * and a six-month transaction-fee trend derived from the sales ledger.
 */
export async function getBillingAnalytics(): Promise<BillingAnalytics> {
  // Active subscribers per plan → MRR is computed from the plan catalogue so it
  // can never drift from the prices the rest of the platform quotes.
  const planRows = await query<{ plan: string; stores: number }>(
    `SELECT plan, count(*)::int AS stores
       FROM tenants
      WHERE status = 'active'
      GROUP BY plan`,
  );
  const storesByPlan = new Map<Plan, number>();
  for (const r of planRows.rows) storesByPlan.set(asPlan(r.plan), r.stores);

  const byPlan: PlanBreakdownRow[] = PLANS.map((plan) => {
    const stores = storesByPlan.get(plan) ?? 0;
    const priceCents = PLAN_SPECS[plan].priceCents;
    return {
      plan,
      label: PLAN_SPECS[plan].label,
      stores,
      priceCents,
      mrrCents: stores * priceCents,
    };
  });

  const mrrCents = byPlan.reduce((sum, p) => sum + p.mrrCents, 0);
  const activeStores = byPlan.reduce((sum, p) => sum + p.stores, 0);
  const arpaCents = activeStores > 0 ? Math.round(mrrCents / activeStores) : 0;

  // Six-month transaction-fee trend, platform-wide, bucketed by calendar month
  // in Manila time (PH retail day) so the chart lines up with local books.
  const feeRows = await query<{ month: Date; gmv: number; txns: number }>(
    `SELECT date_trunc('month', created_at AT TIME ZONE 'Asia/Manila') AS month,
            coalesce(sum(total_cents), 0)::bigint AS gmv,
            count(*)::int AS txns
       FROM sales
      WHERE created_at >= (now() AT TIME ZONE 'Asia/Manila') - interval '6 months'
      GROUP BY 1
      ORDER BY 1 ASC`,
  );

  const feeTrend: FeeTrendPoint[] = feeRows.rows.map((r) => {
    const gmvCents = Number(r.gmv);
    return {
      month: toMonthKey(r.month),
      gmvCents,
      feeCents: Math.round(gmvCents * PLATFORM_FEE_RATE),
      txns: r.txns,
    };
  });

  // Historical MRR curve: for each of the last 6 months, sum the plan price of
  // every active Tenant onboarded on or before that month's end. Derived from
  // tenant onboarding dates (we don't snapshot MRR), which yields a faithful
  // cumulative growth curve.
  const tenantRows = await query<{ plan: string; created_at: Date }>(
    `SELECT plan, created_at FROM tenants WHERE status = 'active'`,
  );
  const now = new Date();
  const mrrTrend: MrrTrendPoint[] = [];
  for (let i = 5; i >= 0; i--) {
    // End of the month i months ago (exclusive upper bound = first of next month).
    const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1));
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    let cents = 0;
    let stores = 0;
    for (const t of tenantRows.rows) {
      if (t.created_at < cutoff) {
        cents += PLAN_SPECS[asPlan(t.plan)].priceCents;
        stores += 1;
      }
    }
    const y = monthStart.getUTCFullYear();
    const m = String(monthStart.getUTCMonth() + 1).padStart(2, "0");
    mrrTrend.push({ month: `${y}-${m}-01`, mrrCents: cents, stores });
  }

  return {
    mrrCents,
    activeStores,
    arpaCents,
    arrCents: mrrCents * 12,
    byPlan,
    feeTrend,
    mrrTrend,
    feeRatePct: PLATFORM_FEE_RATE * 100,
  };
}

// ── Subscriber directory (drill-down) ───────────────────────────────────────

export interface Subscriber {
  id: string;
  name: string;
  slug: string | null;
  plan: Plan;
  status: string;
  createdAt: string;
  ownerName: string | null;
  ownerEmail: string | null;
}

/**
 * The live subscriber register for the Super Admin drill-down: every Tenant
 * with its owning MERCHANT_OWNER's contact details, newest first. Platform-wide
 * (the operator sits above all Tenants).
 */
export async function getSubscribers(): Promise<Subscriber[]> {
  const { rows } = await query<{
    id: string;
    name: string;
    slug: string | null;
    plan: string;
    status: string;
    created_at: Date;
    owner_name: string | null;
    owner_email: string | null;
  }>(
    `SELECT t.id, t.name, t.slug, t.plan, t.status, t.created_at,
            o.name AS owner_name, o.email AS owner_email
       FROM tenants t
       LEFT JOIN LATERAL (
         SELECT name, email FROM users
          WHERE tenant_id = t.id AND role = 'MERCHANT_OWNER'
          ORDER BY created_at ASC LIMIT 1
       ) o ON TRUE
      ORDER BY t.created_at DESC`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    plan: asPlan(r.plan),
    status: r.status,
    createdAt: r.created_at.toISOString(),
    ownerName: r.owner_name,
    ownerEmail: r.owner_email,
  }));
}

/** A Tenant approaching/over its plan's product cap, for the guardrail message. */
export { productLimitFor };

function toMonthKey(d: Date): string {
  // date_trunc returns a timestamp; format as YYYY-MM-01 without TZ drift.
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}
