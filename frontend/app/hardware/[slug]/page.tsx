import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HardwareView } from "@/app/components/marketing/HardwareView";
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
  return <HardwareView entry={entry} />;
}
