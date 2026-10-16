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
    icon: "printer",
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
    name: "E-wallet QR Payments",
    tagline: "GCash, Maya, or QRPH — scan and pay.",
    intro: "Upload your store's e-wallet QR codes once; the register pops the right one at checkout.",
    cards: [
      { icon: "qr", title: "Your own QR codes", body: "GCash, Maya, and QRPH codes shown on screen when the cashier picks the tender." },
      { icon: "receipt", title: "Reference on the sale", body: "The e-wallet reference number is recorded on the sale and its receipt." },
      { icon: "shield", title: "No extra device", body: "Customers scan from the screen — no card terminal or gateway fees." },
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
];

export const hardware = collection(HARDWARE);

/** Hardware slug → photo key in lib/marketingMedia.ts. */
const HARDWARE_PHOTO: Record<string, string> = {
  "pos-terminal": "pos-terminal",
  "receipt-printer": "receipt-printer",
  "cash-drawer": "cash-drawer",
  "payment-reader": "payment-reader",
  "customer-display": "customer-display",
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
    blurb: "Front counter with receipts, a cash drawer, and e-wallet QR payments.",
    includes: ["pos-terminal", "receipt-printer", "cash-drawer", "payment-reader"],
    photoKey: "cafe-counter",
  },
  {
    slug: "retail-pro",
    icon: "cart",
    name: "Retail Pro",
    forWho: "High-volume retail",
    blurb: "Fast checkout with a customer display and e-wallet QR payments.",
    includes: ["pos-terminal", "receipt-printer", "customer-display", "payment-reader"],
    photoKey: "hardware-hero",
  },
];
