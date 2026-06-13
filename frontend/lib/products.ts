import type { IconName } from "@/app/components/Icon";
import type { FeatureStatus } from "@/app/components/marketing/RoadmapBadge";

/**
 * Content source for the marketing product pages under /products/[slug]. Each
 * entry maps a Products mega-menu link to a real, statically-rendered feature
 * page. The slug is the URL segment; keep it in sync with the hrefs in Nav.tsx.
 *
 * This is marketing copy, not app config — but the slugs are the single source
 * of truth that `generateStaticParams` and the nav both rely on, so add a
 * product here first, then point the nav link at `/products/<slug>`.
 *
 * Whether a product is actually shipped is tracked by SHIPPED below (a single
 * list), so pages and menus can flag what's "coming soon" without sprinkling a
 * status on every entry.
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
      "Ring up sales in seconds on any device, with a fast touch layout, offline-safe drawers, and a receipt that's BIR-ready out of the box.",
    features: [
      {
        icon: "bolt",
        title: "Built for speed",
        body: "A large-tile catalog, instant search, and one-tap modifiers keep the line moving even at peak rush.",
      },
      {
        icon: "wallet",
        title: "Cashier shifts & drawers",
        body: "X-Read and Z-Read with centavo-accurate variance, so every shift reconciles to the peso.",
      },
      {
        icon: "receipt",
        title: "Compliant receipts",
        body: "VAT-inclusive computation and BIR reference details print on every sale automatically.",
      },
    ],
  },
  {
    slug: "payments",
    category: "Seamless Checkouts & Payments",
    icon: "card",
    name: "Payments",
    tagline: "Accept cash, card, and e-wallets — all in one tender screen.",
    intro:
      "Split tenders, scan-to-pay QR, and change calculation are built into checkout, so your team never reaches for a second device.",
    features: [
      {
        icon: "card",
        title: "Every tender type",
        body: "Cash, card, GCash, Maya, and bank QR settle into the same sale with a clear payment trail.",
      },
      {
        icon: "peso",
        title: "Split & partial payments",
        body: "Take multiple tenders on one bill and let the system compute change and balances for you.",
      },
      {
        icon: "shield",
        title: "Reconciliation-ready",
        body: "Each payment is stamped to the shift and sale, so your end-of-day totals always tie out.",
      },
    ],
  },
  {
    slug: "qr-order-and-pay",
    category: "Run your store smoothly",
    icon: "grid",
    name: "QR Order & Pay",
    tagline: "Let guests order from the table — no app, no queue.",
    intro:
      "Customers scan a QR, browse your live menu, and pay from their phone. Orders land straight on your POS and kitchen screen.",
    features: [
      {
        icon: "grid",
        title: "Scan to order",
        body: "A table QR opens your live catalog instantly — prices and availability always match the POS.",
      },
      {
        icon: "card",
        title: "Pay from the phone",
        body: "Guests settle by e-wallet or card, cutting wait time and freeing your cashier.",
      },
      {
        icon: "bolt",
        title: "Straight to the line",
        body: "Confirmed orders flow into the kitchen display the moment they're placed.",
      },
    ],
  },
  {
    slug: "bir-accreditation",
    category: "Run your store smoothly",
    icon: "shield",
    name: "BIR Accreditation",
    tagline: "Stay compliant without thinking about it.",
    intro:
      "Collision-free invoice serials, VAT-inclusive math, and audit-ready exports keep you aligned with BIR requirements as you grow.",
    features: [
      {
        icon: "file",
        title: "Sequential invoicing",
        body: "Every sale gets a unique, gap-free serial — even across busy multi-cashier days.",
      },
      {
        icon: "receipt",
        title: "VAT done right",
        body: "12% VAT-inclusive computation is applied and itemized on each receipt automatically.",
      },
      {
        icon: "download",
        title: "Audit-ready exports",
        body: "Pull compliant CSV summaries for any period when it's time to file or get inspected.",
      },
    ],
  },
  {
    slug: "inventory-management",
    category: "Run your store smoothly",
    icon: "box",
    name: "Inventory Management",
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
        body: "Photos, prices, and variants in one place, shared across POS, online, and reporting.",
      },
    ],
  },
  {
    slug: "kitchen-display-system",
    category: "Run your store smoothly",
    icon: "monitor",
    name: "Kitchen Display System (KDS)",
    tagline: "Send orders to the kitchen, not paper tickets.",
    intro:
      "Tickets appear on a clean kitchen screen the instant they're rung up, so your line cooks the right items in the right order.",
    features: [
      {
        icon: "monitor",
        title: "Real-time tickets",
        body: "Orders from POS and QR ordering surface immediately, with modifiers clearly listed.",
      },
      {
        icon: "clock",
        title: "Pace the line",
        body: "Bump completed items and keep an eye on prep times to keep service moving.",
      },
      {
        icon: "check",
        title: "Fewer mistakes",
        body: "No more lost or misread paper chits — every order is legible and accounted for.",
      },
    ],
  },
  {
    slug: "multi-location-management",
    category: "Run your store smoothly",
    icon: "building",
    name: "Multi Location Management",
    tagline: "Run every branch from one dashboard.",
    intro:
      "Compare branches side by side, manage staff and catalog centrally, and roll up sales across your whole operation.",
    features: [
      {
        icon: "building",
        title: "One view, many branches",
        body: "Consolidated sales and stock so you see the whole business and each location at once.",
      },
      {
        icon: "users",
        title: "Central staff control",
        body: "Provision cashiers and managers per branch with the right access from one place.",
      },
      {
        icon: "chart",
        title: "Branch benchmarking",
        body: "Spot top and lagging locations instantly and act on what's actually working.",
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
    slug: "membership",
    category: "Customer Loyalty made easy",
    icon: "users",
    name: "Membership",
    tagline: "Build a base of paying, repeat members.",
    intro:
      "Offer tiers and member pricing tied to each customer profile, so perks apply automatically at the counter.",
    features: [
      {
        icon: "users",
        title: "Member tiers",
        body: "Group customers into tiers and let the right benefits follow them to every checkout.",
      },
      {
        icon: "tag",
        title: "Member pricing",
        body: "Special prices and perks apply automatically once a member is attached to the sale.",
      },
      {
        icon: "heart",
        title: "Stronger retention",
        body: "Give regulars a reason to stay enrolled and keep choosing you over the competition.",
      },
    ],
  },
  {
    slug: "engage-crm",
    category: "Customer Loyalty made easy",
    icon: "pulse",
    name: "Engage (CRM / Marketing Automation)",
    tagline: "Reach the right customers at the right moment.",
    intro:
      "Your sales data becomes a CRM: segment customers by behavior and reach them with timely, relevant campaigns.",
    features: [
      {
        icon: "users",
        title: "Unified customer view",
        body: "Every purchase, point, and visit on one profile — the foundation for real engagement.",
      },
      {
        icon: "filter",
        title: "Smart segments",
        body: "Group customers by spend, recency, or favorites to target who matters most.",
      },
      {
        icon: "bolt",
        title: "Automated outreach",
        body: "Trigger the right message off real behavior instead of guessing and blasting everyone.",
      },
    ],
  },
  {
    slug: "promotions",
    category: "Customer Loyalty made easy",
    icon: "tag",
    name: "Customisable Promotions",
    tagline: "Run the promo you want, the way you want.",
    intro:
      "Discounts, bundles, and limited-time offers you control — applied cleanly at checkout and tracked in reporting.",
    features: [
      {
        icon: "tag",
        title: "Flexible discounts",
        body: "Percentage, fixed-amount, or bundle deals configured to fit your campaign.",
      },
      {
        icon: "clock",
        title: "Time-boxed offers",
        body: "Schedule limited-time promos that switch on and off without manual fuss.",
      },
      {
        icon: "chart",
        title: "Measure the lift",
        body: "See how each promo performed in reporting so you double down on what works.",
      },
    ],
  },
  {
    slug: "online-ordering",
    category: "Reach more customers and sell online",
    icon: "cart",
    name: "Online Ordering",
    tagline: "Take orders online — synced with your store.",
    intro:
      "Let customers order from anywhere while your menu, prices, and stock stay perfectly in sync with the POS.",
    features: [
      {
        icon: "cart",
        title: "Order from anywhere",
        body: "A live online menu that always reflects your real catalog and availability.",
      },
      {
        icon: "refresh",
        title: "Always in sync",
        body: "One catalog powers both your counter and online — change it once, it updates everywhere.",
      },
      {
        icon: "bolt",
        title: "Straight to fulfillment",
        body: "Online orders flow into the same pipeline your team already works from.",
      },
    ],
  },
  {
    slug: "webstore",
    category: "Reach more customers and sell online",
    icon: "store",
    name: "Webstore",
    tagline: "Your own branded online shop.",
    intro:
      "Stand up a storefront that carries your brand, your catalog, and your prices — no separate inventory to maintain.",
    features: [
      {
        icon: "store",
        title: "Branded storefront",
        body: "A clean shop that looks like you, powered by the catalog you already manage.",
      },
      {
        icon: "box",
        title: "One inventory",
        body: "Online and in-store share the same stock, so you never oversell an item.",
      },
      {
        icon: "card",
        title: "Built-in checkout",
        body: "Customers pay online with the same tenders your business already accepts.",
      },
    ],
  },
  {
    slug: "marketplace-integration",
    category: "Reach more customers and sell online",
    icon: "layers",
    name: "Marketplace Integration",
    tagline: "Sell on the big platforms, manage it here.",
    intro:
      "Connect the marketplaces your customers already use and keep listings, stock, and orders centralized in VendoPOS.",
    features: [
      {
        icon: "layers",
        title: "Channels in one place",
        body: "Bring marketplace orders into the same dashboard as your in-store sales.",
      },
      {
        icon: "refresh",
        title: "Synced listings & stock",
        body: "Keep prices and quantities aligned across channels to avoid overselling.",
      },
      {
        icon: "chart",
        title: "True total view",
        body: "See performance across every channel together, not in scattered apps.",
      },
    ],
  },
  {
    slug: "takeaway-and-pickup",
    category: "Reach more customers and sell online",
    icon: "cart",
    name: "Takeaway & Pickup",
    tagline: "Smooth pickup, happier customers.",
    intro:
      "Let customers order ahead and collect on time, with pickup orders organized right alongside your counter sales.",
    features: [
      {
        icon: "clock",
        title: "Order ahead",
        body: "Customers place and pay early, then pick up without waiting in line.",
      },
      {
        icon: "monitor",
        title: "Organized prep",
        body: "Pickup tickets reach the kitchen so orders are ready exactly when promised.",
      },
      {
        icon: "check",
        title: "Clean handoff",
        body: "Track each pickup from order to collection so nothing gets missed.",
      },
    ],
  },
  {
    slug: "integrated-logistics",
    category: "Reach more customers and sell online",
    icon: "truck",
    name: "Integrated Logistics",
    tagline: "From order to doorstep, connected.",
    intro:
      "Tie delivery into your order flow so dispatch, tracking, and fulfillment all live in one place.",
    features: [
      {
        icon: "truck",
        title: "Delivery in the flow",
        body: "Delivery orders move through the same pipeline as the rest of your sales.",
      },
      {
        icon: "refresh",
        title: "Status at a glance",
        body: "Follow each order from confirmed to delivered without leaving the dashboard.",
      },
      {
        icon: "users",
        title: "Customer kept informed",
        body: "Tie delivery to the customer profile so service and history stay connected.",
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
  {
    slug: "procurement",
    category: "Back office & operations",
    icon: "truck",
    name: "Procurement",
    tagline: "From purchase order to restocked shelf.",
    intro:
      "Manage suppliers, raise purchase orders, and receive against them so inventory restocks itself the moment goods arrive.",
    features: [
      {
        icon: "users",
        title: "Supplier directory",
        body: "Keep your vendors, terms, and contacts in one place, tied to what you buy from each.",
      },
      {
        icon: "file",
        title: "Purchase orders",
        body: "Raise POs for what you need and track them from sent to received.",
      },
      {
        icon: "refresh",
        title: "Receiving restocks stock",
        body: "Receiving a PO adds the goods straight into inventory — no double entry.",
      },
    ],
  },
  {
    slug: "manufacturing",
    category: "Back office & operations",
    icon: "factory",
    name: "Manufacturing",
    tagline: "Turn ingredients into finished goods, tracked.",
    intro:
      "Define recipes and bills of materials, then run production that consumes component stock and restocks the finished product automatically.",
    features: [
      {
        icon: "layers",
        title: "Recipes & BOM",
        body: "Define what goes into each finished good so production always knows its inputs.",
      },
      {
        icon: "factory",
        title: "Production runs",
        body: "Run a batch and components are deducted while finished goods are added — in one step.",
      },
      {
        icon: "box",
        title: "Accurate component stock",
        body: "Always know what raw materials you have left and what you can still produce.",
      },
    ],
  },
];

const BY_SLUG = new Map(PRODUCTS.map((p) => [p.slug, p]));

/**
 * Products that are actually shipped in the app today. Everything else renders
 * with a "Coming soon" badge so the marketing site stays honest while still
 * showing the full vision.
 */
const SHIPPED = new Set<string>([
  "point-of-sale",
  "payments",
  "bir-accreditation",
  "inventory-management",
  "reporting-and-analytics",
  "employee-management",
  "loyalty-program",
  "engage-crm",
  "finance",
  "procurement",
  "manufacturing",
]);

export function productStatus(slug: string): FeatureStatus {
  return SHIPPED.has(slug) ? "live" : "soon";
}

/** Maps a product slug to a photo key in lib/marketingMedia.ts. */
const PRODUCT_PHOTO: Record<string, string> = {
  "point-of-sale": "point-of-sale",
  payments: "payments",
  "qr-order-and-pay": "kitchen",
  "bir-accreditation": "payments",
  "inventory-management": "inventory",
  "kitchen-display-system": "kitchen",
  "multi-location-management": "enterprise",
  "reporting-and-analytics": "analytics",
  "employee-management": "staff",
  "loyalty-program": "loyalty",
  membership: "loyalty",
  "engage-crm": "loyalty",
  promotions: "loyalty",
  "online-ordering": "online",
  webstore: "online",
  "marketplace-integration": "online",
  "takeaway-and-pickup": "kitchen",
  "integrated-logistics": "warehouse",
  finance: "analytics",
  procurement: "warehouse",
  manufacturing: "inventory",
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
  "Reach more customers and sell online",
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
