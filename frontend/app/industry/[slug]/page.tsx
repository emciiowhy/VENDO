import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IndustryView } from "@/app/components/marketing/IndustryView";
import { INDUSTRIES, getIndustry } from "@/lib/industries";

/** Marketing page for one industry, e.g. /industry/cafes-bakeries. Static. */

export function generateStaticParams() {
  return INDUSTRIES.map((i) => ({ slug: i.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = getIndustry(slug);
  if (!entry) return { title: "Industry not found — VendoPOS" };
  const title = `${entry.name} — VendoPOS`;
  return {
    title,
    description: entry.intro,
    openGraph: { title, description: entry.intro, type: "website" },
  };
}

export default async function IndustryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = getIndustry(slug);
  if (!entry) notFound();
  return <IndustryView industry={entry} />;
}
