/**
 * Mock tenant directory for the Super Admin command center. High-fidelity
 * Philippine business data — real-shaped slugs, peso MRR, local cities and
 * owner names — standing in until the platform read API exists.
 *
 * Plan names follow CONTEXT.md and the `tenants.plan` CHECK constraint
 * (starter / business / enterprise), not generic BASIC/PRO tiers.
 */
export type Plan = "starter" | "business" | "enterprise";
export type TenantStatus = "active" | "paused" | "suspended";

export interface Tenant {
  id: string; // system slug
  name: string; // trading name
  owner: string;
  region: string;
  plan: Plan;
  status: TenantStatus;
  createdAt: string; // ISO onboarding date
  mrr: number; // monthly recurring revenue, ₱
  terminals: number;
  storageUsedGb: number;
  storageLimitGb: number;
}

/** Indicative monthly price per plan (CONTEXT.md placeholders). */
export const PLAN_PRICE: Record<Plan, number> = {
  starter: 499,
  business: 1499,
  enterprise: 7999, // representative custom-contract figure
};

export const PLAN_LABEL: Record<Plan, string> = {
  starter: "Starter",
  business: "Business",
  enterprise: "Enterprise",
};

export const STATUS_LABEL: Record<TenantStatus, string> = {
  active: "Active",
  paused: "Paused",
  suspended: "Suspended",
};

export const TENANTS: Tenant[] = [
  {
    id: "teamodern-hq",
    name: "Tea Modern HQ",
    owner: "Juan dela Cruz",
    region: "Quezon City",
    plan: "business",
    status: "active",
    createdAt: "2025-08-12",
    mrr: 1499,
    terminals: 6,
    storageUsedGb: 3.4,
    storageLimitGb: 10,
  },
  {
    id: "metro-mart",
    name: "MetroMart Groceries",
    owner: "Carlos Tan",
    region: "Pasig City",
    plan: "enterprise",
    status: "active",
    createdAt: "2025-03-02",
    mrr: 7999,
    terminals: 22,
    storageUsedGb: 41.7,
    storageLimitGb: 100,
  },
  {
    id: "kape-ni-juan",
    name: "Kape ni Juan",
    owner: "Maria Santos",
    region: "Cebu City",
    plan: "starter",
    status: "active",
    createdAt: "2026-01-19",
    mrr: 499,
    terminals: 2,
    storageUsedGb: 0.6,
    storageLimitGb: 2,
  },
  {
    id: "lutong-bahay",
    name: "Lutong Bahay Carinderia",
    owner: "Ana Lim",
    region: "Makati City",
    plan: "business",
    status: "active",
    createdAt: "2025-11-04",
    mrr: 1499,
    terminals: 4,
    storageUsedGb: 2.1,
    storageLimitGb: 10,
  },
  {
    id: "island-brews",
    name: "Island Brews Coffee Co.",
    owner: "Paolo Cruz",
    region: "Iloilo City",
    plan: "business",
    status: "suspended",
    createdAt: "2025-06-27",
    mrr: 1499,
    terminals: 5,
    storageUsedGb: 6.9,
    storageLimitGb: 10,
  },
  {
    id: "aling-nena-sarisari",
    name: "Aling Nena Sari-Sari",
    owner: "Nena Reyes",
    region: "Davao City",
    plan: "starter",
    status: "paused",
    createdAt: "2025-10-15",
    mrr: 499,
    terminals: 1,
    storageUsedGb: 0.3,
    storageLimitGb: 2,
  },
  {
    id: "manila-threads",
    name: "Manila Threads Apparel",
    owner: "Liza Mercado",
    region: "Taguig City",
    plan: "enterprise",
    status: "active",
    createdAt: "2025-02-18",
    mrr: 7999,
    terminals: 14,
    storageUsedGb: 28.2,
    storageLimitGb: 100,
  },
  {
    id: "bagong-silang-hardware",
    name: "Bagong Silang Hardware",
    owner: "Rosa Bautista",
    region: "Caloocan City",
    plan: "starter",
    status: "active",
    createdAt: "2026-02-08",
    mrr: 499,
    terminals: 3,
    storageUsedGb: 1.2,
    storageLimitGb: 2,
  },
];

/** Headline scalars for the metrics bento (mock platform-wide aggregates). */
export const PLATFORM_METRICS = {
  activeMerchants: 1248,
  activeMerchantsDeltaPct: 4.2,
  mrrTotal: 1872400,
  mrrDeltaPct: 6.8,
  // Tier split of MRR for the mini breakdown.
  mrrByPlan: { starter: 318400, business: 742000, enterprise: 812000 } as Record<Plan, number>,
  // System resource load (NeonDB pool + webhook throughput).
  dbPoolUsed: 38,
  dbPoolMax: 50,
  webhooksPerMin: 217,
  uptimePct: 99.98,
};
