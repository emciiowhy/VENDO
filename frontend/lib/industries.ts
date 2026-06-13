import type { IconName } from "@/app/components/Icon";
import type { FeatureStatus } from "@/app/components/marketing/RoadmapBadge";

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
  status?: FeatureStatus;
}

export const INDUSTRY_GROUPS: IndustryGroup[] = [
  { key: "fnb", title: "F&B Business", icon: "store", blurb: "Cafés, restaurants, quick-serve and cloud kitchens." },
  { key: "retail", title: "Retail Business", icon: "cart", blurb: "Grocery, convenience, fashion and specialty shops." },
  { key: "service", title: "Service", icon: "heart", blurb: "Salons, clinics and pharmacies that sell time and goods." },
  { key: "enterprise", title: "Enterprise", icon: "building", blurb: "Multi-branch operators, franchises and distributors." },
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
      "From the first coffee at dawn to the last pastry at closing, VendoPOS keeps the line moving, tracks every ingredient, and reconciles the drawer to the peso.",
    highlights: [
      { icon: "bolt", title: "Rush-ready checkout", body: "A large-tile menu and one-tap modifiers keep orders flowing through the morning peak." },
      { icon: "factory", title: "Recipe-aware stock", body: "Selling a drink or loaf deducts its ingredients, so you always know what you can still make." },
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
    tagline: "From counter to kitchen, service that keeps up.",
    intro:
      "Fire orders straight to the kitchen, split bills cleanly, and keep tables turning — with stock and sales that tie out at the end of the night.",
    highlights: [
      { icon: "monitor", title: "Kitchen display", body: "Orders hit the line the moment they're rung up — legible, in sequence, no paper chits.", },
      { icon: "card", title: "Flexible payments", body: "Cash, card, GCash, Maya and QRPH at every table, settled into one sale." },
      { icon: "users", title: "Staff & shifts", body: "Track who served what, manage roles, and tie each sale to the cashier on duty." },
    ],
    outcomes: [
      "Cut ticket errors by sending orders straight to the kitchen",
      "Split, merge, and settle bills without re-keying",
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
      "When the queue is long and the menu is fixed, every second counts. VendoPOS rings orders in a tap and keeps the kitchen in lockstep with the counter.",
    highlights: [
      { icon: "bolt", title: "Tap-and-go ordering", body: "Combos and modifiers in one screen — no scrolling, no hunting." },
      { icon: "monitor", title: "Counter ↔ kitchen sync", body: "Confirmed orders flow to the kitchen display instantly so prep starts immediately." },
      { icon: "chart", title: "Live throughput", body: "Watch orders, average ticket, and peak times update as the rush happens." },
    ],
    outcomes: [
      "Move more orders per hour with a fixed-menu layout",
      "Keep the kitchen and counter perfectly in step",
      "Spot your busiest windows and staff for them",
    ],
  },
  {
    slug: "fine-dining",
    group: "fnb",
    icon: "heart",
    name: "Fine Dining & Specialty",
    tagline: "A refined service, handled behind the scenes.",
    intro:
      "Course-by-course service, attentive payments, and a quiet, polished checkout — with the back-office rigor your numbers deserve.",
    highlights: [
      { icon: "users", title: "Table & guest service", body: "Attach a guest to the sale, keep their history, and recognize your regulars." },
      { icon: "receipt", title: "Discreet, correct billing", body: "VAT-inclusive, itemized receipts that read cleanly for discerning guests." },
      { icon: "chart", title: "Margin clarity", body: "See cost and contribution per dish so the menu earns its place." },
    ],
    outcomes: [
      "Deliver attentive, personalized service from guest history",
      "Bill accurately with VAT handled for you",
      "Understand the true margin of every plate",
    ],
  },
  {
    slug: "cloud-kitchen",
    group: "fnb",
    icon: "truck",
    name: "Cloud Kitchen & Delivery Only",
    tagline: "Many brands, many channels, one kitchen.",
    intro:
      "Run delivery-first brands from a single back-of-house. Orders, stock, and reporting stay unified even when the storefront is virtual.",
    highlights: [
      { icon: "layers", title: "Multi-brand orders", body: "Keep separate menus and brands flowing into one shared kitchen view." },
      { icon: "monitor", title: "Order routing", body: "Tickets land on the kitchen display in the order they need to be cooked." },
      { icon: "truck", title: "Delivery in the flow", body: "Tie dispatch into the same pipeline as every other order.", },
    ],
    outcomes: [
      "Operate several delivery brands from one back-of-house",
      "Keep stock accurate across shared ingredients",
      "Report each brand's performance separately",
    ],
    status: "soon",
  },
  // ---- Retail -------------------------------------------------------------
  {
    slug: "grocery-supermarket",
    group: "retail",
    icon: "cart",
    name: "Grocery & Supermarket",
    tagline: "Thousands of SKUs, scanned and tracked.",
    intro:
      "Ring items by barcode, keep shelves stocked with low-stock alerts, and reconcile high-volume cash days without the headache.",
    highlights: [
      { icon: "search", title: "Scan-fast checkout", body: "Barcode scanning rings the right item every time, even at high volume." },
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
      { icon: "card", title: "Every tender", body: "Cash, card, and e-wallet QR at the counter, all into one sale." },
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
    tagline: "Variants, sizes, and styles — handled.",
    intro:
      "Track every size and color as its own unit, recognize repeat shoppers, and see which styles actually sell.",
    highlights: [
      { icon: "box", title: "Variant inventory", body: "Each size and color is its own tracked SKU, so you never oversell a fit." },
      { icon: "heart", title: "Customer profiles", body: "Keep purchase history and loyalty for the shoppers who come back." },
      { icon: "chart", title: "Style insight", body: "See top performers and slow movers to plan your next buy." },
    ],
    outcomes: [
      "Track stock by size and color, not just by style",
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
      { icon: "image", title: "Rich catalog", body: "Photos, variants, and notes so staff sell with confidence." },
      { icon: "users", title: "Personalized service", body: "Customer history at the counter for tailored recommendations." },
      { icon: "chart", title: "Know your niche", body: "Understand which lines and categories drive your store." },
    ],
    outcomes: [
      "Capture detailed product info your staff can sell from",
      "Build relationships with a full customer history",
      "See which categories truly carry the shop",
    ],
  },
  {
    slug: "online-store",
    group: "retail",
    icon: "cart",
    name: "Online Store / e-Commerce",
    tagline: "One catalog for your counter and your site.",
    intro:
      "Sell in-store and online from the same products and stock, so quantities never drift and you never oversell across channels.",
    highlights: [
      { icon: "refresh", title: "One inventory", body: "In-store and online draw from the same stock — change it once, everywhere updates." },
      { icon: "store", title: "Branded webstore", body: "A storefront that carries your brand, catalog, and prices." },
      { icon: "chart", title: "Total view", body: "See in-store and online performance together, not in scattered apps." },
    ],
    outcomes: [
      "Sell across channels without overselling a SKU",
      "Manage one catalog instead of several",
      "See your whole business in one report",
    ],
    status: "soon",
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
    slug: "multi-location",
    group: "enterprise",
    icon: "building",
    name: "Multi-location & Franchise",
    tagline: "Run every branch from one dashboard.",
    intro:
      "Compare branches side by side, manage staff and catalog centrally, and roll up sales across your whole operation.",
    photoKey: "enterprise",
    highlights: [
      { icon: "building", title: "One view, many branches", body: "Consolidated sales and stock so you see the whole business and each location at once." },
      { icon: "users", title: "Central staff control", body: "Provision cashiers and managers per branch with the right access from one place." },
      { icon: "chart", title: "Branch benchmarking", body: "Spot top and lagging locations instantly and act on what works." },
    ],
    outcomes: [
      "Manage catalog and staff across branches centrally",
      "Compare locations on one dashboard",
      "Roll up the whole operation in one report",
    ],
    status: "soon",
  },
  {
    slug: "warehouse-logistics",
    group: "enterprise",
    icon: "truck",
    name: "Warehouse & Distribution",
    tagline: "Move stock and orders without losing track.",
    intro:
      "Manage receiving, suppliers, and multi-location stock with a clear trail from purchase order to fulfillment.",
    photoKey: "warehouse",
    highlights: [
      { icon: "truck", title: "Receiving & suppliers", body: "Raise purchase orders and receive against them to restock automatically." },
      { icon: "box", title: "Multi-location stock", body: "See and manage inventory across every branch or warehouse from one place." },
      { icon: "refresh", title: "Order to fulfillment", body: "Follow each order through the pipeline so nothing slips between steps." },
    ],
    outcomes: [
      "Restock automatically from received purchase orders",
      "Track stock across every location",
      "Follow each order end to end",
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
