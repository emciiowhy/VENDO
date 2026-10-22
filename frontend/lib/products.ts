import type { IconName } from "@/app/components/Icon";

/**
 * Content source for the marketing product pages under /products/[slug]. Each
 * entry maps a Products mega-menu link to a real, statically-rendered feature
 * page. The slug is the URL segment; keep it in sync with the hrefs in Nav.tsx.
 *
 * This is marketing copy, not app config — but the slugs are the single source
 * of truth that `generateStaticParams` and the nav both rely on, so add a
 * product here first, then point the nav link at `/products/<slug>`.
 *
 * Only list what the app actually ships today — every claim here should be
 * demonstrable in the product.
 */
export interface ProductFeature {
  icon: IconName;
  title: string;
  body: string;
}

export interface ProductPage {
  slug: string;
  /** Mega-menu group this product belongs to (shown as the hero eyebrow). */
  category: string;
  icon: IconName;
  name: string;
  /** Short hero headline. */
  tagline: string;
  /** One- or two-sentence hero intro. */
  intro: string;
  features: ProductFeature[];
}

export const PRODUCTS: ProductPage[] = [
  {
    slug: "point-of-sale",
    category: "Seamless Checkouts & Payments",
    icon: "pos",
    name: "Point of Sale (POS)",
    tagline: "A checkout your cashiers actually enjoy using.",
    intro:
      "Ring up sales in seconds on any device, with a fast touch layout, shift drawers that balance to the centavo, and an itemized, VAT-inclusive receipt out of the box.",
    features: [
      {
        icon: "bolt",
        title: "Built for speed",
        body: "A large-tile catalog and instant search by name or SKU keep the line moving even at peak rush.",
      },
      {
        icon: "wallet",
        title: "Cashier shifts & drawers",
        body: "X-Read and Z-Read with centavo-accurate variance, so every shift reconciles to the peso.",
      },
      {
        icon: "receipt",
        title: "Itemized receipts",
        body: "VAT-inclusive computation and your store's TIN and permit details print on every sale automatically.",
      },
    ],
  },
  {
    slug: "payments",
    category: "Seamless Checkouts & Payments",
    icon: "card",
    name: "Payments",
    tagline: "Accept cash and e-wallets — all in one tender screen.",
    intro:
      "Cash with automatic change, plus GCash, Maya, and QRPH scan-to-pay, are built into checkout, so your team never reaches for a second device.",
    features: [
      {
        icon: "card",
        title: "Cash & e-wallet tenders",
        body: "Cash, GCash, Maya, and QRPH settle into the same sale with a clear payment trail.",
      },
      {
        icon: "peso",
        title: "Change computed for you",
        body: "Enter the cash tendered and the system computes the change — and blocks a short payment.",
      },
      {
        icon: "shield",
        title: "Reconciliation-ready",
        body: "Each payment is stamped to the shift and sale, so your end-of-day totals always tie out.",
      },
    ],
  },
  {
    slug: "inventory-management",
    category: "Run your store smoothly",
    icon: "box",
    name: "Product Management",
    tagline: "Know exactly what you have, in real time.",
    intro:
      "Track stock to the unit, get low-stock alerts before you run out, and watch quantities move automatically as you sell and restock.",
    features: [
      {
        icon: "box",
        title: "Live stock levels",
        body: "Selling decrements stock instantly; receiving from suppliers adds it back — no manual counts.",
      },
      {
        icon: "bell",
        title: "Low-stock alerts",
        body: "Set thresholds per item and get notified the moment something needs reordering.",
      },
      {
        icon: "image",
        title: "Rich product catalog",
        body: "Photos, prices, SKUs, and VAT class in one place, shared across POS and reporting.",
      },
    ],
  },
  {
    slug: "reporting-and-analytics",
    category: "Run your store smoothly",
    icon: "chart",
    name: "Reporting & Analytics",
    tagline: "Decisions backed by your real numbers.",
    intro:
      "A live pulse on sales, best-sellers, and margins — plus exportable reports whenever you need to dig deeper.",
    features: [
      {
        icon: "pulse",
        title: "Live business pulse",
        body: "Revenue, order count, and trends update as sales happen — no spreadsheet wrangling.",
      },
      {
        icon: "trend",
        title: "Best-seller insight",
        body: "See which items drive your revenue and which to rethink, by day, week, or month.",
      },
      {
        icon: "download",
        title: "Export anything",
        body: "Download CSV reports for accounting, planning, or your own deeper analysis.",
      },
    ],
  },
  {
    slug: "employee-management",
    category: "Run your store smoothly",
    icon: "users",
    name: "Employee Management",
    tagline: "Staff, shifts, and payroll without the paperwork.",
    intro:
      "Manage your team, track daily attendance, and compute gross pay — monthly, daily, or hourly — straight from the clock.",
    features: [
      {
        icon: "users",
        title: "Your full roster",
        body: "Add employees, assign roles, and control exactly what each one can do in the system.",
      },
      {
        icon: "clock",
        title: "Attendance tracking",
        body: "Daily time records feed directly into pay, so hours are never re-keyed.",
      },
      {
        icon: "peso",
        title: "Payroll in a click",
        body: "Compute gross pay from attendance on monthly, daily, or hourly schemes.",
      },
    ],
  },
  {
    slug: "loyalty-program",
    category: "Customer Loyalty made easy",
    icon: "heart",
    name: "Loyalty Program",
    tagline: "Turn one-time buyers into regulars.",
    intro:
      "Customers earn points at checkout automatically, and you keep a complete purchase history for every one of them.",
    features: [
      {
        icon: "heart",
        title: "Points at checkout",
        body: "Attach a customer to any sale and points accrue automatically — no separate app.",
      },
      {
        icon: "users",
        title: "Customer profiles",
        body: "Every guest's full purchase history lives in one place, ready for personalized service.",
      },
      {
        icon: "tag",
        title: "Reward what matters",
        body: "Recognize your best customers and give them reasons to keep coming back.",
      },
    ],
  },
  {
    slug: "engage-crm",
    category: "Customer Loyalty made easy",
    icon: "pulse",
    name: "Customer CRM",
    tagline: "Know every regular by name.",
    intro:
      "Keep a customer directory built from your own sales: look anyone up at the counter and see their history and points on one profile.",
    features: [
      {
        icon: "users",
        title: "Unified customer view",
        body: "Every purchase and loyalty point on one profile, linked to the sales they made.",
      },
      {
        icon: "filter",
        title: "Fast lookup",
        body: "Search customers by name or contact and attach them to a sale in seconds.",
      },
      {
        icon: "chart",
        title: "Customer summary",
        body: "See your customer count and loyalty activity at a glance from the CRM dashboard.",
      },
    ],
  },
  // ---- Back office & operations (shipped ERP pillars) ---------------------
  {
    slug: "finance",
    category: "Back office & operations",
    icon: "peso",
    name: "Finance & P&L",
    tagline: "See your real profit, not just your sales.",
    intro:
      "Record expenses and watch a live profit-and-loss build from your actual POS revenue — no spreadsheets, no month-end scramble.",
    features: [
      {
        icon: "peso",
        title: "Expense tracking",
        body: "Log costs as they happen and keep every peso accounted for against your revenue.",
      },
      {
        icon: "chart",
        title: "Live P&L",
        body: "Revenue from the POS meets your expenses in a running profit-and-loss you can trust.",
      },
      {
        icon: "download",
        title: "Export for accounting",
        body: "Pull clean summaries for any period when it's time to file or hand off to your bookkeeper.",
      },
    ],
  },
];

const BY_SLUG = new Map(PRODUCTS.map((p) => [p.slug, p]));

/** Maps a product slug to a photo key in lib/marketingMedia.ts. */
const PRODUCT_PHOTO: Record<string, string> = {
  "point-of-sale": "point-of-sale",
  payments: "payments",
  "inventory-management": "inventory",
  "reporting-and-analytics": "analytics",
  "employee-management": "staff",
  "loyalty-program": "loyalty",
  "engage-crm": "loyalty",
  finance: "analytics",
};

export function productPhotoKey(slug: string): string {
  return PRODUCT_PHOTO[slug] ?? "analytics";
}

/** Declared order of the Products mega-menu / landing groups. */
export const PRODUCT_GROUPS: string[] = [
  "Seamless Checkouts & Payments",
  "Run your store smoothly",
  "Back office & operations",
  "Customer Loyalty made easy",
];

/** Products grouped by category, in PRODUCT_GROUPS order. */
export function productsByGroup(): { category: string; items: ProductPage[] }[] {
  return PRODUCT_GROUPS.map((category) => ({
    category,
    items: PRODUCTS.filter((p) => p.category === category),
  }));
}

export function getProduct(slug: string): ProductPage | undefined {
  return BY_SLUG.get(slug);
}

/** Up to N other products in the same category (then others) for "explore more". */
export function relatedProducts(slug: string, limit = 6): ProductPage[] {
  const self = BY_SLUG.get(slug);
  if (!self) return PRODUCTS.slice(0, limit);
  const same = PRODUCTS.filter((p) => p.category === self.category && p.slug !== slug);
  const others = PRODUCTS.filter((p) => p.category !== self.category && p.slug !== slug);
  return [...same, ...others].slice(0, limit);
}
