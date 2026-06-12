import { collection, type MarketingEntry } from "./marketing";

/**
 * Content source for /industry/[slug] — one page per industry the Products
 * mega-menu's "Industry" group links to. Slugs are the single source of truth
 * shared with generateStaticParams and the nav links.
 */
export const INDUSTRIES: MarketingEntry[] = [
  {
    slug: "retail-ecommerce",
    eyebrow: "Industry",
    icon: "cart",
    name: "Retail & E-commerce",
    tagline: "One system for your shelves and your online store.",
    intro:
      "Sell in-store and online from a single catalog and inventory, with stock that never drifts out of sync.",
    cards: [
      {
        icon: "box",
        title: "Unified inventory",
        body: "In-store and online draw from the same stock, so you never oversell a SKU.",
      },
      {
        icon: "cart",
        title: "Sell everywhere",
        body: "Counter, webstore, and marketplaces share one product catalog and pricing.",
      },
      {
        icon: "chart",
        title: "Know your bestsellers",
        body: "See what moves and what stalls across every channel in one report.",
      },
    ],
  },
  {
    slug: "food-and-beverage",
    eyebrow: "Industry",
    icon: "store",
    name: "Food & Beverage (F&B)",
    tagline: "From counter to kitchen, service that keeps up.",
    intro:
      "Fast checkout, QR ordering, and a kitchen display built for the rush — with recipes that track ingredient stock as you sell.",
    cards: [
      {
        icon: "pos",
        title: "Rush-ready POS",
        body: "A large-tile menu and one-tap modifiers keep the line moving at peak hours.",
      },
      {
        icon: "monitor",
        title: "Kitchen display",
        body: "Orders hit the line the moment they're rung up — legible and in sequence.",
      },
      {
        icon: "factory",
        title: "Recipe-aware stock",
        body: "Selling a dish deducts its ingredients, so you always know what you can still serve.",
      },
    ],
  },
  {
    slug: "hospitality-lodging",
    eyebrow: "Industry",
    icon: "building",
    name: "Hospitality & Lodging",
    tagline: "Charge every outlet, settle in one place.",
    intro:
      "Run your restaurant, bar, and shop on one platform with guest-friendly payments and clear, property-wide reporting.",
    cards: [
      {
        icon: "building",
        title: "Every outlet, one system",
        body: "Multiple revenue centers managed and reported together, not in separate tools.",
      },
      {
        icon: "card",
        title: "Flexible payments",
        body: "Cash, card, and e-wallet QR at every point of sale across the property.",
      },
      {
        icon: "chart",
        title: "Property-wide reporting",
        body: "Roll up sales across outlets to see the whole operation at a glance.",
      },
    ],
  },
  {
    slug: "personal-care-services",
    eyebrow: "Industry",
    icon: "heart",
    name: "Personal Care & Services",
    tagline: "Sell products and services side by side.",
    intro:
      "Ring up treatments and retail in the same sale, keep a full customer history, and reward your regulars automatically.",
    cards: [
      {
        icon: "heart",
        title: "Customer profiles & loyalty",
        body: "Every client's visit history and points in one place for personalized service.",
      },
      {
        icon: "tag",
        title: "Services + retail in one sale",
        body: "Charge a treatment and the products that go with it on a single receipt.",
      },
      {
        icon: "users",
        title: "Staff management",
        body: "Track who served whom and manage your team's roles and attendance.",
      },
    ],
  },
  {
    slug: "healthcare-pharmacies",
    eyebrow: "Industry",
    icon: "shield",
    name: "Healthcare & Pharmacies",
    tagline: "Accurate stock, compliant receipts.",
    intro:
      "Track every unit with low-stock alerts and issue BIR-ready receipts your customers can trust.",
    cards: [
      {
        icon: "box",
        title: "Unit-level inventory",
        body: "Know exactly what's on the shelf as items sell and restocks arrive.",
      },
      {
        icon: "shield",
        title: "BIR-compliant receipts",
        body: "VAT-inclusive, sequentially numbered receipts on every sale, automatically.",
      },
      {
        icon: "bell",
        title: "Low-stock alerts",
        body: "Get notified before a fast-moving item runs out so you reorder in time.",
      },
    ],
  },
  {
    slug: "warehouse-logistics",
    eyebrow: "Industry",
    icon: "truck",
    name: "Warehouse, Distribution & Logistics",
    tagline: "Move stock and orders without losing track.",
    intro:
      "Manage receiving, suppliers, and multi-location stock with a clear trail from purchase order to fulfillment.",
    cards: [
      {
        icon: "truck",
        title: "Receiving & suppliers",
        body: "Raise purchase orders and receive against them to restock automatically.",
      },
      {
        icon: "box",
        title: "Multi-location stock",
        body: "See and manage inventory across every branch or warehouse from one place.",
      },
      {
        icon: "refresh",
        title: "Order to fulfillment",
        body: "Follow each order through the pipeline so nothing slips between steps.",
      },
    ],
  },
];

export const industries = collection(INDUSTRIES);
