"use client";

import { TIER_LABEL, type Tier } from "@/lib/tiers";

/**
 * The store's live subscription tier, rendered two ways from one styling ladder.
 * `TIER_STYLES` is the single source of truth so the prominent summary badge and
 * the subtle sidebar caption can never drift apart.
 *
 * Per request these use literal Tailwind colours (zinc / blue / violet) rather
 * than the semantic design tokens, escalating in weight so the tier reads at a
 * glance: STARTER is a subdued grey outline, BUSINESS a soft blue, ENTERPRISE a
 * high-contrast filled violet pill with a subtle border. `dark:` variants keep
 * each legible when the workspace theme flips while holding the hue identity.
 */
const TIER_STYLES: Record<Tier, { chip: string; dot: string }> = {
  STARTER: {
    chip: "bg-zinc-100 text-zinc-600 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
    dot: "bg-zinc-400 dark:bg-zinc-500",
  },
  BUSINESS: {
    chip: "bg-blue-50 text-blue-700 border border-blue-100 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-400/25",
    dot: "bg-blue-500",
  },
  ENTERPRISE: {
    chip: "bg-violet-600 text-white border border-violet-400/70 shadow-sm dark:bg-violet-500 dark:border-violet-300/40",
    dot: "bg-violet-500 dark:bg-violet-400",
  },
};

/**
 * Prominent tier pill for the mobile owner summary header — the uppercase tier
 * label as a coloured pill. Reads straight off the live session tier, so it
 * paints on first render with no extra fetch and never shifts when the metric
 * poll lands.
 */
export function TierBadge({ tier, className = "" }: { tier: Tier; className?: string }) {
  return (
    <span
      className={
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-cap font-bold uppercase tracking-wide " +
        TIER_STYLES[tier].chip +
        (className ? " " + className : "")
      }
    >
      {TIER_LABEL[tier]}
    </span>
  );
}

/**
 * Subtle tier caption for the sidebar brand lockup — a small pulsing status dot
 * grounded next to "<Tier> Tier", sized to sit quietly beneath the store name
 * without crowding it. The dot carries the tier colour; the label stays muted.
 * Pulse is gated behind `motion-safe` so it holds still for reduced-motion users.
 */
export function TierCaption({ tier, className = "" }: { tier: Tier; className?: string }) {
  const dot = TIER_STYLES[tier].dot;
  return (
    <div className={"flex items-center gap-1.5 " + className}>
      <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden="true">
        <span
          className={"absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping " + dot}
        />
        <span className={"relative inline-flex h-1.5 w-1.5 rounded-full " + dot} />
      </span>
      <span className="truncate text-[11px] font-semibold text-ink-faint">{TIER_LABEL[tier]} Tier</span>
    </div>
  );
}
