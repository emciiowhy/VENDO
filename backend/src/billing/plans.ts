/**
 * Subscription plan catalogue — the single backend source of truth for what
 * each tier costs and what it allows. Plan keys match the `tenants.plan` CHECK
 * constraint (starter / business / enterprise), and the peso prices mirror the
 * figures shown to Super Admins on the console.
 *
 * Two things hang off this:
 *   • MRR aggregation — Monthly Recurring Revenue is the sum of every active
 *     Tenant's plan price (see billing.repository.ts).
 *   • Capacity guardrails — `productLimit` caps how many catalog items a Tenant
 *     on that tier may hold; the merchant layer enforces it with a clean 403
 *     (see products.router.ts → assertProductCapacity).
 *
 * Money is integer centavos throughout, like the rest of the platform.
 */
export type Plan = "starter" | "business" | "enterprise";

export const PLANS: readonly Plan[] = ["starter", "business", "enterprise"] as const;

export interface PlanSpec {
  key: Plan;
  label: string;
  /** Monthly subscription price, in centavos (the MRR contribution per Tenant). */
  priceCents: number;
  /** Max active+inactive catalog products. `null` = unlimited (Enterprise). */
  productLimit: number | null;
}

export const PLAN_SPECS: Record<Plan, PlanSpec> = {
  starter: { key: "starter", label: "Starter", priceCents: 49_900, productLimit: 30 },
  business: { key: "business", label: "Business", priceCents: 149_900, productLimit: 300 },
  enterprise: { key: "enterprise", label: "Enterprise", priceCents: 799_900, productLimit: null },
};

/**
 * The platform's cut of merchant GMV (gross merchandise value), used to chart
 * transaction-fee revenue alongside subscription MRR. 0.5% is a representative
 * blended rate — the real number would come from a payments contract.
 */
export const PLATFORM_FEE_RATE = 0.005;

/** Coerce an arbitrary string to a known plan, defaulting to Starter. */
export function asPlan(value: string | null | undefined): Plan {
  return value === "business" || value === "enterprise" ? value : "starter";
}

/** Product capacity for a plan; `null` means unlimited. */
export function productLimitFor(plan: Plan): number | null {
  return PLAN_SPECS[plan].productLimit;
}
