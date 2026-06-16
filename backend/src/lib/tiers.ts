/**
 * Tier-based feature gating — the single backend source of truth for which
 * subscription TIER unlocks which capability.
 *
 * This is the feature-gating layer, deliberately distinct from the lowercase
 * billing `plan` (see billing/plans.ts), which drives price/MRR and product
 * capacity. The two are kept in lockstep — `plan` is the only knob a store
 * actually buys, and a tenant's `tier` is just its uppercase feature-gating
 * projection (`tierFromPlan`) — but they answer different questions: `plan`
 * says "what does this store pay and how many products may it hold?", `tier`
 * says "may this store reach this premium capability at all?".
 *
 * Tiers are strictly ordered: STARTER < BUSINESS < ENTERPRISE. Every feature
 * declares the MINIMUM tier that unlocks it; a tenant may use a feature when
 * its tier rank is at least that minimum, so higher tiers inherit everything
 * below them by construction.
 */

export type Tier = "STARTER" | "BUSINESS" | "ENTERPRISE";

/** Tiers in ascending order of capability. */
export const TIERS: readonly Tier[] = ["STARTER", "BUSINESS", "ENTERPRISE"] as const;

/** The default tier for every fresh registration / public demo signup. */
export const DEFAULT_TIER: Tier = "STARTER";

/** Ordinal rank used for `>=` tier comparisons (higher = more capable). */
const TIER_RANK: Record<Tier, number> = {
  STARTER: 0,
  BUSINESS: 1,
  ENTERPRISE: 2,
};

/** Human-readable label for the console / upgrade prompts. */
export const TIER_LABEL: Record<Tier, string> = {
  STARTER: "Starter",
  BUSINESS: "Business",
  ENTERPRISE: "Enterprise",
};

/**
 * The gateable capabilities. Keep this list in sync with the frontend mirror
 * (frontend/lib/tiers.ts) so the UI hides exactly what the API forbids.
 */
export type Feature =
  // STARTER — the core retail floor every store gets.
  | "pos_terminal" // Core POS terminal interface
  | "inventory_basic" // Basic inventory / catalogue management
  | "bir_receipts" // BIR-compliant receipts + serial invoicing
  | "digital_payments_qrph" // QRPH / e-wallet digital payments
  | "offline_mode" // Offline-capable register
  // BUSINESS — Starter PLUS the back-office ERP pillars.
  | "procurement_supply_chain" // Suppliers + purchase orders
  | "customer_relationship_crm" // Customers + loyalty
  | "finance_accounting" // Expenses + P&L / accounting
  | "multi_staff_roles" // Managers + multiple staff roles
  | "custom_branding" // Store Settings custom themes (presets + custom hex)
  // ENTERPRISE — Business PLUS scale + automation.
  | "manufacturing_bom" // Manufacturing / bill of materials
  | "human_resources_payroll" // HR roster, attendance + payroll
  | "multi_location" // Multiple store locations
  | "priority_support" // Priority support SLA
  | "predictive_inventory"; // Predictive inventory forecasting + AI insights

/**
 * The gating matrix: every feature → the minimum tier that unlocks it. This is
 * the explicit allow-list referenced by both the API guard middleware and the
 * frontend `<FeatureGate>`, aligned to the official VendoPOS product-tier matrix.
 */
export const FEATURE_MIN_TIER: Record<Feature, Tier> = {
  // STARTER — included in every tier.
  pos_terminal: "STARTER",
  inventory_basic: "STARTER",
  bir_receipts: "STARTER",
  digital_payments_qrph: "STARTER",
  offline_mode: "STARTER",
  // BUSINESS — Starter PLUS:
  procurement_supply_chain: "BUSINESS",
  customer_relationship_crm: "BUSINESS",
  finance_accounting: "BUSINESS",
  multi_staff_roles: "BUSINESS",
  custom_branding: "BUSINESS",
  // ENTERPRISE — Business PLUS:
  manufacturing_bom: "ENTERPRISE",
  human_resources_payroll: "ENTERPRISE",
  multi_location: "ENTERPRISE",
  priority_support: "ENTERPRISE",
  predictive_inventory: "ENTERPRISE",
};

/** Type guard: is this string one of the three known tiers? */
export function isTier(value: unknown): value is Tier {
  return typeof value === "string" && value in TIER_RANK;
}

/** Coerce an arbitrary value to a known tier, defaulting to STARTER. */
export function asTier(value: unknown): Tier {
  if (typeof value === "string") {
    const upper = value.toUpperCase();
    if (isTier(upper)) return upper;
  }
  return DEFAULT_TIER;
}

/**
 * Project the lowercase billing `plan` (starter/business/enterprise) onto its
 * uppercase feature-gating tier. This is the one place the two vocabularies
 * meet, so `tier` can never drift away from the plan a store actually bought.
 */
export function tierFromPlan(plan: string | null | undefined): Tier {
  return asTier(plan);
}

/** The ordinal rank of a tier (STARTER=0 … ENTERPRISE=2). */
export function tierRank(tier: Tier): number {
  return TIER_RANK[tier];
}

/** Does `have` meet or exceed the `min` tier threshold? */
export function tierAtLeast(have: Tier, min: Tier): boolean {
  return TIER_RANK[have] >= TIER_RANK[min];
}

/** The minimum tier that unlocks a given feature. */
export function minTierForFeature(feature: Feature): Tier {
  return FEATURE_MIN_TIER[feature];
}

/** May a tenant on `tier` use `feature`? */
export function featureAllowed(tier: Tier, feature: Feature): boolean {
  return tierAtLeast(tier, FEATURE_MIN_TIER[feature]);
}
