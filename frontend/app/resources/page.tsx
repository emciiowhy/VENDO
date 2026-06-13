import type { Metadata } from "next";
import Link from "next/link";
import { Icon, IconSprite, type IconName } from "@/app/components/Icon";
import { Nav } from "@/app/components/Nav";
import { Footer } from "@/app/components/Footer";
import { ScrollReveal } from "@/app/components/ScrollReveal";
import { MarketingPhoto } from "@/app/components/marketing/MarketingPhoto";
import { blogPhoto } from "@/lib/marketingMedia";
import { listPosts, formatPostDate } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Resources — VendoPOS",
  description:
    "Guides, stories, and answers for running your business on VendoPOS — the blog, how it works, why PH businesses switch, and FAQs.",
  openGraph: {
    title: "Resources — VendoPOS",
    description:
      "Guides, stories, and answers for running your business on VendoPOS — the blog, how it works, why PH businesses switch, and FAQs.",
    type: "website",
  },
};

const LINKS: { icon: IconName; title: string; body: string; href: string; cta: string }[] = [
  {
    icon: "file",
    title: "Blog",
    body: "Practical guides on compliance, payments, inventory, and growing a Filipino business.",
    href: "/blog",
    cta: "Read the blog",
  },
  {
    icon: "activity",
    title: "How it works",
    body: "See how VendoPOS goes from sign-up to your first sale on one connected platform.",
    href: "/#how",
    cta: "See how",
  },
  {
    icon: "heart",
    title: "Why PH businesses switch",
    body: "Peso-first, BIR-ready, e-wallet-native — built for how you actually operate here.",
    href: "/#why",
    cta: "Why switch",
  },
  {
    icon: "search",
    title: "FAQ",
    body: "Quick answers on pricing, hardware, onboarding, offline mode, and compliance.",
    href: "/#faq",
    cta: "Browse FAQ",
  },
];

export default function ResourcesHub() {
  const posts = listPosts().slice(0, 3);

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
                Resources
              </span>
              <h1 className="mt-4 mx-auto max-w-[20ch] text-[clamp(2.2rem,4.8vw,3.3rem)] leading-[1.05] font-extrabold tracking-tightest text-ink">
                Guides, stories, and answers.
              </h1>
              <p className="mt-5 mx-auto max-w-[56ch] text-[1.1rem] leading-relaxed text-ink-soft">
                Everything to help you run your business better on VendoPOS — from compliance
                deep-dives to quick answers.
              </p>
            </div>
          </div>
        </section>

        {/* Resource links */}
        <section className="bg-surface hairline-b">
          <div className="max-w-[1160px] mx-auto px-6 py-16 md:py-20">
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {LINKS.map((l, i) => (
                <Link
                  key={l.title}
                  href={l.href}
                  className="reveal group flex flex-col rounded-2xl bg-paper hairline p-6 hover:border-brand-500 hover:-translate-y-1 hover:shadow-soft transition duration-200"
                  style={{ transitionDelay: `${i * 60}ms` }}
                >
                  <span className="grid place-items-center w-11 h-11 rounded-[12px] bg-brand-50 text-brand-600 hairline">
                    <Icon name={l.icon} className="w-5 h-5" strokeWidth={1.7} />
                  </span>
                  <h2 className="mt-4 text-[1.1rem] font-bold tracking-tight text-ink group-hover:text-brand-600 transition">
                    {l.title}
                  </h2>
                  <p className="mt-1.5 text-[0.92rem] leading-relaxed text-ink-soft flex-1">
                    {l.body}
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-brand-600">
                    {l.cta}
                    <Icon name="arrow" className="w-4 h-4" strokeWidth={1.8} />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Latest from the blog */}
        <section className="bg-surface">
          <div className="max-w-[1160px] mx-auto px-6 py-16 md:py-20">
            <div className="reveal flex items-end justify-between gap-4">
              <h2 className="text-[1.3rem] font-extrabold tracking-tightest text-ink">
                Latest from the blog
              </h2>
              <Link
                href="/blog"
                className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-brand-600 hover:text-brand-700 transition"
              >
                All posts
                <Icon name="arrow" className="w-4 h-4" strokeWidth={1.8} />
              </Link>
            </div>
            <div className="mt-7 grid gap-6 md:grid-cols-3">
              {posts.map((p, i) => (
                <Link
                  key={p.slug}
                  href={`/blog/${p.slug}`}
                  className="reveal group flex flex-col rounded-2xl bg-paper hairline overflow-hidden hover:-translate-y-1 hover:shadow-soft transition duration-200"
                  style={{ transitionDelay: `${i * 70}ms` }}
                >
                  <MarketingPhoto
                    src={blogPhoto(i)}
                    alt={p.title}
                    icon={p.icon}
                    aspect="aspect-[16/9]"
                    rounded="rounded-none"
                  />
                  <div className="p-6 flex flex-col flex-1">
                    <div className="text-[11px] font-bold tracking-widest uppercase text-brand-600">
                      {p.category}
                    </div>
                    <h3 className="mt-2 text-[1.12rem] font-bold tracking-tight text-ink leading-snug group-hover:text-brand-600 transition">
                      {p.title}
                    </h3>
                    <div className="mt-auto pt-4 flex items-center gap-3 text-[12.5px] font-semibold text-ink-faint">
                      <span>{formatPostDate(p.date)}</span>
                      <span className="w-1 h-1 rounded-full bg-ink-faint" />
                      <span>{p.readMinutes} min read</span>
                    </div>
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
