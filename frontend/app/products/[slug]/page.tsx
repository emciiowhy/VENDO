import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FeaturePage } from "@/app/components/marketing/FeaturePage";
import { getProduct, relatedProducts, PRODUCTS } from "@/lib/products";

/**
 * Marketing feature page for a single product, e.g. /products/point-of-sale.
 * Fully static: every slug is pre-rendered from the PRODUCTS content source via
 * generateStaticParams, with per-page metadata for SEO/social. Renders through
 * the shared <FeaturePage> template.
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

  return (
    <FeaturePage
      eyebrow={product.category}
      icon={product.icon}
      name={product.name}
      tagline={product.tagline}
      intro={product.intro}
      cardsHeading={`What you get with ${product.name}`}
      cards={product.features}
      ctaHeading={`See ${product.name} in your store`}
      ctaSub="Book a quick walkthrough and we'll set it up around how you actually operate."
      related={{
        heading: "Explore more products",
        basePath: "/products",
        items: relatedProducts(slug).map((p) => ({
          slug: p.slug,
          name: p.name,
          icon: p.icon,
        })),
      }}
    />
  );
}
