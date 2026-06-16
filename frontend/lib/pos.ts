/**
 * Client for the POS register API (`/api/v1/pos/*`). The catalog is
 * tenant-scoped server-side; checkout sends only line items + settlement
 * channel (never prices or a tenant id), and the server re-derives all money.
 */
import { API_BASE_URL } from "./api";

const BASE = `${API_BASE_URL}/api/v1/pos`;

export type PaymentMethod = "Cash" | "GCash" | "Maya" | "QRPH";

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

/** Cart-level discount. `percent` → value 0–100; `fixed` → value in centavos. */
export interface Discount {
  type: "percent" | "fixed";
  value: number;
  label?: string;
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
}

export interface SaleDetail {
  id: string;
  reference: string;
  status: SaleStatus;
  subtotalCents: number;
  vatCents: number;
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
  createdAt: string;
  lines: SaleLineDetail[];
}

export interface Reversal {
  id: string;
  reference: string;
  kind: "void" | "return";
  subtotalCents: number;
  vatCents: number;
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
