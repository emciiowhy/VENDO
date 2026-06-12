import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FeaturePage } from "@/app/components/marketing/FeaturePage";
import { INDUSTRIES, industries } from "@/lib/industries";

/** Marketing page for one industry, e.g. /industry/food-and-beverage. Static. */

export function generateStaticParams() {
  return INDUSTRIES.map((i) => ({ slug: i.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = industries.get(slug);
  if (!entry) return { title: "Industry not found — VendoPOS" };
  const title = `${entry.name} — VendoPOS`;
  return { title, description: entry.intro, openGraph: { title, description: entry.intro, type: "website" } };
}

export default async function IndustryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = industries.get(slug);
  if (!entry) notFound();

  return (
    <FeaturePage
      eyebrow={entry.eyebrow}
      icon={entry.icon}
      name={entry.name}
      tagline={entry.tagline}
      intro={entry.intro}
      image={entry.image}
      cardsHeading={entry.cardsHeading ?? `Built for ${entry.name}`}
      cards={entry.cards}
      ctaHeading={`See VendoPOS for ${entry.name}`}
      ctaSub="Book a walkthrough and we'll tailor the setup to how your business operates."
      related={{
        heading: "Explore more industries",
        basePath: "/industry",
        items: industries.related(slug).map((e) => ({ slug: e.slug, name: e.name, icon: e.icon })),
      }}
    />
  );
}
