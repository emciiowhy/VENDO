import type { Metadata } from "next";
import Link from "next/link";
import { Icon, IconSprite } from "@/app/components/Icon";
import { Nav } from "@/app/components/Nav";
import { Footer } from "@/app/components/Footer";
import { ScrollReveal } from "@/app/components/ScrollReveal";
import { MarketingPhoto } from "@/app/components/marketing/MarketingPhoto";
import { RoadmapBadge } from "@/app/components/marketing/RoadmapBadge";
import { TrustStrip } from "@/app/components/marketing/TrustStrip";
import { media } from "@/lib/marketingMedia";
import { industriesByGroup } from "@/lib/industries";

export const metadata: Metadata = {
  title: "Industries — VendoPOS",
  description:
    "One POS + ERP platform built for how Filipino businesses actually run — F&B, retail, service, and multi-branch enterprise.",
  openGraph: {
    title: "Industries — VendoPOS",
    description:
      "One POS + ERP platform built for how Filipino businesses actually run — F&B, retail, service, and multi-branch enterprise.",
    type: "website",
  },
};

export default function IndustryLanding() {
  const groups = industriesByGroup();

  return (
    <>
      <IconSprite />
      <ScrollReveal />
      <Nav />
      <main>
        {/* Header */}
        <section className="relative overflow-hidden bg-paper hairline-b">
          <div className="absolute inset-0 grid-bg [mask-image:radial-gradient(800px_400px_at_50%_0%,black,transparent_75%)]" />
          <div className="relative max-w-[1000px] mx-auto px-6 py-20 md:py-24 text-center">
            <div className="reveal">
              <span className="text-[12px] font-bold tracking-widest uppercase text-brand-600">
                Built for every counter
              </span>
              <h1 className="mt-4 mx-auto max-w-[20ch] text-[clamp(2.2rem,4.8vw,3.3rem)] leading-[1.05] font-extrabold tracking-tightest text-ink">
                One platform, tuned to your kind of business.
              </h1>
              <p className="mt-5 mx-auto max-w-[58ch] text-[1.1rem] leading-relaxed text-ink-soft">
                Whether you pour coffee, stock shelves, book appointments, or run a dozen branches —
                VendoPOS is shaped around how you actually operate.
              </p>
            </div>
          </div>
        </section>

        <TrustStrip />

        {/* Groups */}
        <section className="bg-surface">
          <div className="max-w-[1160px] mx-auto px-6 py-16 md:py-20 space-y-16">
            {groups.map(({ group, items }) => (
              <div key={group.key}>
                <div className="reveal flex items-center gap-3">
                  <span className="grid place-items-center w-10 h-10 rounded-[12px] bg-brand-50 text-brand-600 hairline">
                    <Icon name={group.icon} className="w-5 h-5" strokeWidth={1.7} />
                  </span>
                  <div>
                    <h2 className="text-[1.4rem] font-extrabold tracking-tightest text-ink">
                      {group.title}
                    </h2>
                    <p className="text-[13.5px] text-ink-faint">{group.blurb}</p>
                  </div>
                </div>
                <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((it, i) => (
                    <Link
                      key={it.slug}
                      href={`/industry/${it.slug}`}
                      className="reveal group flex flex-col rounded-2xl bg-paper hairline overflow-hidden hover:-translate-y-1 hover:shadow-soft transition duration-200"
                      style={{ transitionDelay: `${i * 60}ms` }}
                    >
                      <MarketingPhoto
                        src={media(it.photoKey ?? it.slug)}
                        alt={it.name}
                        icon={it.icon}
                        aspect="aspect-[16/10]"
                        rounded="rounded-none"
                        className="hairline-0"
                      />
                      <div className="p-5 flex flex-col flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-[1.05rem] font-bold tracking-tight text-ink group-hover:text-brand-600 transition">
                            {it.name}
                          </h3>
                          <RoadmapBadge status={it.status} />
                        </div>
                        <p className="mt-1.5 text-[0.92rem] leading-relaxed text-ink-soft line-clamp-2">
                          {it.intro}
                        </p>
                        <span className="mt-auto pt-4 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-brand-600">
                          Explore
                          <Icon name="arrow" className="w-4 h-4" strokeWidth={1.8} />
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
