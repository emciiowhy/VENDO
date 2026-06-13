import Link from "next/link";
import { Icon, IconSprite } from "@/app/components/Icon";
import { Nav } from "@/app/components/Nav";
import { Footer } from "@/app/components/Footer";
import { ScrollReveal } from "@/app/components/ScrollReveal";
import { MarketingPhoto } from "@/app/components/marketing/MarketingPhoto";
import { RoadmapBadge } from "@/app/components/marketing/RoadmapBadge";
import { TrustStrip } from "@/app/components/marketing/TrustStrip";
import { media } from "@/lib/marketingMedia";
import {
  type Industry,
  type IndustryGroup,
  relatedIndustries,
  INDUSTRY_GROUPS,
} from "@/lib/industries";

/**
 * Bespoke industry detail page — a centered photo-led hero (per the reference
 * café/F&B layout), three highlights, an outcomes checklist beside a photo, the
 * shared platform trust strip, and a rail of related industries in the same
 * group. Distinct from the product/hardware/company templates so the five
 * sections no longer all look identical.
 */
function groupOf(key: string): IndustryGroup | undefined {
  return INDUSTRY_GROUPS.find((g) => g.key === key);
}

export function IndustryView({ industry }: { industry: Industry }) {
  const group = groupOf(industry.group);
  const photo = media(industry.photoKey ?? industry.slug);
  const related = relatedIndustries(industry.slug);

  return (
    <>
      <IconSprite />
      <ScrollReveal />
      <Nav />
      <main>
        {/* Hero — centered, photo-led */}
        <section className="relative bg-paper hairline-b">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute inset-0 grid-bg [mask-image:radial-gradient(900px_460px_at_50%_0%,black,transparent_75%)]" />
          </div>
          <div className="relative max-w-[1000px] mx-auto px-6 pt-20 md:pt-24 text-center">
            <div className="reveal inline-flex items-center gap-2 text-brand-600 bg-brand-50 hairline px-3 py-1.5 rounded-full">
              <Icon name={group?.icon ?? industry.icon} className="w-4 h-4" strokeWidth={1.7} />
              <span className="text-[12px] font-bold tracking-widest uppercase">
                {group?.title ?? "Industry"}
              </span>
              <RoadmapBadge status={industry.status} className="ml-1" />
            </div>
            <h1 className="reveal mt-5 mx-auto max-w-[20ch] text-[clamp(2.3rem,5vw,3.4rem)] leading-[1.05] font-extrabold tracking-tightest text-ink">
              {industry.tagline}
            </h1>
            <p className="reveal mt-5 mx-auto max-w-[58ch] text-[1.1rem] leading-relaxed text-ink-soft">
              {industry.intro}
            </p>
            <div className="reveal mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/#demo"
                className="inline-flex items-center gap-2 bg-brand-600 text-white font-semibold text-[14.5px] px-6 py-3.5 rounded-[11px] shadow-btn hover:bg-brand-700 transition"
              >
                Request a Demo
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
          <div className="relative max-w-[1000px] mx-auto px-6 pt-12 md:pt-14 pb-20 md:pb-24">
            <div className="reveal" style={{ transitionDelay: "120ms" }}>
              <MarketingPhoto
                src={photo}
                alt={industry.name}
                icon={industry.icon}
                aspect="aspect-[16/9]"
                rounded="rounded-[20px]"
                priority
                className="shadow-soft"
              />
            </div>
          </div>
        </section>

        {/* Highlights — 3-up */}
        <section className="bg-surface hairline-b">
          <div className="max-w-[1160px] mx-auto px-6 py-20">
            <h2 className="reveal text-center mx-auto max-w-[26ch] text-[1.9rem] leading-tight font-extrabold tracking-tightest text-ink">
              Built for {industry.name}
            </h2>
            <div className="mt-14 grid gap-10 md:grid-cols-3">
              {industry.highlights.map((h, i) => (
                <div key={h.title} className="reveal" style={{ transitionDelay: `${i * 80}ms` }}>
                  <span className="grid place-items-center w-12 h-12 rounded-[13px] bg-brand-50 text-brand-600 hairline">
                    <Icon name={h.icon} className="w-[22px] h-[22px]" strokeWidth={1.7} />
                  </span>
                  <h3 className="mt-5 text-[1.2rem] font-extrabold tracking-tight text-ink">
                    {h.title}
                  </h3>
                  <p className="mt-2.5 text-[1rem] leading-relaxed text-ink-soft">{h.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Outcomes — checklist beside a photo */}
        <section className="bg-paper hairline-b">
          <div className="max-w-[1160px] mx-auto px-6 py-20">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              <div className="reveal">
                <MarketingPhoto
                  src={media(group?.key ?? "team")}
                  alt={`${industry.name} on VendoPOS`}
                  icon={group?.icon ?? industry.icon}
                  aspect="aspect-[4/3]"
                  rounded="rounded-[20px]"
                  className="shadow-soft"
                />
              </div>
              <div className="reveal" style={{ transitionDelay: "100ms" }}>
                <h2 className="text-[1.7rem] leading-tight font-extrabold tracking-tightest text-ink">
                  What you&rsquo;ll get with VendoPOS
                </h2>
                <ul className="mt-7 space-y-4">
                  {industry.outcomes.map((o) => (
                    <li key={o} className="flex items-start gap-3">
                      <span className="mt-0.5 grid place-items-center w-6 h-6 rounded-full bg-accent-50 text-accent-600 shrink-0">
                        <Icon name="check" className="w-3.5 h-3.5" strokeWidth={2.2} />
                      </span>
                      <span className="text-[1.05rem] leading-relaxed text-ink-soft">{o}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/#demo"
                  className="mt-8 inline-flex items-center gap-2 text-brand-600 font-semibold text-[15px] hover:text-brand-700 transition"
                >
                  Book a walkthrough
                  <Icon name="arrow" className="w-[18px] h-[18px]" strokeWidth={1.8} />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <TrustStrip />

        {/* Related industries */}
        {related.length > 0 && (
          <section className="bg-surface">
            <div className="max-w-[1160px] mx-auto px-6 py-20">
              <h2 className="reveal text-[1.3rem] font-extrabold tracking-tightest text-ink">
                More industries we serve
              </h2>
              <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {related.map((r, i) => (
                  <Link
                    key={r.slug}
                    href={`/industry/${r.slug}`}
                    className="reveal group flex items-center gap-3 rounded-xl bg-paper hairline p-4 hover:border-brand-500 hover:-translate-y-0.5 transition duration-200"
                    style={{ transitionDelay: `${i * 60}ms` }}
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
        <section className="bg-paper hairline-t">
          <div className="max-w-[1160px] mx-auto px-6 py-16">
            <div className="reveal relative overflow-hidden rounded-2xl bg-ink text-white p-9 md:p-12 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div className="absolute -right-16 -top-16 w-72 h-72 rounded-full bg-brand-500/20 blur-3xl" />
              <div className="relative">
                <h2 className="text-[1.7rem] font-extrabold tracking-tightest">
                  See VendoPOS for {industry.name}
                </h2>
                <p className="mt-2 text-[1rem] text-white/70 max-w-[52ch]">
                  Book a walkthrough and we&rsquo;ll tailor the setup to how your business actually
                  operates.
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
