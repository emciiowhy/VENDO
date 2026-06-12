import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FeaturePage } from "@/app/components/marketing/FeaturePage";
import { HARDWARE, hardware } from "@/lib/hardware";

/** Marketing page for one hardware item, e.g. /hardware/receipt-printer. Static. */

export function generateStaticParams() {
  return HARDWARE.map((h) => ({ slug: h.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = hardware.get(slug);
  if (!entry) return { title: "Hardware not found — VendoPOS" };
  const title = `${entry.name} — VendoPOS`;
  return { title, description: entry.intro, openGraph: { title, description: entry.intro, type: "website" } };
}

export default async function HardwarePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = hardware.get(slug);
  if (!entry) notFound();

  return (
    <FeaturePage
      eyebrow={entry.eyebrow}
      icon={entry.icon}
      name={entry.name}
      tagline={entry.tagline}
      intro={entry.intro}
      image={entry.image}
      cardsHeading={entry.cardsHeading ?? "Highlights"}
      cards={entry.cards}
      ctaHeading={`Add ${entry.name} to your setup`}
      ctaSub="Talk to us about the right hardware bundle for your counter."
      related={{
        heading: "More hardware",
        basePath: "/hardware",
        items: hardware.related(slug).map((e) => ({ slug: e.slug, name: e.name, icon: e.icon })),
      }}
    />
  );
}
