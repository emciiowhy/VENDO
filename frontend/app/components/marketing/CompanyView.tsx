import Link from "next/link";
import { Icon, IconSprite } from "@/app/components/Icon";
import { Nav } from "@/app/components/Nav";
import { Footer } from "@/app/components/Footer";
import { ScrollReveal } from "@/app/components/ScrollReveal";
import { MarketingPhoto } from "@/app/components/marketing/MarketingPhoto";
import { media } from "@/lib/marketingMedia";
import { company } from "@/lib/company";
import type { MarketingEntry } from "@/lib/marketing";

/**
 * Bespoke company page (About / Careers / Contact) — an "Our Story" photo
 * collage beside a narrative, the entry's values/teams/ways-to-reach cards, and
 * a tailored CTA. Photo-collage-led so it reads nothing like the product,
 * industry, or hardware templates.
 */

/** Photo keys per company page; About gets a three-photo collage. */
const PHOTOS: Record<string, string[]> = {
  about: ["story", "team", "founders"],
  careers: ["careers", "team"],
  contact: ["contact", "team"],
};

/** A few proof points shown on the About page. */
const ABOUT_STATS = [
  { value: "5", label: "ERP pillars in one platform" },
  { value: "100%", label: "Peso-first & BIR-ready" },
  { value: "1", label: "Login for your whole business" },
];

export function CompanyView({ entry }: { entry: MarketingEntry }) {
  const photoKeys = PHOTOS[entry.slug] ?? ["team"];
  const photos = photoKeys.map((k) => media(k));
  const isAbout = entry.slug === "about";
  const ctaLabel = entry.ctaLabel ?? "Request a Demo";
  const ctaHref = entry.ctaHref ?? "/#demo";
  const related = company.related(entry.slug);

  return (
    <>
      <IconSprite />
      <ScrollReveal />
      <Nav />
      <main>
        {/* Hero — centered */}
        <section className="relative bg-paper hairline-b">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute inset-0 grid-bg [mask-image:radial-gradient(900px_420px_at_50%_0%,black,transparent_75%)]" />
          </div>
          <div className="relative max-w-[1000px] mx-auto px-6 py-20 md:py-24 text-center">
            <div className="reveal inline-flex items-center gap-2 text-brand-600 bg-brand-50 hairline px-3 py-1.5 rounded-full">
              <Icon name={entry.icon} className="w-4 h-4" strokeWidth={1.7} />
              <span className="text-[12px] font-bold tracking-widest uppercase">Company</span>
            </div>
            <h1 className="reveal mt-5 mx-auto max-w-[20ch] text-[clamp(2.2rem,4.8vw,3.3rem)] leading-[1.05] font-extrabold tracking-tightest text-ink">
              {entry.tagline}
            </h1>
            <p className="reveal mt-5 mx-auto max-w-[58ch] text-[1.1rem] leading-relaxed text-ink-soft">
              {entry.intro}
            </p>
          </div>
        </section>

        {/* Story collage */}
        <section className="bg-surface hairline-b">
          <div className="max-w-[1160px] mx-auto px-6 py-20">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              <div className="reveal grid grid-cols-2 gap-4">
                <MarketingPhoto
                  src={photos[0]}
                  alt={entry.name}
                  icon={entry.icon}
                  aspect="aspect-[3/4]"
                  rounded="rounded-[18px]"
                  className="shadow-soft"
                />
                <div className="grid gap-4">
                  <MarketingPhoto
                    src={photos[1] ?? photos[0]}
                    alt={entry.name}
                    icon="users"
                    aspect="aspect-[4/3]"
                    rounded="rounded-[18px]"
                    className="shadow-soft"
                  />
                  {photos[2] && (
                    <MarketingPhoto
                      src={photos[2]}
                      alt={entry.name}
                      icon="store"
                      aspect="aspect-[4/3]"
                      rounded="rounded-[18px]"
                      className="shadow-soft"
                    />
                  )}
                </div>
              </div>
              <div className="reveal" style={{ transitionDelay: "100ms" }}>
                <h2 className="text-[1.8rem] leading-tight font-extrabold tracking-tightest text-ink">
                  {isAbout
                    ? "Built for how Filipino businesses actually run."
                    : entry.cardsHeading ?? entry.name}
                </h2>
                <p className="mt-5 text-[1.05rem] leading-relaxed text-ink-soft">
                  VendoPOS is one multi-tenant POS + ERP platform — sales, stock, suppliers,
                  finances, staff, and customers in a single system. We believe the best tools
                  shouldn&rsquo;t be locked away from small businesses, so we built one that&rsquo;s
                  peso-first, BIR-ready, and shaped around the realities of the counter.
                </p>
                <p className="mt-4 text-[1.05rem] leading-relaxed text-ink-soft">
                  Instead of stitching together a dozen disconnected apps, operators get a single
                  source of truth — from the first sale to the month-end books.
                </p>
                <Link
                  href={ctaHref}
                  className="mt-7 inline-flex items-center gap-2 text-brand-600 font-semibold text-[15px] hover:text-brand-700 transition"
                >
                  {ctaLabel}
                  <Icon name="arrow" className="w-[18px] h-[18px]" strokeWidth={1.8} />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Stats — About only */}
        {isAbout && (
          <section className="bg-paper hairline-b">
            <div className="max-w-[1160px] mx-auto px-6 py-14">
              <div className="grid sm:grid-cols-3 gap-8 text-center">
                {ABOUT_STATS.map((s) => (
                  <div key={s.label} className="reveal">
                    <div className="text-[2.6rem] font-extrabold tracking-tightest text-brand-600">
                      {s.value}
                    </div>
                    <div className="mt-1 text-[0.98rem] font-semibold text-ink-soft">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Values / teams / contact methods */}
        <section className="bg-surface">
          <div className="max-w-[1160px] mx-auto px-6 py-20">
            <h2 className="reveal text-[1.6rem] font-extrabold tracking-tightest text-ink">
              {entry.cardsHeading ?? entry.name}
            </h2>
            <div className="mt-10 grid gap-8 md:grid-cols-3">
              {entry.cards.map((c, i) => (
                <div
                  key={c.title}
                  className="reveal rounded-2xl bg-paper hairline p-6"
                  style={{ transitionDelay: `${i * 80}ms` }}
                >
                  <span className="grid place-items-center w-12 h-12 rounded-[13px] bg-brand-50 text-brand-600 hairline">
                    <Icon name={c.icon} className="w-[22px] h-[22px]" strokeWidth={1.7} />
                  </span>
                  <h3 className="mt-5 text-[1.2rem] font-extrabold tracking-tight text-ink">
                    {c.title}
                  </h3>
                  <p className="mt-2.5 text-[1rem] leading-relaxed text-ink-soft">{c.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA band */}
        <section className="bg-paper hairline-t">
          <div className="max-w-[1160px] mx-auto px-6 py-16">
            <div className="reveal relative overflow-hidden rounded-2xl bg-ink text-white p-9 md:p-12 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div className="absolute -right-16 -top-16 w-72 h-72 rounded-full bg-brand-500/20 blur-3xl" />
              <div className="relative">
                <h2 className="text-[1.7rem] font-extrabold tracking-tightest">
                  Ready to get started?
                </h2>
                <p className="mt-2 text-[1rem] text-white/70 max-w-[52ch]">
                  Book a walkthrough and see how VendoPOS fits the way you run your business.
                </p>
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

        {/* More from company */}
        {related.length > 0 && (
          <section className="bg-surface hairline-t">
            <div className="max-w-[1160px] mx-auto px-6 py-16">
              <h2 className="reveal text-[1.3rem] font-extrabold tracking-tightest text-ink">
                More from VendoPOS
              </h2>
              <div className="mt-7 grid gap-3 sm:grid-cols-3">
                {related.map((r, i) => (
                  <Link
                    key={r.slug}
                    href={`/company/${r.slug}`}
                    className="reveal group flex items-center gap-3 rounded-xl bg-paper hairline p-4 hover:border-brand-500 hover:-translate-y-0.5 transition duration-200"
                    style={{ transitionDelay: `${i * 60}ms` }}
                  >
                    <span className="grid place-items-center w-9 h-9 rounded-[10px] bg-surface hairline text-ink shrink-0">
                      <Icon name={r.icon} className="w-[18px] h-[18px]" />
                    </span>
                    <span className="text-[14.5px] font-semibold text-ink group-hover:text-brand-600 transition">
                      {r.name}
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
