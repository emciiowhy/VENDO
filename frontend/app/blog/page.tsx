import type { Metadata } from "next";
import Link from "next/link";
import { Icon, IconSprite } from "@/app/components/Icon";
import { Nav } from "@/app/components/Nav";
import { Footer } from "@/app/components/Footer";
import { ScrollReveal } from "@/app/components/ScrollReveal";
import { MarketingPhoto } from "@/app/components/marketing/MarketingPhoto";
import { blogPhoto } from "@/lib/marketingMedia";
import { listPosts, formatPostDate } from "@/lib/blog";

/** Resources → Blog index. Static list of posts, newest-first. */
export const metadata: Metadata = {
  title: "Blog — VendoPOS",
  description:
    "Practical guides on BIR compliance, payments, inventory, and running a Filipino business on one platform.",
  openGraph: {
    title: "VendoPOS Blog",
    description:
      "Practical guides on BIR compliance, payments, inventory, and running a Filipino business on one platform.",
    type: "website",
  },
};

export default function BlogIndex() {
  const posts = listPosts();
  const [featured, ...rest] = posts;

  return (
    <>
      <IconSprite />
      <ScrollReveal />
      <Nav />
      <main>
        {/* Header */}
        <section className="relative overflow-hidden bg-paper hairline-b">
          <div className="absolute inset-0 grid-bg [mask-image:radial-gradient(800px_400px_at_50%_0%,black,transparent_75%)]" />
          <div className="relative max-w-[1160px] mx-auto px-6 py-20 md:py-24 text-center">
            <div className="reveal">
              <span className="text-[12px] font-bold tracking-widest uppercase text-brand-600">
                Resources · Blog
              </span>
              <h1 className="mt-4 mx-auto max-w-[18ch] text-[clamp(2.2rem,4.8vw,3.3rem)] leading-[1.04] font-extrabold tracking-tightest text-ink">
                Real stories. Real businesses. Real wins.
              </h1>
              <p className="mt-5 mx-auto max-w-[58ch] text-[1.1rem] leading-relaxed text-ink-soft">
                Practical writing on BIR compliance, payments, inventory, and the day-to-day of
                running a Filipino business on one platform.
              </p>
            </div>
          </div>
        </section>

        {/* Featured post */}
        <section className="bg-surface">
          <div className="max-w-[1160px] mx-auto px-6 pt-16">
            <Link
              href={`/blog/${featured.slug}`}
              className="reveal group grid lg:grid-cols-2 gap-8 items-center rounded-2xl bg-paper hairline overflow-hidden hover:border-brand-200 transition"
            >
              <div className="order-1 lg:order-1">
                <MarketingPhoto
                  src={blogPhoto(0)}
                  alt={featured.title}
                  icon={featured.icon}
                  aspect="aspect-[16/11]"
                  rounded="rounded-none"
                  priority
                />
              </div>
              <div className="relative order-2 lg:order-2 p-7 md:p-9">
                <div className="inline-flex items-center gap-2 rounded-full bg-brand-50 hairline px-3 py-1 text-[11.5px] font-bold tracking-widest uppercase text-brand-600">
                  <Icon name={featured.icon} className="w-3.5 h-3.5" />
                  {featured.category}
                </div>
                <h2 className="mt-3 text-[1.9rem] leading-tight font-extrabold tracking-tightest text-ink group-hover:text-brand-600 transition">
                  {featured.title}
                </h2>
                <p className="mt-3 text-[1.02rem] leading-relaxed text-ink-soft max-w-[52ch]">
                  {featured.excerpt}
                </p>
                <div className="mt-5 flex items-center gap-3 text-[13px] font-semibold text-ink-faint">
                  <span>{formatPostDate(featured.date)}</span>
                  <span className="w-1 h-1 rounded-full bg-ink-faint" />
                  <span>{featured.readMinutes} min read</span>
                </div>
              </div>
            </Link>
          </div>
        </section>

        {/* Post grid */}
        <section className="bg-surface">
          <div className="max-w-[1160px] mx-auto px-6 py-16">
            <div className="grid gap-6 md:grid-cols-3">
              {rest.map((p, i) => (
                <Link
                  key={p.slug}
                  href={`/blog/${p.slug}`}
                  className="reveal group flex flex-col rounded-2xl bg-paper hairline overflow-hidden hover:-translate-y-1 hover:shadow-soft transition duration-200"
                  style={{ transitionDelay: `${i * 80}ms` }}
                >
                  <div className="relative">
                    <MarketingPhoto
                      src={blogPhoto(i + 1)}
                      alt={p.title}
                      icon={p.icon}
                      aspect="aspect-[16/9]"
                      rounded="rounded-none"
                    />
                    <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-surface/95 hairline px-2.5 py-1 text-[11px] font-bold tracking-wide uppercase text-brand-600 backdrop-blur">
                      <Icon name={p.icon} className="w-3.5 h-3.5" />
                      {p.category}
                    </span>
                  </div>
                  <div className="p-6 flex flex-col flex-1">
                    <h3 className="text-[1.15rem] font-bold tracking-tight text-ink leading-snug group-hover:text-brand-600 transition">
                      {p.title}
                    </h3>
                    <p className="mt-2 text-[0.94rem] leading-relaxed text-ink-soft line-clamp-3">
                      {p.excerpt}
                    </p>
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
