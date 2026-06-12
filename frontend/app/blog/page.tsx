import type { Metadata } from "next";
import Link from "next/link";
import { Icon, IconSprite } from "@/app/components/Icon";
import { Nav } from "@/app/components/Nav";
import { Footer } from "@/app/components/Footer";
import { ScrollReveal } from "@/app/components/ScrollReveal";
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
          <div className="absolute inset-0 grid-bg [mask-image:radial-gradient(800px_400px_at_70%_0%,black,transparent_75%)]" />
          <div className="relative max-w-[1160px] mx-auto px-6 py-20 md:py-24">
            <div className="reveal">
              <span className="text-[12px] font-bold tracking-widest uppercase text-brand-600">
                Resources · Blog
              </span>
              <h1 className="mt-4 max-w-[20ch] text-[clamp(2.2rem,4.6vw,3.1rem)] leading-[1.06] font-extrabold tracking-tightest text-ink">
                Running your business, made clearer.
              </h1>
              <p className="mt-5 max-w-[58ch] text-[1.1rem] leading-relaxed text-ink-soft">
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
              className="reveal group grid lg:grid-cols-2 gap-8 items-center rounded-2xl bg-paper hairline p-7 md:p-9 hover:border-brand-200 transition"
            >
              <div className="relative order-2 lg:order-1">
                <div className="inline-flex items-center gap-2 text-[11.5px] font-bold tracking-widest uppercase text-brand-600">
                  <Icon name={featured.icon} className="w-4 h-4" />
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
              <div className="order-1 lg:order-2 aspect-[16/10] rounded-xl2 bg-gradient-to-br from-brand-500 to-accent-500 grid place-items-center">
                <Icon name={featured.icon} className="w-16 h-16 text-white/90" strokeWidth={1.4} />
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
                  <div className="aspect-[16/9] bg-gradient-to-br from-brand-100 to-brand-50 grid place-items-center">
                    <Icon name={p.icon} className="w-10 h-10 text-brand-600" strokeWidth={1.5} />
                  </div>
                  <div className="p-6 flex flex-col flex-1">
                    <div className="text-[11px] font-bold tracking-widest uppercase text-brand-600">
                      {p.category}
                    </div>
                    <h3 className="mt-2 text-[1.15rem] font-bold tracking-tight text-ink leading-snug group-hover:text-brand-600 transition">
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
