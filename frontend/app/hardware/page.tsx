import type { Metadata } from "next";
import Link from "next/link";
import { Icon, IconSprite } from "@/app/components/Icon";
import { Nav } from "@/app/components/Nav";
import { Footer } from "@/app/components/Footer";
import { ScrollReveal } from "@/app/components/ScrollReveal";
import { MarketingPhoto } from "@/app/components/marketing/MarketingPhoto";
import { TrustStrip } from "@/app/components/marketing/TrustStrip";
import { media } from "@/lib/marketingMedia";
import { HARDWARE, HARDWARE_BUNDLES, hardware, hardwarePhotoKey } from "@/lib/hardware";

export const metadata: Metadata = {
  title: "Hardware — VendoPOS",
  description:
    "POS hardware built for speed and reliability — terminals, printers, scanners, cash drawers, payment readers and displays, in bundles for every business.",
  openGraph: {
    title: "Hardware — VendoPOS",
    description:
      "POS hardware built for speed and reliability — terminals, printers, scanners, cash drawers, payment readers and displays, in bundles for every business.",
    type: "website",
  },
};

export default function HardwareLanding() {
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
                  <Icon name="pos" className="w-4 h-4" strokeWidth={1.7} />
                  <span className="text-[12px] font-bold tracking-widest uppercase">Hardware</span>
                </div>
                <h1 className="mt-5 max-w-[16ch] text-[clamp(2.2rem,4.6vw,3.2rem)] leading-[1.05] font-extrabold tracking-tightest text-ink">
                  POS hardware built for speed and reliability.
                </h1>
                <p className="mt-5 max-w-[52ch] text-[1.1rem] leading-relaxed text-ink-soft">
                  Durable gear that works seamlessly with VendoPOS — keeping your business running
                  smoothly every day while looking sharp on your counter.
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
                    href="#bundles"
                    className="inline-flex items-center gap-2 bg-surface hairline text-ink font-semibold text-[14.5px] px-6 py-3.5 rounded-[11px] hover:border-brand-200 hover:text-brand-600 transition"
                  >
                    See bundles
                  </Link>
                </div>
              </div>
              <div className="reveal" style={{ transitionDelay: "120ms" }}>
                <MarketingPhoto
                  src={media("hardware-hero")}
                  alt="VendoPOS hardware"
                  icon="pos"
                  aspect="aspect-[4/3]"
                  rounded="rounded-[20px]"
                  priority
                  className="shadow-soft"
                />
              </div>
            </div>
          </div>
        </section>

        <TrustStrip />

        {/* Bundles */}
        <section id="bundles" className="bg-surface hairline-b scroll-mt-24">
          <div className="max-w-[1160px] mx-auto px-6 py-20">
            <div className="reveal text-center">
              <h2 className="mx-auto max-w-[24ch] text-[1.9rem] leading-tight font-extrabold tracking-tightest text-ink">
                Hardware bundles built for every business need
              </h2>
              <p className="mt-4 mx-auto max-w-[54ch] text-[1.05rem] text-ink-soft">
                Start with a bundle tuned to your counter, then add gear as you grow.
              </p>
            </div>
            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {HARDWARE_BUNDLES.map((b, i) => (
                <div
                  key={b.slug}
                  className="reveal flex flex-col rounded-2xl bg-paper hairline overflow-hidden"
                  style={{ transitionDelay: `${i * 80}ms` }}
                >
                  <MarketingPhoto
                    src={media(b.photoKey)}
                    alt={b.name}
                    icon={b.icon}
                    aspect="aspect-[16/10]"
                    rounded="rounded-none"
                  />
                  <div className="p-6 flex flex-col flex-1">
                    <span className="text-[11px] font-bold tracking-widest uppercase text-brand-600">
                      {b.forWho}
                    </span>
                    <h3 className="mt-1.5 text-[1.25rem] font-extrabold tracking-tight text-ink">
                      {b.name}
                    </h3>
                    <p className="mt-2 text-[0.96rem] leading-relaxed text-ink-soft">{b.blurb}</p>
                    <ul className="mt-4 space-y-2">
                      {b.includes.map((slug) => {
                        const item = hardware.get(slug);
                        if (!item) return null;
                        return (
                          <li key={slug}>
                            <Link
                              href={`/hardware/${slug}`}
                              className="flex items-center gap-2.5 text-[14px] font-semibold text-ink hover:text-brand-600 transition"
                            >
                              <Icon
                                name="check"
                                className="w-4 h-4 text-accent-600 shrink-0"
                                strokeWidth={2.2}
                              />
                              {item.name}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                    <Link
                      href="/#demo"
                      className="mt-6 inline-flex items-center justify-center gap-2 bg-ink text-white font-semibold text-[14px] px-5 py-3 rounded-[10px] hover:bg-black transition"
                    >
                      Get this bundle
                      <Icon name="arrow" className="w-[16px] h-[16px]" strokeWidth={1.8} />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* All gear */}
        <section className="bg-surface">
          <div className="max-w-[1160px] mx-auto px-6 py-20">
            <h2 className="reveal text-[1.3rem] font-extrabold tracking-tightest text-ink">
              All hardware
            </h2>
            <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {HARDWARE.map((h, i) => (
                <Link
                  key={h.slug}
                  href={`/hardware/${h.slug}`}
                  className="reveal group flex flex-col rounded-2xl bg-paper hairline overflow-hidden hover:-translate-y-1 hover:shadow-soft transition duration-200"
                  style={{ transitionDelay: `${i * 50}ms` }}
                >
                  <MarketingPhoto
                    src={media(hardwarePhotoKey(h.slug))}
                    alt={h.name}
                    icon={h.icon}
                    aspect="aspect-[4/3]"
                    rounded="rounded-none"
                  />
                  <div className="p-4">
                    <h3 className="text-[0.98rem] font-bold tracking-tight text-ink group-hover:text-brand-600 transition">
                      {h.name}
                    </h3>
                    <p className="mt-1 text-[0.86rem] leading-snug text-ink-soft line-clamp-2">
                      {h.tagline}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
