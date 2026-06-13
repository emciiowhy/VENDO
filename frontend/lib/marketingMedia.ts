/**
 * Photography for the marketing pages.
 *
 * The reference designs use real photos, but the repo ships no image assets and
 * we don't want a build to depend on hand-picked CDN IDs that can 404. So each
 * topic resolves to a deterministic, keyword-matched real photo from LoremFlickr
 * (Creative-Commons Flickr images). `lock` pins a stable image per topic so the
 * same picture renders on every build/visit. <MarketingPhoto> degrades to an
 * on-brand gradient if any URL fails, so nothing ever shows a broken image.
 *
 * To use your own art later, replace a value here with a real URL (or a
 * `/public` path) — every page reads its photos through this one map.
 */
function flickr(keywords: string, lock: number, w = 1280, h = 853): string {
  return `https://loremflickr.com/${w}/${h}/${keywords}?lock=${lock}`;
}

export const MEDIA = {
  // Industries — F&B
  "cafes-bakeries": flickr("coffee,cafe", 21),
  restaurants: flickr("restaurant,interior", 22),
  "quick-serve": flickr("fastfood,counter", 23),
  "fine-dining": flickr("fine,dining,plate", 24),
  "cloud-kitchen": flickr("kitchen,chef", 25),
  // Industries — Retail
  "grocery-supermarket": flickr("grocery,supermarket", 31),
  "convenience-store": flickr("convenience,store", 32),
  "fashion-apparel": flickr("clothing,boutique", 33),
  "specialty-store": flickr("shop,retail", 34),
  "online-store": flickr("online,shopping", 35),
  // Industries — Service & Enterprise
  service: flickr("salon,spa", 41),
  enterprise: flickr("office,corporate", 42),
  "personal-care": flickr("salon,beauty", 43),
  healthcare: flickr("pharmacy,health", 44),
  warehouse: flickr("warehouse,logistics", 45),
  // Group-level photos (used by the industry outcomes section)
  fnb: flickr("restaurant,cafe", 46),
  retail: flickr("retail,store", 47),

  // Products / platform
  "point-of-sale": flickr("cashier,checkout", 51),
  payments: flickr("payment,card,terminal", 52),
  inventory: flickr("warehouse,inventory", 53),
  analytics: flickr("business,laptop,charts", 54),
  loyalty: flickr("shopping,customer", 55),
  online: flickr("ecommerce,laptop", 56),
  kitchen: flickr("kitchen,order", 57),
  staff: flickr("staff,team,work", 58),

  // Hardware
  "pos-terminal": flickr("cashier,checkout", 61),
  "receipt-printer": flickr("receipt,printer", 62),
  "barcode-scanner": flickr("barcode,scanner", 63),
  "cash-drawer": flickr("money,cash,register", 64),
  "payment-reader": flickr("credit,card,payment", 65),
  "customer-display": flickr("computer,screen", 66),
  "kitchen-display": flickr("kitchen,screen", 67),
  "label-printer": flickr("label,sticker", 68),
  "hardware-hero": flickr("tablet,computer", 69),
  "hardware-bundle": flickr("retail,counter", 70),

  // Company
  team: flickr("team,office,people", 81),
  story: flickr("small,business,owner", 82),
  careers: flickr("coworkers,office", 83),
  contact: flickr("customer,support", 84),
  founders: flickr("startup,meeting", 85),
} as const;

export type MediaKey = keyof typeof MEDIA;

/** Resolve a media key to a URL, returning null for unknown keys (→ fallback). */
export function media(key: string): string | null {
  return (MEDIA as Record<string, string>)[key] ?? null;
}

/** Rotating "real business" photos for the blog/story cards. */
const BLOG_PHOTOS: string[] = [
  flickr("small,business,owner", 91),
  flickr("filipino,store,owner", 92),
  flickr("cafe,barista", 93),
  flickr("market,vendor", 94),
  flickr("entrepreneur,laptop", 95),
  flickr("shop,counter,smile", 96),
];

/** A stable story photo for the nth post (deterministic, cycles the set). */
export function blogPhoto(index: number): string {
  return BLOG_PHOTOS[index % BLOG_PHOTOS.length];
}
