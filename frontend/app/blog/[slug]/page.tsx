import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon, IconSprite } from "@/app/components/Icon";
import { Nav } from "@/app/components/Nav";
import { Footer } from "@/app/components/Footer";
import { ScrollReveal } from "@/app/components/ScrollReveal";
import { POSTS, getPost, relatedPosts, formatPostDate } from "@/lib/blog";

/** A single blog article, e.g. /blog/bir-compliance-for-small-businesses. Static. */

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return { title: "Post not found — VendoPOS" };
  const title = `${post.title} — VendoPOS`;
  return {
    title,
    description: post.excerpt,
    openGraph: { title, description: post.excerpt, type: "article" },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const related = relatedPosts(slug);

  return (
    <>
      <IconSprite />
      <ScrollReveal />
      <Nav />
      <main>
        {/* Article header */}
        <section className="relative overflow-hidden bg-paper hairline-b">
          <div className="absolute inset-0 grid-bg [mask-image:radial-gradient(800px_380px_at_70%_0%,black,transparent_75%)]" />
          <div className="relative max-w-[760px] mx-auto px-6 py-16 md:py-20">
            <Link
              href="/blog"
              className="reveal inline-flex items-center gap-2 text-[13px] font-semibold text-ink-soft hover:text-ink transition"
            >
              <Icon name="arrow" className="w-4 h-4 rotate-180" />
              All posts
            </Link>
            <div className="reveal mt-6 inline-flex items-center gap-2 text-[11.5px] font-bold tracking-widest uppercase text-brand-600">
              <Icon name={post.icon} className="w-4 h-4" />
              {post.category}
            </div>
            <h1 className="reveal mt-3 text-[clamp(1.9rem,4vw,2.7rem)] leading-[1.1] font-extrabold tracking-tightest text-ink">
              {post.title}
            </h1>
            <div className="reveal mt-5 flex items-center gap-3 text-[13px] font-semibold text-ink-faint">
              <span>{formatPostDate(post.date)}</span>
              <span className="w-1 h-1 rounded-full bg-ink-faint" />
              <span>{post.readMinutes} min read</span>
            </div>
          </div>
        </section>

        {/* Cover */}
        <section className="bg-surface">
          <div className="max-w-[760px] mx-auto px-6 pt-12">
            <div className="reveal aspect-[16/7] rounded-xl2 bg-gradient-to-br from-brand-500 to-accent-500 grid place-items-center">
              <Icon name={post.icon} className="w-20 h-20 text-white/90" strokeWidth={1.3} />
            </div>
          </div>
        </section>

        {/* Body */}
        <section className="bg-surface">
          <article className="max-w-[760px] mx-auto px-6 py-14">
            {post.sections.map((s, i) => (
              <div key={i} className="reveal mb-8 last:mb-0">
                {s.heading && (
                  <h2 className="text-[1.4rem] font-extrabold tracking-tight text-ink mb-3">
                    {s.heading}
                  </h2>
                )}
                {s.paragraphs?.map((p, j) => (
                  <p key={j} className="text-[1.06rem] leading-[1.75] text-ink-soft mb-4 last:mb-0">
                    {p}
                  </p>
                ))}
                {s.bullets && (
                  <ul className="mt-2 space-y-2.5">
                    {s.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-3 text-[1.04rem] leading-relaxed text-ink-soft">
                        <span className="mt-2 w-1.5 h-1.5 rounded-full bg-accent-500 shrink-0" />
                        {b}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}

            {/* CTA */}
            <div className="reveal mt-12 rounded-2xl bg-ink text-white p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
              <div>
                <h3 className="text-[1.3rem] font-extrabold tracking-tightest">
                  See VendoPOS in your store
                </h3>
                <p className="mt-1.5 text-[0.96rem] text-white/70">
                  Book a quick walkthrough tailored to how you operate.
                </p>
              </div>
              <Link
                href="/#demo"
                className="inline-flex items-center gap-2 bg-white text-ink font-semibold text-[14.5px] px-6 py-3 rounded-[11px] hover:bg-white/90 transition shrink-0"
              >
                Request a Demo
                <Icon name="arrow" className="w-[18px] h-[18px]" strokeWidth={1.8} />
              </Link>
            </div>
          </article>
        </section>

        {/* Related posts */}
        {related.length > 0 && (
          <section className="bg-paper hairline-t">
            <div className="max-w-[1160px] mx-auto px-6 py-16">
              <h2 className="reveal text-[1.3rem] font-extrabold tracking-tightest text-ink">
                Keep reading
              </h2>
              <div className="mt-7 grid gap-6 md:grid-cols-3">
                {related.map((p, i) => (
                  <Link
                    key={p.slug}
                    href={`/blog/${p.slug}`}
                    className="reveal group flex flex-col rounded-2xl bg-surface hairline overflow-hidden hover:-translate-y-1 hover:shadow-soft transition duration-200"
                    style={{ transitionDelay: `${i * 80}ms` }}
                  >
                    <div className="aspect-[16/9] bg-gradient-to-br from-brand-100 to-brand-50 grid place-items-center">
                      <Icon name={p.icon} className="w-9 h-9 text-brand-600" strokeWidth={1.5} />
                    </div>
                    <div className="p-5">
                      <div className="text-[11px] font-bold tracking-widest uppercase text-brand-600">
                        {p.category}
                      </div>
                      <h3 className="mt-2 text-[1.05rem] font-bold tracking-tight text-ink leading-snug group-hover:text-brand-600 transition">
                        {p.title}
                      </h3>
                    </div>
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
