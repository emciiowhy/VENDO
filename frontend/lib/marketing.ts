import type { IconName } from "@/app/components/Icon";

/**
 * Shared content shape for the Hardware and Company marketing entries. Each
 * category keeps its own content file (lib/hardware.ts, lib/company.ts) and
 * renders through its own bespoke template (<HardwareView>, <CompanyView>);
 * this just gives them a common entry shape and the collection() helpers.
 * (Products and Industry have their own richer types in their own files.)
 *
 * The `slug` is the URL segment and the single source of truth that each
 * category's `generateStaticParams` and the nav links rely on — add an entry
 * here first, then point the nav link at `/<category>/<slug>`.
 */
export interface FeatureCard {
  icon: IconName;
  title: string;
  body: string;
}

export interface MarketingEntry {
  slug: string;
  /** Eyebrow shown above the headline (the mega-menu group / category). */
  eyebrow: string;
  icon: IconName;
  name: string;
  tagline: string;
  intro: string;
  cards: FeatureCard[];
  /** Optional override for the cards section heading (else the route supplies one). */
  cardsHeading?: string;
  /** Optional real screenshot/photo URL; when set it replaces the generated mockup. */
  image?: string | null;
  /** Optional CTA overrides (default: Request a Demo → /#demo). */
  ctaLabel?: string;
  ctaHref?: string;
}

export interface MarketingCollection {
  all: MarketingEntry[];
  get: (slug: string) => MarketingEntry | undefined;
  related: (slug: string, limit?: number) => MarketingEntry[];
}

/** Build the lookup/related helpers for a category's entry list. */
export function collection(entries: MarketingEntry[]): MarketingCollection {
  const map = new Map(entries.map((e) => [e.slug, e]));
  return {
    all: entries,
    get: (slug) => map.get(slug),
    related: (slug, limit = 6) => entries.filter((e) => e.slug !== slug).slice(0, limit),
  };
}
