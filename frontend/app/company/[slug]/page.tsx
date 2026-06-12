import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FeaturePage } from "@/app/components/marketing/FeaturePage";
import { COMPANY, company } from "@/lib/company";

/** Marketing page for a company section, e.g. /company/about. Static. */

export function generateStaticParams() {
  return COMPANY.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = company.get(slug);
  if (!entry) return { title: "Page not found — VendoPOS" };
  const title = `${entry.name} — VendoPOS`;
  return { title, description: entry.intro, openGraph: { title, description: entry.intro, type: "website" } };
}

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = company.get(slug);
  if (!entry) notFound();

  return (
    <FeaturePage
      eyebrow={entry.eyebrow}
      icon={entry.icon}
      name={entry.name}
      tagline={entry.tagline}
      intro={entry.intro}
      image={entry.image}
      cardsHeading={entry.cardsHeading ?? entry.name}
      cards={entry.cards}
      ctaLabel={entry.ctaLabel}
      ctaHref={entry.ctaHref}
      ctaHeading="Ready to get started?"
      ctaSub="Book a walkthrough and see how VendoPOS fits the way you run your business."
      related={{
        heading: "More from VendoPOS",
        basePath: "/company",
        items: company.related(slug).map((e) => ({ slug: e.slug, name: e.name, icon: e.icon })),
      }}
    />
  );
}
