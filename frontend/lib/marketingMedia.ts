/**
 * Photography for the marketing pages.
 *
 * Each topic resolves to a hand-picked, topical real photo served from the
 * Unsplash CDN (`images.unsplash.com`, free Unsplash License). We previously
 * used LoremFlickr, but it began returning HTTP 401 for every request, so every
 * marketing photo silently fell back to the on-brand gradient panel. These are
 * fixed photo IDs — each was verified to return 200 — so the same picture renders
 * on every build/visit, and <MarketingPhoto> still degrades to a gradient if a
 * URL ever fails, so nothing shows a broken image.
 *
 * To use your own art later, replace a value here with a real URL (or a
 * `/public` path) — every page reads its photos through this one map.
 */
function unsplash(id: string, w = 1280, h = 853): string {
  // auto=format → webp where supported; fit=crop keeps the subject centered at
  // the requested ratio; q=80 is a good quality/size balance for hero imagery.
  return `https://images.unsplash.com/photo-${id}?w=${w}&h=${h}&q=80&auto=format&fit=crop`;
}

export const MEDIA = {
  // Industries — F&B
  "cafes-bakeries": unsplash("1495474472287-4d71bcdd2085"),
  restaurants: unsplash("1517248135467-4c7edcad34c4"),
  "quick-serve": unsplash("1550547660-d9450f859349"),
  "fine-dining": unsplash("1414235077428-338989a2e8c0"),
  "cloud-kitchen": unsplash("1556910103-1c02745aae4d"),
  // Industries — Retail
  "grocery-supermarket": unsplash("1542838132-92c53300491e"),
  "convenience-store": unsplash("1604719312566-8912e9227c6a"),
  "fashion-apparel": unsplash("1441986300917-64674bd600d8"),
  "specialty-store": unsplash("1472851294608-062f824d29cc"),
  "online-store": unsplash("1563013544-824ae1b704d3"),
  // Industries — Service & Enterprise
  service: unsplash("1560066984-138dadb4c035"),
  enterprise: unsplash("1497366216548-37526070297c"),
  "personal-care": unsplash("1522337360788-8b13dee7a37e"),
  healthcare: unsplash("1587854692152-cbe660dbde88"),
  warehouse: unsplash("1553413077-190dd305871c"),
  // Group-level photos (used by the industry outcomes section)
  fnb: unsplash("1579621970563-ebec7560ff3e"),
  retail: unsplash("1604719312566-8912e9227c6a"),

  // Products / platform
  "point-of-sale": unsplash("1556740738-b6a63e27c4df"),
  payments: unsplash("1556742049-0cfed4f6a45d"),
  inventory: unsplash("1586528116311-ad8dd3c8310d"),
  analytics: unsplash("1551288049-bebda4e38f71"),
  loyalty: unsplash("1556741533-6e6a62bd8b49"),
  online: unsplash("1556742502-ec7c0e9f34b1"),
  kitchen: unsplash("1565299624946-b28f40a0ae38"),
  staff: unsplash("1522071820081-009f0129c71c"),

  // Hardware
  "pos-terminal": unsplash("1612810806695-30f7a8258391"),
  "receipt-printer": unsplash("1572025442646-866d16c84a54"),
  "barcode-scanner": unsplash("1588702547923-7093a6c3ba33"),
  "cash-drawer": unsplash("1559526324-4b87b5e36e44"),
  "payment-reader": unsplash("1563013544-824ae1b704d3"),
  "customer-display": unsplash("1517336714731-489689fd1ca8"),
  "kitchen-display": unsplash("1546054454-aa26e2b734c7"),
  "label-printer": unsplash("1611162617474-5b21e879e113"),
  "hardware-hero": unsplash("1498050108023-c5249f4df085"),
  "hardware-bundle": unsplash("1441986300917-64674bd600d8"),

  // Company
  team: unsplash("1600880292203-757bb62b4baf"),
  story: unsplash("1507003211169-0a1dd7228f2d"),
  careers: unsplash("1522202176988-66273c2fd55f"),
  contact: unsplash("1521791136064-7986c2920216"),
  founders: unsplash("1556761175-5973dc0f32e7"),
} as const;

export type MediaKey = keyof typeof MEDIA;

/** Resolve a media key to a URL, returning null for unknown keys (→ fallback). */
export function media(key: string): string | null {
  return (MEDIA as Record<string, string>)[key] ?? null;
}

/** Rotating "real business" photos for the blog/story cards. */
const BLOG_PHOTOS: string[] = [
  unsplash("1507003211169-0a1dd7228f2d"),
  unsplash("1528698827591-e19ccd7bc23d"),
  unsplash("1442512595331-e89e73853f31"),
  unsplash("1488459716781-31db52582fe9"),
  unsplash("1519389950473-47ba0277781c"),
  unsplash("1567521464027-f127ff144326"),
];

/** A stable story photo for the nth post (deterministic, cycles the set). */
export function blogPhoto(index: number): string {
  return BLOG_PHOTOS[index % BLOG_PHOTOS.length];
}
