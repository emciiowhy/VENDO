/**
 * Growth & churn metrics for the Super Admin console — the counterpart to the
 * recurring-revenue picture in billing.repository.ts. Everything here is DERIVED
 * from the current `tenants` rows (status, trial start, onboarding date); the
 * platform doesn't snapshot subscription history, so — exactly like the `mrrTrend`
 * curve — these are a faithful reconstruction from live state rather than an event
 * log. The computation is a pure function over the rows + an injected clock, so it
 * unit-tests without a database.
 *
 * Definitions, pinned so the numbers can't drift:
 *   • A store "started a trial" iff it has a `trialStartsAt` (self-service signup);
 *     operator-provisioned stores never trialled and are excluded from conversion.
 *   • "Converted" = started a trial AND is now `active` (paying).
 *   • "Churned" = currently `trial_expired` or `suspended` (a terminal lost state).
 *   • A signup-month cohort is "retained" for the stores still live (`active` or
 *     `trial`) out of those onboarded that month.
 */

export type TenantStatus = "trial" | "active" | "trial_expired" | "suspended";

export interface GrowthTenantRow {
  status: TenantStatus;
  /** When the store's trial began, or null if it never trialled (operator-provisioned). */
  trialStartsAt: Date | null;
  /** When the store was onboarded (drives the cohort buckets). */
  createdAt: Date;
}

export interface ConversionMetric {
  /** Stores that ever started a trial. */
  trialsStarted: number;
  /** Of those, how many are now paying (`active`). */
  converted: number;
  /** converted / trialsStarted as a whole percent, or null when no trials yet. */
  ratePct: number | null;
}

export interface ChurnMetric {
  /** Currently paying stores. */
  activeStores: number;
  /** Stores in a terminal lost state (`trial_expired` / `suspended`). */
  churnedStores: number;
  /** churned / (active + churned) as a whole percent, or null when neither exists. */
  ratePct: number | null;
}

export interface CohortPoint {
  /** First day of the signup month, ISO date (YYYY-MM-01). */
  month: string;
  /** Stores onboarded that month. */
  signups: number;
  /** Of those, how many are still live (`active` or `trial`). */
  retained: number;
  /** retained / signups as a whole percent, or null for an empty month. */
  retentionPct: number | null;
}

export interface GrowthMetrics {
  conversion: ConversionMetric;
  churn: ChurnMetric;
  /** Signup-month retention, oldest → newest (last 6 months, inclusive). */
  cohorts: CohortPoint[];
}

const LIVE: ReadonlySet<TenantStatus> = new Set(["active", "trial"]);
const CHURNED: ReadonlySet<TenantStatus> = new Set(["trial_expired", "suspended"]);

/** Whole-percent ratio, or null when the denominator is zero (nothing to divide). */
function pct(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : null;
}

/** YYYY-MM-01 key for a UTC year/month, matching the billing trend format. */
function monthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
}

/**
 * Reduce the tenant register to the conversion, churn and signup-cohort figures
 * the console shows. `now` is injected so the six-month cohort window is testable.
 */
export function computeGrowthMetrics(rows: readonly GrowthTenantRow[], now: Date): GrowthMetrics {
  let trialsStarted = 0;
  let converted = 0;
  let activeStores = 0;
  let churnedStores = 0;

  for (const r of rows) {
    if (r.trialStartsAt) {
      trialsStarted += 1;
      if (r.status === "active") converted += 1;
    }
    if (r.status === "active") activeStores += 1;
    if (CHURNED.has(r.status)) churnedStores += 1;
  }

  // Six-month signup cohorts (this month back five), keyed in UTC like mrrTrend.
  const cohorts: CohortPoint[] = [];
  for (let i = 5; i >= 0; i--) {
    const year = now.getUTCFullYear();
    const monthIndex = now.getUTCMonth() - i;
    const start = Date.UTC(year, monthIndex, 1);
    const end = Date.UTC(year, monthIndex + 1, 1);
    let signups = 0;
    let retained = 0;
    for (const r of rows) {
      const t = r.createdAt.getTime();
      if (t >= start && t < end) {
        signups += 1;
        if (LIVE.has(r.status)) retained += 1;
      }
    }
    const d = new Date(start);
    cohorts.push({
      month: monthKey(d.getUTCFullYear(), d.getUTCMonth()),
      signups,
      retained,
      retentionPct: pct(retained, signups),
    });
  }

  return {
    conversion: { trialsStarted, converted, ratePct: pct(converted, trialsStarted) },
    churn: {
      activeStores,
      churnedStores,
      ratePct: pct(churnedStores, activeStores + churnedStores),
    },
    cohorts,
  };
}
