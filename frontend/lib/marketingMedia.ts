/**
 * Photography for the marketing pages.
 *
 * Each topic resolves to a hand-picked, topical real photo served from the
 * Unsplash CDN (`images.unsplash.com`, free Unsplash License). We previously
 * used LoremFlickr, but it began returning HTTP 401 for every request, so every
 * marketing photo silently fell back to the on-brand gradient panel. These are
 * fixed photo IDs — each was verified to return 200 and checked by eye to show
 * its topic (the receipt printer is a real receipt printer) — so the same picture renders
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
  // Industries — Retail
  "grocery-supermarket": unsplash("1542838132-92c53300491e"),
  "convenience-store": unsplash("1604719312566-8912e9227c6a"),
  "fashion-apparel": unsplash("1441986300917-64674bd600d8"),
  "specialty-store": unsplash("1472851294608-062f824d29cc"),
  // Industries — Service & Enterprise
  service: unsplash("1521590832167-7bcbfaa6381f"),
  enterprise: unsplash("1586528116311-ad8dd3c8310d"),
  "personal-care": unsplash("1580618672591-eb180b1a973f"),
  healthcare: unsplash("1789108978116-2763682414a4"),
  warehouse: unsplash("1553413077-190dd305871c"),
  // Group-level photos (used by the industry outcomes section)
  fnb: unsplash("1753351050724-511764d227e3"),
  retail: unsplash("1604719312566-8912e9227c6a"),

  // Products / platform
  "point-of-sale": unsplash("1556740738-b6a63e27c4df"),
  payments: unsplash("1595079676339-1534801ad6cf"),
  inventory: unsplash("1586528116311-ad8dd3c8310d"),
  analytics: unsplash("1551288049-bebda4e38f71"),
  loyalty: unsplash("1556741533-6e6a62bd8b49"),
  "cafe-counter": unsplash("1778790891354-5daafd82a619"),
  staff: unsplash("1522071820081-009f0129c71c"),

  // Hardware
  "pos-terminal": unsplash("1586864030223-a918b07d357d"),
  "receipt-printer": unsplash("1787551415585-9c3e058c26c7"),
  "cash-drawer": unsplash("1780037190608-1d871be1fe41"),
  "payment-reader": unsplash("1595079835357-a94a13cab10c"),
  "customer-display": unsplash("1787209516537-a8e66a1b4360"),
  "hardware-hero": unsplash("1649424220505-bb300805f35a"),
  "hardware-bundle": unsplash("1778790508237-3c6cb00f152a"),

  // Hero POS demo product thumbnails (small, decorative — verified 200)
  "hero-coffee": unsplash("1495474472287-4d71bcdd2085", 200, 200),
  "hero-milktea": unsplash("1558857563-b371033873b8", 200, 200),
  "hero-ensaymada": unsplash("1509440159596-0249088772ff", 200, 200),
  "hero-ubecake": unsplash("1578985545062-69928b1d9587", 200, 200),

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
