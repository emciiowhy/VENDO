"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Icon, type IconName } from "./Icon";
import { useDashUser } from "./dash/DashShell";
import {
  TIER_LABEL,
  asTier,
  featureAllowed,
  minTierForFeature,
  type Feature,
} from "@/lib/tiers";

/**
 * Tier feature gate. Renders `children` only when the signed-in store's tier
 * unlocks `feature`; otherwise renders `fallback` (defaulting to a premium
 * "Upgrade to Unlock" callout). This mirrors the API's `requireFeature` guard
 * one-to-one — the server is the real boundary, this just keeps a Starter store
 * from seeing a control it would be 403'd for.
 *
 * Must be used inside a <DashShell> (it reads the session via useDashUser).
 */
export function FeatureGate({
  feature,
  children,
  fallback,
}: {
  feature: Feature;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const user = useDashUser();
  if (featureAllowed(asTier(user.tier), feature)) return <>{children}</>;
  return <>{fallback ?? <UpgradeCard feature={feature} />}</>;
}

/** Copy + iconography for the upgrade callout of each gated feature. */
const FEATURE_PITCH: Record<
  Feature,
  { icon: IconName; title: string; description: string }
> = {
  // STARTER (included everywhere — these rarely render a callout)
  pos_terminal: { icon: "pos", title: "Point of Sale", description: "Ring up sales at the register." },
  inventory_basic: { icon: "box", title: "Inventory", description: "Items, prices and stock." },
  bir_receipts: { icon: "receipt", title: "BIR receipts", description: "Compliant receipts with gap-free serial invoicing." },
  digital_payments_qrph: { icon: "wallet", title: "Digital payments", description: "Accept QRPH and e-wallet payments." },
  offline_mode: { icon: "wifi-off", title: "Offline mode", description: "Keep ringing up sales without a connection." },
  // BUSINESS
  procurement_supply_chain: {
    icon: "truck",
    title: "Procurement & supply chain",
    description:
      "Manage suppliers and purchase orders; receiving a PO restocks your inventory automatically.",
  },
  customer_relationship_crm: {
    icon: "heart",
    title: "CRM & loyalty",
    description:
      "Build a customer book with visit history, lifetime spend and loyalty points earned at checkout.",
  },
  finance_accounting: {
    icon: "chart",
    title: "Finance & accounting",
    description:
      "Track operating expenses against live POS revenue with a monthly profit-and-loss view.",
  },
  multi_staff_roles: {
    icon: "users",
    title: "Staff roles",
    description: "Add managers and multiple staff roles with their own access.",
  },
  custom_branding: {
    icon: "layers",
    title: "Custom branding",
    description:
      "Theme your whole workspace and customer display with curated presets or your own brand hex.",
  },
  // ENTERPRISE
  manufacturing_bom: {
    icon: "factory",
    title: "Manufacturing (BOM)",
    description:
      "Define recipes / bills of materials and run production that consumes components and yields finished goods.",
  },
  human_resources_payroll: {
    icon: "users",
    title: "HR & payroll",
    description:
      "Manage your employee roster, daily attendance and gross-pay payroll runs, with employee self-service.",
  },
  multi_location: {
    icon: "building",
    title: "Multi-location",
    description: "Run and consolidate more than one store location.",
  },
  priority_support: {
    icon: "shield",
    title: "Priority support",
    description: "A faster support SLA with a direct line to our team.",
  },
  predictive_inventory: {
    icon: "trend",
    title: "Predictive inventory",
    description:
      "AI forecasting that reads your sales velocity and flags what to reorder before you run out.",
  },
};

/**
 * A crisp, premium "Upgrade to Unlock" card. Built entirely from semantic
 * design tokens (brand / ink / surface) so it reads correctly in both light and
 * dark and follows the tenant accent — never hardcoded colours.
 */
export function UpgradeCard({
  feature,
  title,
  description,
  href = "/#pricing",
  compact = false,
}: {
  feature: Feature;
  title?: string;
  description?: string;
  /** Where "Upgrade" leads. Defaults to the public pricing section. */
  href?: string;
  /** A denser layout for inline/secondary placements. */
  compact?: boolean;
}) {
  const pitch = FEATURE_PITCH[feature];
  const requiredTier = minTierForFeature(feature);
  const tierLabel = TIER_LABEL[requiredTier];

  return (
    <div
      className={
        "relative overflow-hidden rounded-xl2 bg-surface hairline shadow-card " +
        (compact ? "p-5" : "p-6 sm:p-8")
      }
    >
      {/* Soft brand wash so the callout feels premium without hardcoded colour. */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-brand-50 blur-2xl" />

      <div className="relative">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center w-11 h-11 rounded-[12px] bg-brand-50 text-brand-600">
            <Icon name={pitch.icon} className="w-[22px] h-[22px]" strokeWidth={1.7} />
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500 text-white px-3 py-1 text-[11.5px] font-bold tracking-tight">
            <Icon name="bolt" className="w-3.5 h-3.5" strokeWidth={2} />
            {tierLabel} feature
          </span>
        </div>

        <h3 className={"font-extrabold tracking-tight " + (compact ? "mt-4 text-[16px]" : "mt-5 text-[19px]")}>
          {title ?? pitch.title}
        </h3>
        <p className="mt-1.5 max-w-[46ch] text-[13.5px] leading-relaxed text-ink-soft">
          {description ?? pitch.description}
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link
            href={href}
            className="inline-flex items-center gap-2 rounded-[10px] bg-brand-500 hover:bg-brand-600 px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-btn tracking-tight transition duration-150"
          >
            <Icon name="bolt" className="w-[16px] h-[16px]" strokeWidth={1.9} />
            Upgrade to {tierLabel}
          </Link>
          <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-faint">
            <Icon name="lock" className="w-4 h-4" strokeWidth={1.7} />
            Locked on your current plan
          </span>
        </div>
      </div>
    </div>
  );
}
