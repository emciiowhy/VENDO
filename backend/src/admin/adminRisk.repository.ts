import { query } from "../db.js";
import { asPlan, type Plan } from "../billing/plans.js";

/**
 * The churn-risk watchlist for the Super Admin overview — the stores that need
 * attention BEFORE they cancel. Platform-wide (the operator sits above every
 * Tenant), so deliberately NOT tenant-fenced; the route is SUPER_ADMIN-gated.
 *
 * "At risk" is resolved live from the tenant lifecycle (`status` / `trial_ends_at`,
 * the same columns the trial engine owns) plus the sales ledger's last-activity
 * timestamp. Nothing is snapshotted: a store that sells today drops off the list
 * on the next load, and a trial that lapses climbs it — the view is always true.
 *
 *   suspended / trial_expired → danger (already lost or frozen)
 *   trial ending ≤ 3 days     → warning (closing window, act now)
 *   active but silent ≥ 14d   → warning (dormant — the leading churn signal)
 */

/** A store silent at or beyond this many days reads as dormant. */
const DORMANT_DAYS = 14;
/** A trial with this many days or fewer left is "ending soon". */
const TRIAL_SOON_DAYS = 3;

export type RiskReason =
  | "suspended"
  | "trial_expired"
  | "trial_ending"
  | "dormant"
  | "never_sold";

export type RiskSeverity = "danger" | "warning";

export interface RiskTenant {
  id: string;
  name: string;
  slug: string | null;
  plan: Plan;
  status: string;
  ownerName: string | null;
  ownerEmail: string | null;
  reason: RiskReason;
  severity: RiskSeverity;
  /** Days since the store's last register activity, or null if it never sold. */
  daysSinceActivity: number | null;
  /** Days until the trial window closes (negative once lapsed), or null. */
  daysToTrialEnd: number | null;
}

interface Row {
  id: string;
  name: string;
  slug: string | null;
  plan: string;
  status: string;
  created_at: Date;
  trial_ends_at: Date | null;
  owner_name: string | null;
  owner_email: string | null;
  last_sale_at: Date | null;
}

const DAY_MS = 86_400_000;
const wholeDaysSince = (d: Date): number => Math.floor((Date.now() - d.getTime()) / DAY_MS);
const wholeDaysUntil = (d: Date): number => Math.ceil((d.getTime() - Date.now()) / DAY_MS);

/**
 * Classify a tenant row, or null when it's healthy (and so stays off the list).
 * Order matters: a frozen/lost state outranks a dormancy signal.
 */
function classify(r: Row): RiskTenant | null {
  const last = r.last_sale_at;
  const daysSinceActivity = last ? wholeDaysSince(last) : null;
  const daysToTrialEnd = r.trial_ends_at ? wholeDaysUntil(r.trial_ends_at) : null;

  let reason: RiskReason | null = null;
  let severity: RiskSeverity = "warning";

  if (r.status === "suspended") {
    reason = "suspended";
    severity = "danger";
  } else if (r.status === "trial_expired") {
    reason = "trial_expired";
    severity = "danger";
  } else if (r.status === "trial") {
    // A live trial only surfaces once its window is closing.
    if (daysToTrialEnd !== null && daysToTrialEnd <= TRIAL_SOON_DAYS) {
      reason = "trial_ending";
      severity = "warning";
    }
  } else if (r.status === "active") {
    if (last === null) {
      // Never rang a sale — only a concern once it's had time to get going.
      if (wholeDaysSince(r.created_at) >= DORMANT_DAYS) {
        reason = "never_sold";
        severity = "warning";
      }
    } else if (daysSinceActivity !== null && daysSinceActivity >= DORMANT_DAYS) {
      reason = "dormant";
      severity = "warning";
    }
  }

  if (!reason) return null;
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    plan: asPlan(r.plan),
    status: r.status,
    ownerName: r.owner_name,
    ownerEmail: r.owner_email,
    reason,
    severity,
    daysSinceActivity,
    daysToTrialEnd,
  };
}

/** Rank the list: danger first, then by the most urgent signal within each band. */
function urgency(t: RiskTenant): number {
  // Higher sorts first. Danger gets a large base; within a band the longer a
  // store has been silent (or the more a trial has overshot) the higher it sits.
  const band = t.severity === "danger" ? 1_000_000 : 0;
  if (t.reason === "trial_ending" && t.daysToTrialEnd !== null) {
    return band + (TRIAL_SOON_DAYS - t.daysToTrialEnd); // closing soonest → highest
  }
  return band + (t.daysSinceActivity ?? 9_999);
}

/**
 * The live churn-risk watchlist, most urgent first. One lateral-join scan over
 * tenants → oldest owner (for the contact) → last register activity. Healthy
 * stores are filtered out in-process so the query stays a single pass.
 */
export async function getAtRiskTenants(): Promise<RiskTenant[]> {
  const { rows } = await query<Row>(
    `SELECT t.id, t.name, t.slug, t.plan, t.status, t.created_at, t.trial_ends_at,
            o.name AS owner_name, o.email AS owner_email,
            s.last_sale_at
       FROM tenants t
       LEFT JOIN LATERAL (
         SELECT name, email FROM users
          WHERE tenant_id = t.id AND role = 'MERCHANT_OWNER'
          ORDER BY created_at ASC LIMIT 1
       ) o ON TRUE
       LEFT JOIN LATERAL (
         SELECT max(created_at) AS last_sale_at FROM sales WHERE tenant_id = t.id
       ) s ON TRUE`,
  );
  return rows
    .map(classify)
    .filter((t): t is RiskTenant => t !== null)
    .sort((a, b) => urgency(b) - urgency(a));
}
