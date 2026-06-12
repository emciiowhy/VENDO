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

export interface Catalog {
  store: { name: string; slug: string | null };
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
