/**
 * Thermal ticket printing for the POS. Renders an 80mm receipt as a standalone
 * HTML document and prints it through a hidden iframe — popup-blocker-proof and
 * without disturbing the register UI. Two ticket kinds share one renderer: the
 * sale receipt (after checkout / reprint) and the refund slip (after a
 * void/return), so both look like they came off the same printer.
 *
 * Money is formatted from integer centavos; nothing here recomputes totals — it
 * only lays out figures the server already authored.
 */
import { formatCents } from "@/lib/format";
import type { Sale, StoreBrand, Reversal } from "@/lib/pos";

export interface TicketItem {
  name: string;
  qty: number;
  unitCents: number;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
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

/** Shared chrome: store header (logo, name, address, TIN) + a documented footer. */
function header(store: StoreBrand): string {
  const lines: string[] = [];
  if (store.logoUrl) {
    lines.push(`<img class="logo" src="${esc(store.logoUrl)}" alt="" />`);
  }
  lines.push(`<div class="store">${esc(store.name)}</div>`);
  if (store.receiptHeader) lines.push(`<div class="muted">${esc(store.receiptHeader)}</div>`);
  if (store.address) lines.push(`<div class="muted">${esc(store.address)}</div>`);
  if (store.phone) lines.push(`<div class="muted">${esc(store.phone)}</div>`);
  if (store.tin) lines.push(`<div class="muted">${esc(store.vatLabel || "VAT REG TIN")}: ${esc(store.tin)}</div>`);
  return `<div class="center">${lines.join("")}</div>`;
}

function row(label: string, value: string, opts: { strong?: boolean; mono?: boolean } = {}): string {
  const cls = [opts.strong ? "strong" : "", opts.mono ? "mono" : ""].filter(Boolean).join(" ");
  return `<div class="row ${cls}"><span>${esc(label)}</span><span>${esc(value)}</span></div>`;
}

function itemRows(items: TicketItem[]): string {
  return items
    .map((it) => {
      const amount = formatCents(it.unitCents * it.qty);
      const sub = `${it.qty} × ${formatCents(it.unitCents)}`;
      return `<div class="item"><div class="iname">${esc(it.name)}</div><div class="row"><span class="muted">${esc(sub)}</span><span>${esc(amount)}</span></div></div>`;
    })
    .join("");
}

const STYLE = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 80mm; padding: 4mm 5mm; font-family: "Menlo","Consolas",monospace; color: #000; font-size: 12px; line-height: 1.45; }
  .center { text-align: center; }
  .logo { width: 64px; height: 64px; object-fit: contain; margin: 0 auto 4px; display: block; }
  .store { font-size: 15px; font-weight: 800; letter-spacing: -0.2px; }
  .muted { color: #333; font-size: 11px; }
  .title { text-align: center; font-weight: 800; font-size: 13px; letter-spacing: 1px; margin: 6px 0; }
  .rule { border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; gap: 8px; }
  .row.strong { font-weight: 800; font-size: 13px; }
  .mono { font-variant-numeric: tabular-nums; }
  .item { margin: 2px 0; }
  .iname { font-weight: 700; }
  .foot { text-align: center; margin-top: 8px; font-size: 11px; }
  @media print { @page { margin: 0; } }
`;

function printDoc(title: string, bodyHtml: string): void {
  if (typeof window === "undefined") return;
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${STYLE}</style></head><body>${bodyHtml}</body></html>`);
  doc.close();

  const fire = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    // Give the print dialog time to read the document before teardown.
    setTimeout(() => iframe.remove(), 1000);
  };
  // Wait for the logo image (if any) so it isn't missing on the first print.
  const img = doc.querySelector("img");
  if (img && !img.complete) {
    img.addEventListener("load", fire);
    img.addEventListener("error", fire);
    setTimeout(fire, 1500); // hard fallback if the image stalls
  } else {
    // Defer one tick so layout settles.
    setTimeout(fire, 60);
  }
}

/**
 * The BIR machine-accreditation footer — Permit to Use (PTU), Machine ID (MIN)
 * and serial number, plus the mandatory five-year validity statement. Renders
 * only the lines the store has configured; emits nothing when none are set.
 */
function accreditation(store: StoreBrand): string {
  const lines: string[] = [];
  if (store.ptu) lines.push(`PTU No: ${esc(store.ptu)}`);
  if (store.min) lines.push(`MIN: ${esc(store.min)}`);
  if (store.serial) lines.push(`S/N: ${esc(store.serial)}`);
  if (lines.length === 0) return "";
  return (
    `<div class="rule"></div>` +
    `<div class="foot muted">${lines.join("<br/>")}</div>` +
    `<div class="foot muted">This invoice shall be valid for five (5) years from the date of the Permit to Use.</div>`
  );
}

/**
 * Print the BIR-style sales invoice for a completed sale. Carries the essential
 * elements of a valid PH invoice: seller identity (name, address, VAT-REG TIN),
 * a serial number + date, the buyer ("Sold To") when known, itemised lines, and
 * a VAT summary (VATable / VAT-exempt / zero-rated / 12% VAT) resolving to the
 * total amount due — followed by the accreditation footer.
 */
export function printSaleReceipt(args: {
  store: StoreBrand;
  sale: Sale;
  items: TicketItem[];
  cashierName?: string | null;
  soldTo?: string | null;
  /** Suffix on the title, e.g. "(REPRINT)" when re-issuing an old invoice. */
  titleNote?: string;
}): void {
  const { store, sale, items } = args;
  const parts: string[] = [header(store)];
  parts.push(`<div class="title">SALES INVOICE${args.titleNote ? ` ${esc(args.titleNote)}` : ""}</div>`);
  parts.push(row("Invoice No.", sale.reference, { mono: true }));
  parts.push(row("Date", fmtDate(sale.createdAt)));
  if (args.cashierName) parts.push(row("Cashier", args.cashierName));
  parts.push(`<div class="rule"></div>`);
  parts.push(`<div class="muted">Sold to: ${esc(args.soldTo || "Walk-in customer")}</div>`);
  parts.push(`<div class="rule"></div>`);
  parts.push(itemRows(items));
  parts.push(`<div class="rule"></div>`);
  if (sale.discountCents > 0) {
    parts.push(row("Gross amount", formatCents(sale.grossCents)));
    parts.push(row(`Less: ${sale.discountLabel || "Discount"}`, `−${formatCents(sale.discountCents)}`));
    parts.push(`<div class="rule"></div>`);
  }
  // VAT summary (the system books all sales as 12% VAT-inclusive; exempt and
  // zero-rated lines are shown at zero until product VAT classes are modelled).
  parts.push(row("VATable Sales", formatCents(sale.subtotalCents)));
  parts.push(row("VAT-Exempt Sales", formatCents(0)));
  parts.push(row("Zero-Rated Sales", formatCents(0)));
  parts.push(row("VAT (12%)", formatCents(sale.vatCents)));
  parts.push(`<div class="rule"></div>`);
  parts.push(row("TOTAL AMOUNT DUE", formatCents(sale.totalCents), { strong: true }));
  parts.push(row("Paid via", sale.paymentMethod));
  if (sale.paymentMethod === "Cash" && sale.tenderedCents !== null) {
    parts.push(row("Cash tendered", formatCents(sale.tenderedCents)));
    parts.push(row("Change", formatCents(sale.changeCents ?? 0)));
  }
  if (sale.paymentRef) parts.push(row(`${sale.paymentMethod} ref`, `••${sale.paymentRef}`));
  const foot = store.receiptFooter || "This serves as your Sales Invoice. Thank you!";
  parts.push(`<div class="foot">${esc(foot)}</div>`);
  parts.push(accreditation(store));
  parts.push(`<div class="foot muted">Powered by VendoPOS</div>`);

  printDoc(`Receipt ${sale.reference}`, parts.join(""));
}

/** Print a refund slip for a void/return reversal (figures are negative). */
export function printRefundSlip(args: {
  store: StoreBrand;
  reversal: Reversal;
  originalReference: string;
  items: TicketItem[];
}): void {
  const { store, reversal, items } = args;
  const abs = (c: number) => formatCents(Math.abs(c));
  const parts: string[] = [header(store)];
  parts.push(`<div class="title">${reversal.kind === "void" ? "VOID SLIP" : "RETURN / REFUND"}</div>`);
  parts.push(
    `<div class="muted center">${esc(reversal.reference)} · ${esc(fmtDate(reversal.createdAt))}</div>`,
  );
  parts.push(`<div class="muted center">Against ${esc(args.originalReference)}</div>`);
  parts.push(`<div class="rule"></div>`);
  parts.push(itemRows(items));
  parts.push(`<div class="rule"></div>`);
  if (reversal.discountCents !== 0) parts.push(row("Discount reversed", abs(reversal.discountCents)));
  parts.push(row("VAT (12% incl.)", abs(reversal.vatCents)));
  parts.push(row("REFUND TOTAL", abs(reversal.totalCents), { strong: true }));
  parts.push(`<div class="rule"></div>`);
  parts.push(row("Refunded via", reversal.paymentMethod));
  if (reversal.reason) parts.push(`<div class="muted">Reason: ${esc(reversal.reason)}</div>`);
  parts.push(`<div class="foot">Keep this slip as proof of refund.</div>`);
  parts.push(accreditation(store));
  parts.push(`<div class="foot muted">Powered by VendoPOS</div>`);

  printDoc(`Refund ${reversal.reference}`, parts.join(""));
}
