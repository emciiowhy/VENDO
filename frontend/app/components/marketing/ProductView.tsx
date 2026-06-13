import Link from "next/link";
import { Icon, IconSprite } from "@/app/components/Icon";
import { Nav } from "@/app/components/Nav";
import { Footer } from "@/app/components/Footer";
import { ScrollReveal } from "@/app/components/ScrollReveal";
import { MarketingPhoto } from "@/app/components/marketing/MarketingPhoto";
import { MarketingVisual, visualKindForIcon } from "@/app/components/marketing/MarketingVisual";
import { RoadmapBadge } from "@/app/components/marketing/RoadmapBadge";
import { TrustStrip } from "@/app/components/marketing/TrustStrip";
import { media } from "@/lib/marketingMedia";
import {
  type ProductPage,
  productStatus,
  productPhotoKey,
  relatedProducts,
} from "@/lib/products";

/**
 * Bespoke product detail page — a split photo hero (text left, photograph
 * right), three feature highlights, and a live "in the dashboard" app-mockup
 * showcase (the CSS <MarketingVisual>, which actually reflects the app). The
 * mockup keeps products visually distinct from the photo-led industry pages and
 * the bundle-led hardware pages. "Coming soon" products carry a roadmap badge.
 */
export function ProductView({ product }: { product: ProductPage }) {
  const status = productStatus(product.slug);
  const photo = media(productPhotoKey(product.slug));
  const related = relatedProducts(product.slug);
  const lead = product.features[0];

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
            <div className="grid lg:grid-cols-[1.02fr_0.98fr] gap-12 lg:gap-14 items-center">
              <div className="reveal">
                <div className="inline-flex items-center gap-2 text-brand-600 bg-brand-50 hairline px-3 py-1.5 rounded-full">
                  <Icon name={product.icon} className="w-4 h-4" strokeWidth={1.7} />
                  <span className="text-[12px] font-bold tracking-widest uppercase">
                    {product.category}
                  </span>
                  <RoadmapBadge status={status} className="ml-1" />
                </div>
                <h1 className="mt-5 max-w-[18ch] text-[clamp(2.2rem,4.6vw,3.2rem)] leading-[1.06] font-extrabold tracking-tightest text-ink">
                  {product.tagline}
                </h1>
                <p className="mt-5 max-w-[54ch] text-[1.1rem] leading-relaxed text-ink-soft">
                  {product.intro}
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
                    href="/#pricing"
                    className="inline-flex items-center gap-2 bg-surface hairline text-ink font-semibold text-[14.5px] px-6 py-3.5 rounded-[11px] hover:border-brand-200 hover:text-brand-600 transition"
                  >
                    See pricing
                  </Link>
                </div>
              </div>
              <div className="reveal" style={{ transitionDelay: "120ms" }}>
                <MarketingPhoto
                  src={photo}
                  alt={product.name}
                  icon={product.icon}
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

        {/* Highlights — 3-up */}
        <section className="bg-surface hairline-b">
          <div className="max-w-[1160px] mx-auto px-6 py-20">
            <h2 className="reveal max-w-[24ch] text-[1.9rem] leading-tight font-extrabold tracking-tightest text-ink">
              What you get with {product.name}
            </h2>
            <div className="mt-12 grid gap-10 md:grid-cols-3">
              {product.features.map((f, i) => (
                <div key={f.title} className="reveal" style={{ transitionDelay: `${i * 80}ms` }}>
                  <span className="grid place-items-center w-12 h-12 rounded-[13px] bg-ink text-white">
                    <Icon name={f.icon} className="w-[22px] h-[22px]" />
                  </span>
                  <h3 className="mt-5 text-[1.2rem] font-extrabold tracking-tight text-ink">
                    {f.title}
                  </h3>
                  <p className="mt-2.5 text-[1rem] leading-relaxed text-ink-soft">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* In-app showcase — CSS mockup of the actual product surface */}
        <section className="bg-paper hairline-b">
          <div className="max-w-[1160px] mx-auto px-6 py-20">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              <div className="reveal" style={{ transitionDelay: "100ms" }}>
                <MarketingVisual
                  icon={lead?.icon ?? product.icon}
                  label={product.name}
                  kind={visualKindForIcon(lead?.icon ?? product.icon)}
                />
              </div>
              <div className="reveal lg:order-first">
                <h2 className="text-[1.7rem] leading-tight font-extrabold tracking-tightest text-ink">
                  Right inside the VendoPOS dashboard
                </h2>
                <p className="mt-4 max-w-[50ch] text-[1.05rem] leading-relaxed text-ink-soft">
                  {product.name} isn&rsquo;t a bolt-on. It lives in the same system as your sales,
                  stock, and staff — one login, one source of truth, everything tied together.
                </p>
                <Link
                  href="/#demo"
                  className="mt-7 inline-flex items-center gap-2 text-brand-600 font-semibold text-[15px] hover:text-brand-700 transition"
                >
                  See it in a live walkthrough
                  <Icon name="arrow" className="w-[18px] h-[18px]" strokeWidth={1.8} />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Related products */}
        {related.length > 0 && (
          <section className="bg-surface">
            <div className="max-w-[1160px] mx-auto px-6 py-20">
              <h2 className="reveal text-[1.3rem] font-extrabold tracking-tightest text-ink">
                Explore more products
              </h2>
              <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {related.map((p, i) => (
                  <Link
                    key={p.slug}
                    href={`/products/${p.slug}`}
                    className="reveal group flex items-center gap-3 rounded-xl bg-paper hairline p-4 hover:border-brand-500 hover:-translate-y-0.5 transition duration-200"
                    style={{ transitionDelay: `${i * 60}ms` }}
                  >
                    <span className="grid place-items-center w-9 h-9 rounded-[10px] bg-surface hairline text-ink shrink-0">
                      <Icon name={p.icon} className="w-[18px] h-[18px]" />
                    </span>
                    <span className="flex items-center gap-2 text-[14.5px] font-semibold text-ink group-hover:text-brand-600 transition">
                      {p.name}
                      <RoadmapBadge status={productStatus(p.slug)} />
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
                  See {product.name} in your store
                </h2>
                <p className="mt-2 text-[1rem] text-white/70 max-w-[52ch]">
                  Book a quick walkthrough and we&rsquo;ll set it up around how you actually operate.
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
