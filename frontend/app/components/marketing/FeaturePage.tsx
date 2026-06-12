import Link from "next/link";
import { Icon, IconSprite, type IconName } from "@/app/components/Icon";
import { Nav } from "@/app/components/Nav";
import { Footer } from "@/app/components/Footer";
import { ScrollReveal } from "@/app/components/ScrollReveal";
import { MarketingVisual, visualKindForIcon } from "@/app/components/marketing/MarketingVisual";
import type { FeatureCard } from "@/lib/marketing";

/**
 * The shared marketing detail-page shell used by every category route
 * (/products, /industry, /hardware, /company). Themed with ink/surface tokens
 * for correct Light & Dark.
 *
 * Each feature appears exactly once in the body — the hero shows a compact
 * preview of the feature set, and the detail section explains them in
 * alternating rows. (Earlier this page listed the same three items as hero
 * chips, a card grid AND a showcase; that triple repeat is gone.)
 *
 * Platform-level proof (BIR / e-wallets / offline / peso) lives in a separate
 * trust strip, so it never overlaps the page-specific features.
 *
 * Motion: <ScrollReveal> drives `.reveal` fade-up as sections enter view
 * (staggered), with hover lifts on interactive cards — all disabled under
 * `prefers-reduced-motion`.
 */
export interface RelatedItem {
  slug: string;
  name: string;
  icon: IconName;
}

export interface FeaturePageProps {
  eyebrow: string;
  icon: IconName;
  name: string;
  tagline: string;
  intro: string;
  cardsHeading: string;
  cards: FeatureCard[];
  ctaHeading: string;
  ctaSub: string;
  ctaLabel?: string;
  ctaHref?: string;
  image?: string | null;
  related?: { heading: string; basePath: string; items: RelatedItem[] };
}

const TRUST = [
  { icon: "receipt" as IconName, label: "BIR-ready receipts" },
  { icon: "card" as IconName, label: "GCash · Maya · QRPH" },
  { icon: "wifi-off" as IconName, label: "Works offline" },
  { icon: "peso" as IconName, label: "Peso-first" },
];

export function FeaturePage({
  eyebrow,
  icon,
  name,
  tagline,
  intro,
  cardsHeading,
  cards,
  ctaHeading,
  ctaSub,
  ctaLabel = "Request a Demo",
  ctaHref = "/#demo",
  image,
  related,
}: FeaturePageProps) {
  return (
    <>
      <IconSprite />
      <ScrollReveal />
      <Nav />
      <main>
        {/* Hero */}
        <section className="relative bg-paper hairline-b">
          {/* decorations clipped to their own layer so the visual never clips */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute inset-0 grid-bg [mask-image:radial-gradient(900px_440px_at_75%_10%,black,transparent_75%)]" />
            <div className="absolute -top-24 right-0 w-[560px] h-[560px] rounded-full bg-brand-50 blur-3xl opacity-60" />
          </div>
          <div className="relative max-w-[1160px] mx-auto px-6 py-20 md:py-28">
            <div className="grid lg:grid-cols-[1.02fr_0.98fr] gap-14 items-center">
              <div className="reveal">
                <div className="inline-flex items-center gap-2 text-brand-600 bg-brand-50 hairline px-3 py-1.5 rounded-full">
                  <Icon name={icon} className="w-4 h-4" strokeWidth={1.7} />
                  <span className="text-[12px] font-bold tracking-widest uppercase">{eyebrow}</span>
                </div>
                <h1 className="mt-5 max-w-[18ch] text-[clamp(2.2rem,4.6vw,3.2rem)] leading-[1.06] font-extrabold tracking-tightest text-ink">
                  {tagline}
                </h1>
                <p className="mt-5 max-w-[56ch] text-[1.1rem] leading-relaxed text-ink-soft">
                  {intro}
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Link
                    href={ctaHref}
                    className="inline-flex items-center gap-2 bg-brand-600 text-white font-semibold text-[14.5px] px-6 py-3.5 rounded-[11px] shadow-btn hover:bg-brand-700 transition"
                  >
                    {ctaLabel}
                    <Icon name="arrow" className="w-[18px] h-[18px]" strokeWidth={1.8} />
                  </Link>
                  <Link
                    href="/#pricing"
                    className="inline-flex items-center gap-2 bg-surface hairline text-ink font-semibold text-[14.5px] px-6 py-3.5 rounded-[11px] hover:border-brand-200 hover:text-brand-600 transition"
                  >
                    See pricing
                  </Link>
                </div>
              </div>

              <div className="reveal" style={{ transitionDelay: "120ms" }}>
                <MarketingVisual
                  icon={icon}
                  label={name}
                  kind="preview"
                  rows={cards.map((c) => c.title)}
                  image={image}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Platform trust strip */}
        <section className="bg-surface hairline-b">
          <div className="max-w-[1160px] mx-auto px-6 py-7 flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
            {TRUST.map((t) => (
              <div key={t.label} className="flex items-center gap-2.5 text-ink-soft">
                <Icon name={t.icon} className="w-[18px] h-[18px] text-brand-600" strokeWidth={1.7} />
                <span className="text-[14px] font-semibold">{t.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Feature detail — alternating rows, one per feature (the single place
            the features are explained, each with its own preview visual). */}
        <section className="bg-surface">
          <div className="max-w-[1160px] mx-auto px-6 py-20">
            <h2 className="reveal max-w-[22ch] text-[1.9rem] leading-tight font-extrabold tracking-tightest text-ink">
              {cardsHeading}
            </h2>
            <div className="mt-14 space-y-16 md:space-y-20">
              {cards.map((c, i) => {
                const flip = i % 2 === 1;
                return (
                  <div key={c.title} className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
                    <div className={`reveal ${flip ? "lg:order-2" : ""}`}>
                      <span className="grid place-items-center w-12 h-12 rounded-[13px] bg-ink text-white">
                        <Icon name={c.icon} className="w-[22px] h-[22px]" />
                      </span>
                      <h3 className="mt-5 text-[1.55rem] font-extrabold tracking-tightest text-ink">
                        {c.title}
                      </h3>
                      <p className="mt-3 max-w-[52ch] text-[1.05rem] leading-relaxed text-ink-soft">
                        {c.body}
                      </p>
                    </div>
                    <div
                      className={`reveal ${flip ? "lg:order-1" : ""}`}
                      style={{ transitionDelay: "100ms" }}
                    >
                      <MarketingVisual
                        icon={c.icon}
                        label={c.title}
                        kind={visualKindForIcon(c.icon)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* CTA band */}
        <section className="bg-paper hairline-y">
          <div className="max-w-[1160px] mx-auto px-6 py-16">
            <div className="reveal relative overflow-hidden rounded-2xl bg-ink text-white p-9 md:p-12 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div className="absolute -right-16 -top-16 w-72 h-72 rounded-full bg-brand-500/20 blur-3xl" />
              <div className="relative">
                <h2 className="text-[1.7rem] font-extrabold tracking-tightest">{ctaHeading}</h2>
                <p className="mt-2 text-[1rem] text-white/70 max-w-[52ch]">{ctaSub}</p>
              </div>
              <Link
                href={ctaHref}
                className="relative inline-flex items-center gap-2 bg-white text-ink font-semibold text-[14.5px] px-6 py-3.5 rounded-[11px] hover:bg-white/90 transition shrink-0"
              >
                {ctaLabel}
                <Icon name="arrow" className="w-[18px] h-[18px]" strokeWidth={1.8} />
              </Link>
            </div>
          </div>
        </section>

        {/* Related grid */}
        {related && related.items.length > 0 && (
          <section className="bg-surface">
            <div className="max-w-[1160px] mx-auto px-6 py-20">
              <h2 className="reveal text-[1.3rem] font-extrabold tracking-tightest text-ink">
                {related.heading}
              </h2>
              <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {related.items.map((p, i) => (
                  <Link
                    key={p.slug}
                    href={`${related.basePath}/${p.slug}`}
                    className="reveal group flex items-center gap-3 rounded-xl bg-paper hairline p-4 hover:border-brand-500 hover:-translate-y-0.5 transition duration-200"
                    style={{ transitionDelay: `${i * 60}ms` }}
                  >
                    <span className="grid place-items-center w-9 h-9 rounded-[10px] bg-surface hairline text-ink shrink-0">
                      <Icon name={p.icon} className="w-[18px] h-[18px]" />
                    </span>
                    <span className="text-[14.5px] font-semibold text-ink group-hover:text-brand-600 transition">
                      {p.name}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
