import type { Metadata } from "next";

/** Canonical brand name used in og:site_name and card titles. */
export const SITE_NAME = "VendoPOS";

/**
 * Public origin used for canonical URLs, og:url/og:image, robots and the
 * sitemap. NEXT_PUBLIC_APP_URL overrides; production builds otherwise default
 * to the live domain so a missing env var can never ship localhost URLs to
 * search engines.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.NODE_ENV === "production" ? "https://vendopos.shop" : "http://localhost:3000")
).replace(/\/+$/, "");

/**
 * Shared social-card image: a real 1200×630 screenshot of the landing-page hero
 * (captured by scripts/capture-og.mjs → /public/og-landing.png). 1200×630 is the
 * canonical large-card ratio, so cards use `summary_large_image` to show it full
 * width rather than a cramped square. Re-run the capture script after a hero
 * redesign to refresh it. Resolves absolutely against `metadataBase`.
 */
export const OG_IMAGE = {
  url: "/og-landing.png",
  width: 1200,
  height: 630,
  alt: "VendoPOS — one platform to run your whole business",
};

/**
 * The square brand mark — used for the schema.org Organization logo and the
 * browser/app icons, where a 1:1 logo (not the wide hero shot) is what's wanted.
 */
export const LOGO_IMAGE = "/vendo-logo.png";

export interface PageMetaInput {
  /** Document <title> for the page. */
  title: string;
  /** Meta description for the page. */
  description: string;
  /** Route path, e.g. "/products/procurement" — drives og:url + canonical. */
  path: string;
  /** Open Graph object type. Defaults to "website"; use "article" for posts. */
  type?: "website" | "article";
  /** Optional distinct social title (defaults to `title`). */
  ogTitle?: string;
  /** Optional distinct social description (defaults to `description`). */
  ogDescription?: string;
}

/**
 * Builds a complete, consistent Metadata object for a marketing route.
 *
 * Next.js shallow-merges metadata and *replaces* the entire `openGraph` /
 * `twitter` object when a child segment sets one — so each page must supply its
 * own `images` and `url` here, otherwise the root defaults are silently dropped.
 * That replacement is exactly why og:image / og:url were reported missing.
 * Routing every page through this helper keeps og:image, og:url, canonical, and
 * the Twitter card present and uniform everywhere.
 */
export function pageMetadata({
  title,
  description,
  path,
  type = "website",
  ogTitle,
  ogDescription,
}: PageMetaInput): Metadata {
  const socialTitle = ogTitle ?? title;
  const socialDescription = ogDescription ?? description;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: socialTitle,
      description: socialDescription,
      type,
      url: path,
      siteName: SITE_NAME,
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description: socialDescription,
      images: [OG_IMAGE.url],
    },
  };
}
