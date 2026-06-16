/**
 * Tier-based feature gating — the frontend mirror of the backend matrix
 * (backend/src/lib/tiers.ts). The API is the real boundary (it 403s a
 * below-tier request); this mirror lets the UI hide exactly what the API
 * forbids, so a Starter store never sees a control it can't use.
 *
 * Keep the `Feature` union and `FEATURE_MIN_TIER` map in sync with the backend.
 * Tiers are strictly ordered STARTER < BUSINESS < ENTERPRISE; higher tiers
 * inherit every capability below them.
 */

export type Tier = "STARTER" | "BUSINESS" | "ENTERPRISE";

/** Tiers in ascending order of capability. */
export const TIERS: readonly Tier[] = ["STARTER", "BUSINESS", "ENTERPRISE"] as const;

/** The default tier when none is known (most restrictive). */
export const DEFAULT_TIER: Tier = "STARTER";

const TIER_RANK: Record<Tier, number> = { STARTER: 0, BUSINESS: 1, ENTERPRISE: 2 };

/** Human-readable label for upgrade prompts. */
export const TIER_LABEL: Record<Tier, string> = {
  STARTER: "Starter",
  BUSINESS: "Business",
  ENTERPRISE: "Enterprise",
};

/** The gateable capabilities (mirror of the backend `Feature` union). */
export type Feature =
  // STARTER
  | "pos_terminal"
  | "inventory_basic"
  | "bir_receipts"
  | "digital_payments_qrph"
  | "offline_mode"
  // BUSINESS
  | "procurement_supply_chain"
  | "customer_relationship_crm"
  | "finance_accounting"
  | "multi_staff_roles"
  | "custom_branding"
  // ENTERPRISE
  | "manufacturing_bom"
  | "human_resources_payroll"
  | "multi_location"
  | "priority_support"
  | "predictive_inventory";

/** Every feature → the minimum tier that unlocks it (mirror of the backend matrix). */
export const FEATURE_MIN_TIER: Record<Feature, Tier> = {
  pos_terminal: "STARTER",
  inventory_basic: "STARTER",
  bir_receipts: "STARTER",
  digital_payments_qrph: "STARTER",
  offline_mode: "STARTER",
  procurement_supply_chain: "BUSINESS",
  customer_relationship_crm: "BUSINESS",
  finance_accounting: "BUSINESS",
  multi_staff_roles: "BUSINESS",
  custom_branding: "BUSINESS",
  manufacturing_bom: "ENTERPRISE",
  human_resources_payroll: "ENTERPRISE",
  multi_location: "ENTERPRISE",
  priority_support: "ENTERPRISE",
  predictive_inventory: "ENTERPRISE",
};

/** Type guard for the three known tiers. */
export function isTier(value: unknown): value is Tier {
  return typeof value === "string" && value in TIER_RANK;
}

/** Coerce a loose value (e.g. a session field) to a known tier, defaulting to STARTER. */
export function asTier(value: unknown): Tier {
  if (typeof value === "string") {
    const upper = value.toUpperCase();
    if (isTier(upper)) return upper;
  }
  return DEFAULT_TIER;
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
