import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { notFound } from "next/navigation";
import { CompanyView } from "@/app/components/marketing/CompanyView";
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
  return pageMetadata({ title, description: entry.intro, path: `/company/${slug}` });
}

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = company.get(slug);
  if (!entry) notFound();
  return <CompanyView entry={entry} />;
}
