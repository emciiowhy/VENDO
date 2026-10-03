import type { Metadata } from "next";

/** Canonical brand name used in og:site_name and card titles. */
export const SITE_NAME = "VendoPOS";

/**
 * Shared social-card image. A 1024×1024 brand mark in /public that resolves
 * absolutely against `metadataBase` (set in the root layout), guaranteeing a
 * valid og:image / twitter:image on every route. Swap for a dedicated
 * 1200×630 banner when one exists.
 */
export const OG_IMAGE = {
  url: "/vendo-logo.png",
  width: 1024,
  height: 1024,
  alt: "VendoPOS — one platform to run your whole business",
};

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
      card: "summary",
      title: socialTitle,
      description: socialDescription,
      images: [OG_IMAGE.url],
    },
  };
}
