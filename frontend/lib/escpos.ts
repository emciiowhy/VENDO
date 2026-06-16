/**
 * ESC/POS receipt serialisation for direct-to-device thermal printing.
 *
 * This module is intentionally pure: it turns a completed {@link Sale} into a
 * byte stream of standard ESC/POS commands and never touches the DOM, `window`,
 * or `navigator`. The transport (WebUSB / Web Bluetooth) lives in
 * `lib/thermalPrinter.ts`; this layer just authors the bytes, so it is
 * SSR-safe and unit-testable in isolation.
 *
 * It mirrors the figures on the HTML receipt (`receiptPrint.ts`) — money is
 * read straight from the server-authored centavos and never recomputed. Text is
 * coerced to printable ASCII (a thermal head's default code page can't render
 * the ₱ glyph or accents reliably), so money prints as "PHP 1,234.56".
 */
import type { Sale, StoreBrand } from "./pos";
import type { TicketItem } from "@/app/components/pos/receiptPrint";

// Single-byte ESC/POS control codes.
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/** ASCII money: thermal heads can't render ₱, so use a "PHP" prefix. */
function money(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const whole = (Math.abs(cents) / 100).toFixed(2);
  return `${sign}PHP ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

/** Drop anything outside printable ASCII so the print head doesn't emit garbage. */
function ascii(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    out.push(code >= 0x20 && code <= 0x7e ? code : 0x3f /* '?' */);
  }
  return out;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Accumulates ESC/POS bytes. Width is the printable column count for the head —
 * 32 for a 58mm pocket/Bluetooth unit, 48 for an 80mm desk USB printer — and
 * drives the two-column row padding so totals line up on either.
 */
class EscPosBuilder {
  private readonly bytes: number[] = [];
  constructor(private readonly width = 32) {}

  raw(...b: number[]): this {
    this.bytes.push(...b);
    return this;
  }

  /** Reset the printer to a known state (clears any leftover style bits). */
  init(): this {
    return this.raw(ESC, 0x40);
  }

  align(mode: "left" | "center" | "right"): this {
    return this.raw(ESC, 0x61, mode === "center" ? 1 : mode === "right" ? 2 : 0);
  }

  bold(on: boolean): this {
    return this.raw(ESC, 0x45, on ? 1 : 0);
  }

  /** GS ! — double width+height when `on`, normal otherwise. */
  doubleSize(on: boolean): this {
    return this.raw(GS, 0x21, on ? 0x11 : 0x00);
  }

  text(s: string): this {
    return this.raw(...ascii(s));
  }

  line(s = ""): this {
    return this.raw(...ascii(s), LF);
  }

  /** A label flushed left and a value flushed right on one `width`-wide line. */
  row(label: string, value: string): this {
    const pad = Math.max(1, this.width - label.length - value.length);
    return this.line(label + " ".repeat(pad) + value);
  }

  rule(ch = "-"): this {
    return this.line(ch.repeat(this.width));
  }

  feed(lines = 1): this {
    return this.raw(ESC, 0x64, lines);
  }

  /** GS V — partial cut, after feeding the paper clear of the head. */
  cut(): this {
    return this.feed(3).raw(GS, 0x56, 66, 0);
  }

  /** ESC p — pop a cash drawer wired to the printer's kick port. */
  openDrawer(): this {
    return this.raw(ESC, 0x70, 0, 25, 250);
  }

  build(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

export interface BuildReceiptArgs {
  store: StoreBrand;
  sale: Sale;
  items: TicketItem[];
  cashierName?: string | null;
  soldTo?: string | null;
  /** Printable columns: 32 for 58mm, 48 for 80mm. Defaults to 32 (safe everywhere). */
  width?: number;
  /** Pop the drawer on cash sales when the printer's kick port is wired. */
  kickDrawer?: boolean;
}

/**
 * Serialise a completed sale to an ESC/POS byte stream — the thermal twin of
 * {@link printSaleReceipt}. Carries store identity, the VAT-inclusive summary,
 * tender/change, and the loyalty footer, then cuts the paper.
 */
export function buildSaleReceipt(args: BuildReceiptArgs): Uint8Array {
  const { store, sale, items, width = 32 } = args;
  const b = new EscPosBuilder(width);

  b.init().align("center");
  b.doubleSize(true).bold(true).line(store.name).bold(false).doubleSize(false);
  if (store.receiptHeader) b.line(store.receiptHeader);
  if (store.address) b.line(store.address);
  if (store.phone) b.line(store.phone);
  b.line(`${store.vatLabel || "VAT REG TIN"}: ${store.tin || "________"}`);

  b.feed(1).bold(true).line("SALES INVOICE").bold(false);
  b.align("left").rule();
  b.row("Invoice", sale.reference);
  b.row("Date", fmtDate(sale.createdAt));
  if (args.cashierName) b.row("Cashier", args.cashierName);
  b.line(`Sold to: ${args.soldTo || "Walk-in customer"}`);
  b.rule();

  for (const it of items) {
    b.line(it.name);
    b.row(`  ${it.qty} x ${money(it.unitCents)}`, money(it.unitCents * it.qty));
  }
  b.rule();

  if (sale.discountCents > 0) {
    b.row("Gross", money(sale.grossCents));
    b.row(`Less: ${sale.discountLabel || "Discount"}`, `-${money(sale.discountCents)}`);
  }
  b.row("VATable Sales", money(sale.subtotalCents));
  b.row("VAT (12%)", money(sale.vatCents));
  b.rule();
  b.bold(true).doubleSize(true).row("TOTAL", money(sale.totalCents)).doubleSize(false).bold(false);
  b.row("Paid via", sale.paymentMethod);
  if (sale.paymentMethod === "Cash" && sale.tenderedCents !== null) {
    b.row("Cash", money(sale.tenderedCents));
    b.row("Change", money(sale.changeCents ?? 0));
  }
  if (sale.paymentRef) b.row(`${sale.paymentMethod} ref`, sale.paymentRef);

  if (sale.pointsRedeemed > 0 || sale.pointsEarned > 0) {
    b.rule();
    if (sale.pointsRedeemed > 0) b.row("Points redeemed", `-${sale.pointsRedeemed}`);
    if (sale.pointsEarned > 0) b.row("Points earned", `+${sale.pointsEarned}`);
  }

  b.feed(1).align("center");
  b.line(store.receiptFooter || "This serves as your Sales Invoice. Thank you!");
  b.line("Powered by VendoPOS");

  if (args.kickDrawer && sale.paymentMethod === "Cash") b.openDrawer();
  b.cut();
  return b.build();
}
