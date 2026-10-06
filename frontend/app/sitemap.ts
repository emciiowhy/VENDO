import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";
import { POSTS } from "@/lib/blog";
import { INDUSTRIES } from "@/lib/industries";
import { HARDWARE } from "@/lib/hardware";
import { PRODUCTS } from "@/lib/products";

/**
 * sitemap.xml — every public marketing route, including each statically
 * generated product / industry / hardware / blog page, so search engines can
 * discover the whole site from one URL submitted in Search Console.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  // lastModified is only emitted where we know a real edit date (blog posts).
  // Stamping every page with the build time teaches crawlers to ignore it.
  const page = (
    path: string,
    priority: number,
    changeFrequency: "weekly" | "monthly" | "yearly" = "monthly",
    lastModified?: Date,
  ) => ({
    url: `${SITE_URL}${path}`,
    ...(lastModified && { lastModified }),
    changeFrequency,
    priority,
  });

  return [
    page("/", 1, "weekly"),
    page("/products", 0.9),
    page("/industry", 0.9),
    page("/hardware", 0.8),
    page("/enterprise", 0.8),
    page("/blog", 0.7, "weekly"),
    page("/resources", 0.6),
    page("/about", 0.6),
    page("/contact", 0.6),
    page("/careers", 0.5),
    page("/security", 0.5),
    page("/privacy", 0.3, "yearly"),
    page("/terms", 0.3, "yearly"),
    ...PRODUCTS.map((p) => page(`/products/${p.slug}`, 0.8)),
    ...INDUSTRIES.map((i) => page(`/industry/${i.slug}`, 0.8)),
    ...HARDWARE.map((h) => page(`/hardware/${h.slug}`, 0.6)),
    ...POSTS.map((p) => page(`/blog/${p.slug}`, 0.6, "monthly", new Date(p.date))),
  ];
}
