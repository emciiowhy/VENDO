/**
 * Subscription plan catalogue for the Super Admin console — the labels and peso
 * prices the Tenants directory, Leads provisioning and Overview quote. These
 * mirror the backend source of truth (`billing/plans.ts` → PLAN_SPECS, in
 * centavos), so an Enterprise seat reads ₱7,999/mo in both places.
 *
 * Everything platform-wide that used to live here as placeholder data (the demo
 * tenant directory, the fabricated headline metrics) is gone — those views now
 * read live figures from `/api/v1/admin/*`.
 */
export type Plan = "starter" | "business" | "enterprise";

/** Indicative monthly price per plan, in whole pesos (mirrors PLAN_SPECS). */
export const PLAN_PRICE: Record<Plan, number> = {
  starter: 499,
  business: 1499,
  enterprise: 7999,
};

export const PLAN_LABEL: Record<Plan, string> = {
  starter: "Starter",
  business: "Business",
  enterprise: "Enterprise",
};
