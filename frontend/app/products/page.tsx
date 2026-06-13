import type { Metadata } from "next";
import Link from "next/link";
import { Icon, IconSprite } from "@/app/components/Icon";
import { Nav } from "@/app/components/Nav";
import { Footer } from "@/app/components/Footer";
import { ScrollReveal } from "@/app/components/ScrollReveal";
import { TrustStrip } from "@/app/components/marketing/TrustStrip";
import { RoadmapBadge } from "@/app/components/marketing/RoadmapBadge";
import { productsByGroup, productStatus } from "@/lib/products";

export const metadata: Metadata = {
  title: "Products — VendoPOS",
  description:
    "Everything to run your business on one platform: POS, payments, inventory, finance, procurement, manufacturing, HR, CRM, and more.",
  openGraph: {
    title: "Products — VendoPOS",
    description:
      "Everything to run your business on one platform: POS, payments, inventory, finance, procurement, manufacturing, HR, CRM, and more.",
    type: "website",
  },
};

export default function ProductsLanding() {
  const groups = productsByGroup();

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
                One platform, end to end
              </span>
              <h1 className="mt-4 mx-auto max-w-[20ch] text-[clamp(2.2rem,4.8vw,3.3rem)] leading-[1.05] font-extrabold tracking-tightest text-ink">
                Everything to run your business, in one place.
              </h1>
              <p className="mt-5 mx-auto max-w-[58ch] text-[1.1rem] leading-relaxed text-ink-soft">
                Sell, get paid, track stock, manage money and people, and keep customers coming
                back — without stitching together a dozen disconnected apps.
              </p>
            </div>
          </div>
        </section>

        <TrustStrip />

        {/* Groups */}
        <section className="bg-surface">
          <div className="max-w-[1160px] mx-auto px-6 py-16 md:py-20 space-y-14">
            {groups.map(({ category, items }) => (
              <div key={category}>
                <h2 className="reveal text-[1.3rem] font-extrabold tracking-tightest text-ink">
                  {category}
                </h2>
                <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((p, i) => (
                    <Link
                      key={p.slug}
                      href={`/products/${p.slug}`}
                      className="reveal group flex flex-col rounded-2xl bg-paper hairline p-6 hover:border-brand-500 hover:-translate-y-1 hover:shadow-soft transition duration-200"
                      style={{ transitionDelay: `${i * 50}ms` }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="grid place-items-center w-11 h-11 rounded-[12px] bg-brand-50 text-brand-600 hairline">
                          <Icon name={p.icon} className="w-5 h-5" strokeWidth={1.7} />
                        </span>
                        <RoadmapBadge status={productStatus(p.slug)} />
                      </div>
                      <h3 className="mt-4 text-[1.08rem] font-bold tracking-tight text-ink group-hover:text-brand-600 transition">
                        {p.name}
                      </h3>
                      <p className="mt-1.5 text-[0.94rem] leading-relaxed text-ink-soft line-clamp-2">
                        {p.intro}
                      </p>
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
