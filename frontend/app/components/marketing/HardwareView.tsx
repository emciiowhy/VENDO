import Link from "next/link";
import { Icon, IconSprite } from "@/app/components/Icon";
import { Nav } from "@/app/components/Nav";
import { Footer } from "@/app/components/Footer";
import { ScrollReveal } from "@/app/components/ScrollReveal";
import { MarketingPhoto } from "@/app/components/marketing/MarketingPhoto";
import { TrustStrip } from "@/app/components/marketing/TrustStrip";
import { media } from "@/lib/marketingMedia";
import { hardware, hardwarePhotoKey } from "@/lib/hardware";
import type { MarketingEntry } from "@/lib/marketing";

/**
 * Bespoke hardware detail page — a split photo hero, three highlight cards, and
 * a "pairs with" rail of the rest of the gear, ending on a bundle prompt. Photo-
 * forward like the reference hardware pages, but distinct from the industry
 * pages (centered hero) and product pages (app mockup).
 */
export function HardwareView({ entry }: { entry: MarketingEntry }) {
  const photo = media(hardwarePhotoKey(entry.slug));
  const related = hardware.related(entry.slug, 8);

  return (
    <>
      <IconSprite />
      <ScrollReveal />
      <Nav />
      <main>
        {/* Hero — split, photo right */}
        <section className="relative bg-paper hairline-b">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute inset-0 grid-bg [mask-image:radial-gradient(900px_440px_at_78%_8%,black,transparent_75%)]" />
            <div className="absolute -top-24 right-0 w-[560px] h-[560px] rounded-full bg-brand-50 blur-3xl opacity-60" />
          </div>
          <div className="relative max-w-[1160px] mx-auto px-6 py-20 md:py-24">
            <div className="grid lg:grid-cols-[1fr_1fr] gap-12 lg:gap-14 items-center">
              <div className="reveal">
                <div className="inline-flex items-center gap-2 text-brand-600 bg-brand-50 hairline px-3 py-1.5 rounded-full">
                  <Icon name={entry.icon} className="w-4 h-4" strokeWidth={1.7} />
                  <span className="text-[12px] font-bold tracking-widest uppercase">Hardware</span>
                </div>
                <h1 className="mt-5 max-w-[16ch] text-[clamp(2.2rem,4.6vw,3.1rem)] leading-[1.06] font-extrabold tracking-tightest text-ink">
                  {entry.tagline}
                </h1>
                <p className="mt-5 max-w-[52ch] text-[1.1rem] leading-relaxed text-ink-soft">
                  {entry.intro}
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Link
                    href="/#demo"
                    className="inline-flex items-center gap-2 bg-brand-600 text-white font-semibold text-[14.5px] px-6 py-3.5 rounded-[11px] shadow-btn hover:bg-brand-700 transition"
                  >
                    Request a Demo
                    <Icon name="arrow" className="w-[18px] h-[18px]" strokeWidth={1.8} />
                  </Link>
                  <Link
                    href="/hardware#bundles"
                    className="inline-flex items-center gap-2 bg-surface hairline text-ink font-semibold text-[14.5px] px-6 py-3.5 rounded-[11px] hover:border-brand-200 hover:text-brand-600 transition"
                  >
                    See bundles
                  </Link>
                </div>
              </div>
              <div className="reveal" style={{ transitionDelay: "120ms" }}>
                <MarketingPhoto
                  src={photo}
                  alt={entry.name}
                  icon={entry.icon}
                  aspect="aspect-[4/3]"
                  rounded="rounded-[20px]"
                  priority
                  className="shadow-soft"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Highlights — 3-up */}
        <section className="bg-surface hairline-b">
          <div className="max-w-[1160px] mx-auto px-6 py-20">
            <h2 className="reveal text-[1.9rem] leading-tight font-extrabold tracking-tightest text-ink">
              Why this gear
            </h2>
            <div className="mt-12 grid gap-10 md:grid-cols-3">
              {entry.cards.map((c, i) => (
                <div key={c.title} className="reveal" style={{ transitionDelay: `${i * 80}ms` }}>
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

        <TrustStrip />

        {/* Pairs with — the rest of the catalog */}
        {related.length > 0 && (
          <section className="bg-surface">
            <div className="max-w-[1160px] mx-auto px-6 py-20">
              <h2 className="reveal text-[1.3rem] font-extrabold tracking-tightest text-ink">
                Pairs with the rest of your counter
              </h2>
              <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {related.map((r, i) => (
                  <Link
                    key={r.slug}
                    href={`/hardware/${r.slug}`}
                    className="reveal group flex items-center gap-3 rounded-xl bg-paper hairline p-4 hover:border-brand-500 hover:-translate-y-0.5 transition duration-200"
                    style={{ transitionDelay: `${i * 50}ms` }}
                  >
                    <span className="grid place-items-center w-9 h-9 rounded-[10px] bg-surface hairline text-ink shrink-0">
                      <Icon name={r.icon} className="w-[18px] h-[18px]" />
                    </span>
                    <span className="text-[14px] font-semibold text-ink group-hover:text-brand-600 transition">
                      {r.name}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* CTA band */}
        <section className="bg-paper hairline-y">
          <div className="max-w-[1160px] mx-auto px-6 py-16">
            <div className="reveal relative overflow-hidden rounded-2xl bg-ink text-white p-9 md:p-12 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div className="absolute -right-16 -top-16 w-72 h-72 rounded-full bg-brand-500/20 blur-3xl" />
              <div className="relative">
                <h2 className="text-[1.7rem] font-extrabold tracking-tightest">
                  Add {entry.name} to your setup
                </h2>
                <p className="mt-2 text-[1rem] text-white/70 max-w-[52ch]">
                  Talk to us about the right hardware bundle for your counter.
                </p>
              </div>
              <Link
                href="/#demo"
                className="relative inline-flex items-center gap-2 bg-white text-ink font-semibold text-[14.5px] px-6 py-3.5 rounded-[11px] hover:bg-white/90 transition shrink-0"
              >
                Request a Demo
                <Icon name="arrow" className="w-[18px] h-[18px]" strokeWidth={1.8} />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
