/**
 * Client for the POS register API (`/api/v1/pos/*`). The catalog is
 * tenant-scoped server-side; checkout sends only line items + settlement
 * channel (never prices or a tenant id), and the server re-derives all money.
 */
import { API_BASE_URL } from "./api";

const BASE = `${API_BASE_URL}/api/v1/pos`;

export type PaymentMethod = "Cash" | "GCash" | "Maya" | "QRPH";

/** BIR VAT classification carried by every product and sale line. */
export type VatClass = "VATABLE" | "EXEMPT" | "ZERO_RATED";

/** Human labels for each VAT class (for selects / badges). */
export const VAT_CLASS_LABELS: Record<VatClass, string> = {
  VATABLE: "VATable (12%)",
  EXEMPT: "VAT-Exempt",
  ZERO_RATED: "Zero-Rated (0%)",
};

/** One-line explanation of each VAT class (shown under the product-form choice). */
export const VAT_CLASS_HINTS: Record<VatClass, string> = {
  VATABLE: "Adds 12% output VAT on the receipt",
  EXEMPT: "No VAT — e.g. basic goods, non-VAT items",
  ZERO_RATED: "0% VAT — e.g. export sales",
};

export interface CatalogProduct {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  name: string;
  sku: string | null;
  priceCents: number;
  stock: number;
  lowStockThreshold: number;
  imageUrl: string | null;
  vatClass: VatClass;
}

export interface CatalogCategory {
  id: string;
  name: string;
}

/** E-wallet rails that can carry an owner-uploaded scan-to-pay QR. */
export type EwalletQrMethod = "GCash" | "Maya" | "QRPH";
/** Owner-uploaded checkout QR image URLs by method (null when none uploaded). */
export type PaymentQrMap = Record<EwalletQrMethod, string | null>;

/** Store identity + receipt config, used to render the printed ticket. */
export interface StoreBrand {
  name: string;
  slug: string | null;
  address: string | null;
  phone: string | null;
  tin: string | null;
  /** BIR "Business Style" — the store's trade name / line of business. */
  businessStyle: string | null;
  vatLabel: string | null;
  receiptHeader: string | null;
  receiptFooter: string | null;
  logoUrl: string | null;
  /** BIR machine-accreditation footer (Permit to Use / Machine ID / Serial). */
  ptu: string | null;
  min: string | null;
  serial: string | null;
}

export interface Catalog {
  store: StoreBrand;
  categories: CatalogCategory[];
  products: CatalogProduct[];
  /** Owner-uploaded e-wallet QR codes shown to customers at checkout. */
  paymentQrs: PaymentQrMap;
}

export interface Sale {
  id: string;
  reference: string;
  subtotalCents: number;
  vatCents: number;
  vatableSalesCents: number;
  vatExemptCents: number;
  zeroRatedCents: number;
  grossCents: number;
  discountCents: number;
  discountLabel: string | null;
  totalCents: number;
  paymentMethod: PaymentMethod;
  paymentRef: string | null;
  tenderedCents: number | null;
  changeCents: number | null;
  /** Loyalty points credited to the attached customer for this sale. */
  pointsEarned: number;
  /** Loyalty points the customer spent on this sale (1 pt = ₱1 discount). */
  pointsRedeemed: number;
  /** BIR Senior/PWD ID number recorded for a VAT-exempt benefit sale (else null). */
  scPwdIdNumber?: string | null;
  /** The Senior/PWD cardholder's name recorded on the sale (else null). */
  scPwdName?: string | null;
  createdAt: string;
}

export interface CashierProfile {
  id: string;
  name: string;
}

// ── Shift reconciliation (X-Read / Z-Read) ──────────────────────────────────

export interface ShiftTally {
  cashSalesCents: number;
  ewalletSalesCents: number;
  cardSalesCents: number;
  totalSalesCents: number;
  txnCount: number;
}

export interface ActiveShift extends ShiftTally {
  id: string;
  cashierName: string;
  openingCents: number;
  openedAt: string;
  expectedCashCents: number;
}

export interface ShiftZRead extends ShiftTally {
  id: string;
  cashierName: string;
  openingCents: number;
  openedAt: string;
  closedAt: string;
  expectedCashCents: number;
  countedCashCents: number;
  cashVarianceCents: number;
  note: string | null;
  /** Immutable, human-readable reconciliation line frozen at close. */
  auditSnapshot: string;
}

/**
 * Cart-level discount. `percent` → value 0–100; `fixed` → value in centavos;
 * `senior_pwd` is the BIR Senior Citizen / PWD benefit — it carries the ID
 * number + cardholder name and the SERVER derives the VAT-exempt-then-20%
 * amount (the client never sends a peso figure for it).
 */
export type Discount =
  | { type: "percent"; value: number; label?: string }
  | { type: "fixed"; value: number; label?: string }
  | { type: "senior_pwd"; idNumber: string; holderName: string; label?: string };

const SC_PWD_VAT_NUM = 12;
const SC_PWD_VAT_DEN = 112;

/**
 * Preview-only mirror of the server's Senior/PWD math (see
 * `computeSeniorPwdBreakdown` in the backend): strip the 12% VAT from each
 * VATable line, then take 20% off the net-of-VAT base. Returns the combined
 * discount in centavos (removed VAT + 20%) so the terminal can show an accurate
 * "less" figure before checkout. The server re-derives this authoritatively.
 */
export function seniorPwdDiscountCents(lines: { vatClass: VatClass; lineCents: number }[]): number {
  const grossIncl = lines.reduce((s, l) => s + l.lineCents, 0);
  const netBase = lines.reduce((s, l) => {
    if (l.vatClass !== "VATABLE") return s + l.lineCents;
    const vat = Math.round((l.lineCents * SC_PWD_VAT_NUM) / SC_PWD_VAT_DEN);
    return s + (l.lineCents - vat);
  }, 0);
  const vatExempted = grossIncl - netBase;
  const seniorDiscount = Math.round((netBase * 20) / 100);
  return vatExempted + seniorDiscount;
}

/**
 * Preview-only mirror of the server's `computeVatBreakdown`: output VAT comes
 * from the VATable lines only — EXEMPT and ZERO_RATED lines carry none. A
 * cart-level discount is allocated across the classes pro-rata by gross, and the
 * VATable portion is the residual of the net, exactly as the server books it.
 */
export function previewVatCents(
  lines: { vatClass: VatClass; lineCents: number }[],
  discountCents = 0,
): number {
  const grossOf = (k: VatClass) => lines.reduce((s, l) => (l.vatClass === k ? s + l.lineCents : s), 0);
  const exemptGross = grossOf("EXEMPT");
  const zeroGross = grossOf("ZERO_RATED");
  const totalGross = grossOf("VATABLE") + exemptGross + zeroGross;
  const disc = Math.min(Math.max(0, Math.round(discountCents)), totalGross);
  const netCents = totalGross - disc;
  const share = (gross: number) =>
    totalGross > 0 ? Math.min(gross, Math.round((disc * gross) / totalGross)) : 0;
  const vatableNetIncl = Math.max(
    0,
    netCents - (exemptGross - share(exemptGross)) - (zeroGross - share(zeroGross)),
  );
  return Math.round((vatableNetIncl * SC_PWD_VAT_NUM) / SC_PWD_VAT_DEN);
}

export interface OrderLine {
  productId: string;
  qty: number;
}

export type Result<T> =
  | ({ ok: true } & T)
  | { ok: false; error?: string; errors?: Record<string, string>; productId?: string; available?: number };

const NETWORK_ERR = { ok: false as const, error: "Could not reach the server. Check your connection." };

async function readJson<T>(res: Response): Promise<Result<T>> {
  try {
    return (await res.json()) as Result<T>;
  } catch {
    return { ok: false, error: "Unexpected server response." };
  }
}

export async function getCatalog(): Promise<Result<Catalog>> {
  try {
    return await readJson(await fetch(`${BASE}/catalog`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

export async function listCashiers(): Promise<Result<{ cashiers: CashierProfile[] }>> {
  try {
    return await readJson(await fetch(`${BASE}/cashiers`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

export async function submitOrder(payload: {
  items: OrderLine[];
  paymentMethod: PaymentMethod;
  tenderedCents?: number;
  referenceCode?: string;
  discount?: Discount;
  customerId?: string;
  /** Loyalty points the attached customer redeems (1 pt = ₱1 off). */
  redeemPoints?: number;
}): Promise<Result<{ sale: Sale }>> {
  try {
    const res = await fetch(`${BASE}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    return await readJson(res);
  } catch {
    return NETWORK_ERR;
  }
}

// ── Shift reconciliation ────────────────────────────────────────────────────

/**
 * The caller's currently-open shift with live tallies, or `shift: null`.
 * `defaultFloatCents` is the owner-set opening float to pre-fill the gate with.
 */
export async function getActiveShift(): Promise<
  Result<{ shift: ActiveShift | null; defaultFloatCents: number }>
> {
  try {
    return await readJson(await fetch(`${BASE}/shifts/active`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

export async function openShift(openingCents: number): Promise<Result<{ shift: ActiveShift }>> {
  try {
    const res = await fetch(`${BASE}/shifts/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ openingCents }),
    });
    return await readJson(res);
  } catch {
    return NETWORK_ERR;
  }
}

export async function closeShift(
  countedCents: number,
  note?: string,
): Promise<Result<{ zread: ShiftZRead }>> {
  try {
    const res = await fetch(`${BASE}/shifts/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ countedCents, note }),
    });
    return await readJson(res);
  } catch {
    return NETWORK_ERR;
  }
}

// ── Void / Return ─────────────────────────────────────────────────────────────

export type SaleStatus = "completed" | "voided" | "partially_returned" | "returned";

export interface SaleSummary {
  id: string;
  reference: string;
  status: SaleStatus;
  totalCents: number;
  paymentMethod: string;
  cashierName: string | null;
  createdAt: string;
}

export interface SaleLineDetail {
  saleItemId: string;
  productId: string | null;
  name: string;
  unitPriceCents: number;
  qty: number;
  returnedQty: number;
  returnableQty: number;
  vatClass: VatClass;
}

export interface SaleDetail {
  id: string;
  reference: string;
  status: SaleStatus;
  subtotalCents: number;
  vatCents: number;
  vatableSalesCents: number;
  vatExemptCents: number;
  zeroRatedCents: number;
  discountCents: number;
  discountLabel: string | null;
  grossCents: number;
  totalCents: number;
  paymentMethod: string;
  paymentRef: string | null;
  tenderedCents: number | null;
  changeCents: number | null;
  cashierName: string | null;
  customerName: string | null;
  scPwdIdNumber?: string | null;
  scPwdName?: string | null;
  createdAt: string;
  lines: SaleLineDetail[];
}

export interface Reversal {
  id: string;
  reference: string;
  kind: "void" | "return";
  subtotalCents: number;
  vatCents: number;
  vatableSalesCents: number;
  vatExemptCents: number;
  zeroRatedCents: number;
  discountCents: number;
  totalCents: number;
  paymentMethod: string;
  reason: string | null;
  createdAt: string;
  originalStatus: "voided" | "partially_returned" | "returned";
}

/** Recent sales for the void/return picker (newest first). */
export async function listSales(limit = 50): Promise<Result<{ sales: SaleSummary[] }>> {
  try {
    return await readJson(await fetch(`${BASE}/sales?limit=${limit}`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

/** One sale with per-line returnable quantities. */
export async function getSaleDetail(id: string): Promise<Result<{ sale: SaleDetail }>> {
  try {
    return await readJson(await fetch(`${BASE}/sales/${id}`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

/** Void a whole sale (full reversal). */
export async function voidSale(id: string, reason?: string): Promise<Result<{ reversal: Reversal }>> {
  try {
    const res = await fetch(`${BASE}/sales/${id}/void`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ reason }),
    });
    return await readJson(res);
  } catch {
    return NETWORK_ERR;
  }
}

/** Return specific lines/quantities of a sale (partial or full). */
export async function returnSaleLines(
  id: string,
  lines: { saleItemId: string; qty: number }[],
  reason?: string,
): Promise<Result<{ reversal: Reversal }>> {
  try {
    const res = await fetch(`${BASE}/sales/${id}/returns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ lines, reason }),
    });
    return await readJson(res);
  } catch {
    return NETWORK_ERR;
  }
}

// ── Owner review of committed reversals ─────────────────────────────────────

export interface ReversalLogEntry {
  id: string;
  reference: string;
  kind: "void" | "return";
  originalReference: string | null;
  cashierName: string | null;
  reason: string | null;
  /** Positive peso amount refunded. */
  amountCents: number;
  createdAt: string;
}

export interface ReversalSummary {
  total: number;
  voids: number;
  returns: number;
  refundedCents: number;
}

/** The owner/manager review of every committed void/return, with a rollup. */
export async function listReversals(
  limit = 100,
): Promise<Result<{ reversals: ReversalLogEntry[]; summary: ReversalSummary }>> {
  try {
    return await readJson(await fetch(`${BASE}/reversals?limit=${limit}`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

// ── Terminal audit trail (cashier accountability) ───────────────────────────

/** The sensitive live-terminal actions the register reports for auditing. */
export type AuditAction = "void_item" | "cancel_transaction" | "open_drawer";

export interface AuditLog {
  id: string;
  cashierUserId: string | null;
  cashierName: string;
  action: AuditAction;
  itemName: string | null;
  itemQty: number | null;
  valueCents: number;
  detail: string | null;
  createdAt: string;
}

export interface AuditSummary {
  total: number;
  byAction: Record<AuditAction, number>;
  flaggedValueCents: number;
}

/**
 * Report a sensitive terminal action (void a cart line, cancel a transaction,
 * pop the drawer). Best-effort and fire-and-forget from the caller's view — it
 * never blocks the register — but the server write itself is durable.
 */
export async function recordAudit(event: {
  action: AuditAction;
  itemName?: string;
  itemQty?: number;
  valueCents?: number;
  detail?: string;
}): Promise<Result<{ log: AuditLog }>> {
  try {
    const res = await fetch(`${BASE}/audit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(event),
    });
    return await readJson(res);
  } catch {
    return NETWORK_ERR;
  }
}

/** The owner/manager audit trail of terminal actions, with a rollup. */
export async function listAuditLogs(
  limit = 100,
): Promise<Result<{ logs: AuditLog[]; summary: AuditSummary }>> {
  try {
    return await readJson(await fetch(`${BASE}/audit?limit=${limit}`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}
