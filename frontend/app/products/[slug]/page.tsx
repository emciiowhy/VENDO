import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductView } from "@/app/components/marketing/ProductView";
import { getProduct, PRODUCTS } from "@/lib/products";

/**
 * Marketing page for a single product, e.g. /products/point-of-sale. Fully
 * static: every slug is pre-rendered from the PRODUCTS content source via
 * generateStaticParams, with per-page metadata for SEO/social. Renders through
 * the bespoke <ProductView> template.
 */

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) return { title: "Product not found — VendoPOS" };
  const title = `${product.name} — VendoPOS`;
  return {
    title,
    description: product.intro,
    openGraph: { title, description: product.intro, type: "website" },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) notFound();
  return <ProductView product={product} />;
}
