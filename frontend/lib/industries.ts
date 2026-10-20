import type { IconName } from "@/app/components/Icon";

/**
 * Content source for /industry and /industry/[slug].
 *
 * Industries are now grouped (F&B / Retail / Service / Enterprise) to mirror the
 * mega-menu in the reference design. Each entry is a real use-case page with its
 * own hero photo, three highlights, and outcome bullets — rendered by the
 * bespoke industry template, not the generic feature template.
 *
 * Slugs are the single source of truth shared with generateStaticParams, the
 * nav links, and the photo keys in `lib/marketingMedia.ts`.
 */
export interface IndustryGroup {
  key: string;
  /** Mega-menu / landing column heading, e.g. "F&B Business". */
  title: string;
  icon: IconName;
  blurb: string;
}

export interface IndustryHighlight {
  icon: IconName;
  title: string;
  body: string;
}

export interface Industry {
  slug: string;
  group: string;
  icon: IconName;
  /** Short menu label, e.g. "Cafés & Bakeries". */
  name: string;
  /** Hero headline. */
  tagline: string;
  /** Hero sub-paragraph. */
  intro: string;
  /** Photo key in lib/marketingMedia.ts (defaults to slug). */
  photoKey?: string;
  /** Three feature highlights shown under the hero. */
  highlights: IndustryHighlight[];
  /** "What you'll get" outcome bullets. */
  outcomes: string[];
}

export const INDUSTRY_GROUPS: IndustryGroup[] = [
  { key: "fnb", title: "F&B Business", icon: "store", blurb: "Cafés, restaurants, quick-serve and fine dining." },
  { key: "retail", title: "Retail Business", icon: "cart", blurb: "Grocery, convenience, fashion and specialty shops." },
  { key: "service", title: "Service", icon: "heart", blurb: "Salons, clinics and pharmacies that sell time and goods." },
  { key: "enterprise", title: "Enterprise", icon: "building", blurb: "Larger operations with bigger teams and deeper stock." },
];

export const INDUSTRIES: Industry[] = [
  // ---- F&B ----------------------------------------------------------------
  {
    slug: "cafes-bakeries",
    group: "fnb",
    icon: "store",
    name: "Cafés & Bakeries",
    tagline: "Run your café and bakery on one system.",
    intro:
      "From the first coffee at dawn to the last pastry at closing, VendoPOS keeps the line moving, tracks stock on every item, and reconciles the drawer to the peso.",
    highlights: [
      { icon: "bolt", title: "Rush-ready checkout", body: "A large-tile menu and instant search keep orders flowing through the morning peak." },
      { icon: "box", title: "Low-stock alerts", body: "Every sale deducts stock automatically, and you are alerted before a bestseller runs out." },
      { icon: "wallet", title: "Drawer that reconciles", body: "X-Read and Z-Read close every shift to the centavo — no end-of-day guessing." },
    ],
    outcomes: [
      "Serve customers faster at peak hours with a touch-first layout",
      "See which items sell and which to retire, by day or week",
      "BIR-ready receipts on every cup and pastry, automatically",
    ],
  },
  {
    slug: "restaurants",
    group: "fnb",
    icon: "store",
    name: "Restaurants",
    tagline: "A counter that keeps up with service.",
    intro:
      "Ring orders fast, take cash or e-wallet payments, and keep tables turning — with stock and sales that tie out at the end of the night.",
    highlights: [
      { icon: "receipt", title: "Compliant receipts", body: "VAT-inclusive, BIR-ready receipts printed straight from checkout." },
      { icon: "card", title: "Flexible payments", body: "Cash, GCash, Maya and QRPH at the counter, settled into one sale." },
      { icon: "users", title: "Staff & shifts", body: "Manage roles and tie each sale to the cashier shift on duty." },
    ],
    outcomes: [
      "Ring orders quickly with a touch-first layout",
      "Close every shift with a drawer that reconciles",
      "Know your best and worst sellers every service",
    ],
  },
  {
    slug: "quick-serve",
    group: "fnb",
    icon: "bolt",
    name: "Quick Serve",
    tagline: "Built for volume, tuned for speed.",
    intro:
      "When the queue is long and the menu is fixed, every second counts. VendoPOS rings orders in a tap and keeps sales and stock current as the rush happens.",
    highlights: [
      { icon: "bolt", title: "Tap-and-go ordering", body: "Your whole menu on one screen of large tiles — no scrolling, no hunting." },
      { icon: "monitor", title: "Customer display", body: "A second screen shows customers their order and total as it's rung up." },
      { icon: "chart", title: "Live sales", body: "Watch revenue, order count, and top sellers update as the rush happens." },
    ],
    outcomes: [
      "Move more orders per hour with a fixed-menu layout",
      "Show customers their total before they pay",
      "See your sales for the day as they happen",
    ],
  },
  {
    slug: "fine-dining",
    group: "fnb",
    icon: "heart",
    name: "Fine Dining & Specialty",
    tagline: "A refined service, handled behind the scenes.",
    intro:
      "Attentive payments and a quiet, polished checkout — with the back-office rigor your numbers deserve.",
    highlights: [
      { icon: "users", title: "Guest profiles", body: "Attach a guest to the sale, keep their history, and recognize your regulars." },
      { icon: "receipt", title: "Discreet, correct billing", body: "VAT-inclusive, itemized receipts that read cleanly for discerning guests." },
      { icon: "chart", title: "Profit clarity", body: "Record expenses against POS revenue for a live profit-and-loss." },
    ],
    outcomes: [
      "Deliver attentive, personalized service from guest history",
      "Bill accurately with VAT handled for you",
      "See your real profit, not just your sales",
    ],
  },
  // ---- Retail -------------------------------------------------------------
  {
    slug: "grocery-supermarket",
    group: "retail",
    icon: "cart",
    name: "Grocery & Supermarket",
    tagline: "Thousands of SKUs, tracked to the unit.",
    intro:
      "Find any item by name or SKU, keep shelves stocked with low-stock alerts, and reconcile high-volume cash days without the headache.",
    highlights: [
      { icon: "search", title: "Fast item lookup", body: "Search by name or SKU to ring the right item, even at high volume." },
      { icon: "box", title: "Unit-level inventory", body: "Stock moves as you sell and receive — no manual counts to keep up." },
      { icon: "bell", title: "Low-stock alerts", body: "Get notified before a fast mover runs out so reorders happen in time." },
    ],
    outcomes: [
      "Check out long baskets quickly and accurately",
      "Keep thousands of SKUs in sync automatically",
      "Reconcile busy cash days down to the peso",
    ],
  },
  {
    slug: "convenience-store",
    group: "retail",
    icon: "store",
    name: "Convenience Store",
    tagline: "Always open, always reconciled.",
    intro:
      "Fast single-item sales, e-wallet payments, and shift hand-offs that tie out — built for stores that never really close.",
    highlights: [
      { icon: "bolt", title: "One-tap singles", body: "The items people grab most, front and center for instant ringing." },
      { icon: "card", title: "Every tender", body: "Cash and GCash, Maya, or QRPH at the counter, all into one sale." },
      { icon: "wallet", title: "Clean shift hand-offs", body: "Each cashier's drawer opens and closes against their own shift." },
    ],
    outcomes: [
      "Ring high-frequency single items in a tap",
      "Hand off shifts with drawers that reconcile",
      "Track stock on impulse buys and essentials alike",
    ],
  },
  {
    slug: "fashion-apparel",
    group: "retail",
    icon: "tag",
    name: "Fashion & Apparel",
    tagline: "Every style tracked, every shopper remembered.",
    intro:
      "Give each item its own SKU, recognize repeat shoppers, and see which styles actually sell.",
    highlights: [
      { icon: "box", title: "SKU-level inventory", body: "Each item is its own tracked SKU with live stock, so you never oversell." },
      { icon: "heart", title: "Customer profiles", body: "Keep purchase history and loyalty for the shoppers who come back." },
      { icon: "chart", title: "Style insight", body: "See top performers and slow movers to plan your next buy." },
    ],
    outcomes: [
      "Track stock item by item, SKU by SKU",
      "Reward repeat shoppers automatically",
      "Buy smarter with real sell-through data",
    ],
  },
  {
    slug: "specialty-store",
    group: "retail",
    icon: "layers",
    name: "Specialty Store",
    tagline: "For shops where every item has a story.",
    intro:
      "Rich product detail, knowledgeable service, and a catalog that captures what makes each item special — from hobby shops to boutiques.",
    highlights: [
      { icon: "image", title: "Rich catalog", body: "Photos, prices, and categories so staff sell with confidence." },
      { icon: "users", title: "Personalized service", body: "Customer history at the counter for tailored recommendations." },
      { icon: "chart", title: "Know your niche", body: "Understand which lines and categories drive your store." },
    ],
    outcomes: [
      "Capture detailed product info your staff can sell from",
      "Build relationships with a full customer history",
      "See which categories truly carry the shop",
    ],
  },
  // ---- Service ------------------------------------------------------------
  {
    slug: "personal-care",
    group: "service",
    icon: "heart",
    name: "Personal Care & Salons",
    tagline: "Sell services and products side by side.",
    intro:
      "Ring treatments and retail in the same sale, keep a full client history, and reward your regulars — built for salons, spas, and clinics.",
    photoKey: "personal-care",
    highlights: [
      { icon: "heart", title: "Client profiles & loyalty", body: "Every client's visit history and points in one place for personal service." },
      { icon: "tag", title: "Services + retail", body: "Charge a treatment and the products that go with it on one receipt." },
      { icon: "users", title: "Staff tracking", body: "Track who served whom and manage your team's roles and attendance." },
    ],
    outcomes: [
      "Bill services and retail together cleanly",
      "Keep a complete history for every client",
      "Reward loyal regulars automatically",
    ],
  },
  {
    slug: "healthcare",
    group: "service",
    icon: "shield",
    name: "Healthcare & Pharmacies",
    tagline: "Accurate stock, compliant receipts.",
    intro:
      "Track every unit with low-stock alerts and issue BIR-ready receipts your customers can trust — for pharmacies and clinics.",
    photoKey: "healthcare",
    highlights: [
      { icon: "box", title: "Unit-level inventory", body: "Know exactly what's on the shelf as items sell and restocks arrive." },
      { icon: "shield", title: "Compliant receipts", body: "VAT-inclusive, sequentially numbered receipts on every sale, automatically." },
      { icon: "bell", title: "Low-stock alerts", body: "Get notified before a fast-moving item runs out so you reorder in time." },
    ],
    outcomes: [
      "Keep precise, unit-level stock counts",
      "Issue compliant receipts without thinking about it",
      "Reorder in time with proactive alerts",
    ],
  },
  // ---- Enterprise ---------------------------------------------------------
  {
    slug: "warehouse-logistics",
    group: "enterprise",
    icon: "truck",
    name: "Warehouse & Distribution",
    tagline: "Move stock and orders without losing track.",
    intro:
      "Keep a clear trail on every unit — sales, restocks and count corrections — and run payroll for a bigger team.",
    photoKey: "warehouse",
    highlights: [
      { icon: "bell", title: "Low-stock alerts", body: "Set a floor per product and get alerted before stock runs out." },
      { icon: "box", title: "Stock ledger", body: "Every sale, restock, and adjustment is logged, so stock levels always have a trail." },
      { icon: "users", title: "People & Payroll", body: "Attendance from Shift In/Out and owner-approved payroll for the whole team." },
    ],
    outcomes: [
      "Restock in seconds with a logged stock adjustment",
      "Get reorder suggestions before items run out",
      "Pay your team from real attendance, not guesswork",
    ],
  },
];

const BY_SLUG = new Map(INDUSTRIES.map((i) => [i.slug, i]));

export function getIndustry(slug: string): Industry | undefined {
  return BY_SLUG.get(slug);
}

/** Industries in the same group (for the "related" rail), excluding `slug`. */
export function relatedIndustries(slug: string, limit = 4): Industry[] {
  const self = BY_SLUG.get(slug);
  if (!self) return [];
  const sameGroup = INDUSTRIES.filter((i) => i.group === self.group && i.slug !== slug);
  const others = INDUSTRIES.filter((i) => i.group !== self.group && i.slug !== slug);
  return [...sameGroup, ...others].slice(0, limit);
}

/** Group definition + its industries, in declared order. */
export function industriesByGroup(): { group: IndustryGroup; items: Industry[] }[] {
  return INDUSTRY_GROUPS.map((group) => ({
    group,
    items: INDUSTRIES.filter((i) => i.group === group.key),
  }));
}
