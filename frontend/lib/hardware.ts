import type { IconName } from "@/app/components/Icon";
import { collection, type MarketingEntry } from "./marketing";

/**
 * Content source for /hardware/[slug] — one page per piece of POS hardware in
 * the nav's "Hardware" menu. Slugs are the single source of truth shared with
 * generateStaticParams and the nav links.
 */
export const HARDWARE: MarketingEntry[] = [
  {
    slug: "pos-terminal",
    eyebrow: "Hardware",
    icon: "pos",
    name: "POS Terminal & Tablet Stand",
    tagline: "A sturdy home for your checkout.",
    intro:
      "A tablet stand and terminal setup that anchors your counter and runs VendoPOS smoothly all day.",
    cards: [
      { icon: "pos", title: "Counter-ready", body: "A stable, professional checkout station built for daily use." },
      { icon: "bolt", title: "Fast & reliable", body: "Runs VendoPOS responsively through the busiest shifts." },
      { icon: "gear", title: "Works with your tablet", body: "Pairs with the devices your team already uses." },
    ],
  },
  {
    slug: "receipt-printer",
    eyebrow: "Hardware",
    icon: "receipt",
    name: "Receipt Printer",
    tagline: "Crisp, BIR-ready receipts in a snap.",
    intro:
      "Thermal receipt printing that pairs with VendoPOS for fast, compliant receipts on every sale.",
    cards: [
      { icon: "receipt", title: "Compliant receipts", body: "Prints VAT-inclusive, BIR-ready receipts straight from checkout." },
      { icon: "bolt", title: "Fast thermal printing", body: "Quiet, quick prints that keep the line moving." },
      { icon: "check", title: "Plug-and-play", body: "Connects to your setup with minimal fuss." },
    ],
  },
  {
    slug: "barcode-scanner",
    eyebrow: "Hardware",
    icon: "search",
    name: "Barcode Scanner",
    tagline: "Ring items in a beep.",
    intro: "Scan products straight into the cart for faster, error-free checkout.",
    cards: [
      { icon: "search", title: "Instant lookup", body: "Scan a barcode to add the right item immediately." },
      { icon: "bolt", title: "Faster checkout", body: "No more hunting through the catalog by hand." },
      { icon: "check", title: "Fewer mistakes", body: "Scanning the code means the right product, every time." },
    ],
  },
  {
    slug: "cash-drawer",
    eyebrow: "Hardware",
    icon: "wallet",
    name: "Cash Drawer",
    tagline: "Secure cash, clean shifts.",
    intro: "A lockable drawer that opens on sale and ties straight into your shift reconciliation.",
    cards: [
      { icon: "wallet", title: "Secure storage", body: "A solid, lockable drawer for your cash float." },
      { icon: "lock", title: "Controlled access", body: "Opens with the sale, not on a whim." },
      { icon: "chart", title: "Shift-tied counts", body: "Pairs with X-Read / Z-Read so every drawer reconciles." },
    ],
  },
  {
    slug: "payment-reader",
    eyebrow: "Hardware",
    icon: "card",
    name: "Card & QR Payment Reader",
    tagline: "Tap, card, or QR — take it all.",
    intro: "Accept cards and e-wallet QR at the counter, settled straight into the sale.",
    cards: [
      { icon: "card", title: "Every tender", body: "Cards and GCash/Maya/QRPH all at one device." },
      { icon: "bolt", title: "Fast settlement", body: "Payments land on the sale without re-keying." },
      { icon: "shield", title: "Secure", body: "Handles payments safely at the point of sale." },
    ],
  },
  {
    slug: "customer-display",
    eyebrow: "Hardware",
    icon: "monitor",
    name: "Customer Display Screen",
    tagline: "Show customers what they're paying for.",
    intro: "A second screen that mirrors the order and total, building trust at checkout.",
    cards: [
      { icon: "monitor", title: "Live order view", body: "Customers watch items and totals as they're rung up." },
      { icon: "check", title: "Transparent totals", body: "No surprises — the price is clear before they pay." },
      { icon: "heart", title: "Better experience", body: "A polished checkout that reassures every customer." },
    ],
  },
  {
    slug: "kitchen-display-screen",
    eyebrow: "Hardware",
    icon: "monitor",
    name: "Kitchen Display Screen",
    tagline: "A rugged screen for the line.",
    intro: "A kitchen-grade display that shows tickets the moment they're ordered.",
    cards: [
      { icon: "monitor", title: "Clear tickets", body: "Orders and modifiers shown legibly for the kitchen." },
      { icon: "clock", title: "Pace the line", body: "Track prep and bump items as they're done." },
      { icon: "bolt", title: "Real-time", body: "Tickets appear the instant a sale or QR order is placed." },
    ],
  },
  {
    slug: "label-printer",
    eyebrow: "Hardware",
    icon: "tag",
    name: "Label & Sticker Printer",
    tagline: "Price and label in seconds.",
    intro: "Print product labels, barcodes, and price tags on demand.",
    cards: [
      { icon: "tag", title: "Price & barcode labels", body: "Generate scannable labels for every product." },
      { icon: "bolt", title: "On-demand", body: "Print exactly what you need, when you need it." },
      { icon: "box", title: "Inventory-ready", body: "Label stock cleanly so scanning at checkout just works." },
    ],
  },
];

export const hardware = collection(HARDWARE);

/** Hardware slug → photo key in lib/marketingMedia.ts. */
const HARDWARE_PHOTO: Record<string, string> = {
  "pos-terminal": "pos-terminal",
  "receipt-printer": "receipt-printer",
  "barcode-scanner": "barcode-scanner",
  "cash-drawer": "cash-drawer",
  "payment-reader": "payment-reader",
  "customer-display": "customer-display",
  "kitchen-display-screen": "kitchen-display",
  "label-printer": "label-printer",
};

export function hardwarePhotoKey(slug: string): string {
  return HARDWARE_PHOTO[slug] ?? "hardware-hero";
}

/**
 * Pre-configured hardware bundles ("built for every business need", per the
 * reference). Each lists the gear it includes by hardware slug so the bundle
 * cards stay in sync with the catalog above.
 */
export interface HardwareBundle {
  slug: string;
  icon: IconName;
  name: string;
  forWho: string;
  blurb: string;
  /** Hardware slugs included in the bundle. */
  includes: string[];
  /** Photo key in lib/marketingMedia.ts. */
  photoKey: string;
}

export const HARDWARE_BUNDLES: HardwareBundle[] = [
  {
    slug: "counter-starter",
    icon: "store",
    name: "Counter Starter",
    forWho: "New & small shops",
    blurb: "Everything to ring sales and print compliant receipts from day one.",
    includes: ["pos-terminal", "receipt-printer", "cash-drawer"],
    photoKey: "hardware-bundle",
  },
  {
    slug: "cafe-restaurant",
    icon: "monitor",
    name: "Café & Restaurant",
    forWho: "F&B service",
    blurb: "Front counter plus a kitchen display so orders reach the line instantly.",
    includes: ["pos-terminal", "receipt-printer", "kitchen-display-screen", "payment-reader"],
    photoKey: "kitchen",
  },
  {
    slug: "retail-pro",
    icon: "cart",
    name: "Retail Pro",
    forWho: "High-volume retail",
    blurb: "Scan-fast checkout with labels, a customer display, and card/QR payments.",
    includes: ["pos-terminal", "barcode-scanner", "label-printer", "customer-display", "payment-reader"],
    photoKey: "hardware-hero",
  },
];
