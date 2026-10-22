/**
 * Client for the Merchant Inventory & Category CRUD Matrix
 * (`/api/inventory/*`). The tenant scope is enforced server-side from the
 * session cookie, so every call just rides with `credentials: "include"`.
 *
 * Product writes are multipart (FormData) so an image file can travel with the
 * other fields; reads and category writes are plain JSON.
 */
import { API_BASE_URL } from "./api";
import type { VatClass } from "./pos";

const BASE = `${API_BASE_URL}/api/inventory`;

export interface Category {
  id: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
  createdAt: string;
}

export interface Product {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  name: string;
  sku: string | null;
  priceCents: number;
  price: number;
  stock: number;
  lowStockThreshold: number;
  lowStock: boolean;
  imageUrl: string | null;
  isActive: boolean;
  vatClass: VatClass;
  scPwdEligible: boolean;
  createdAt: string;
  updatedAt: string;
}

export type Result<T> = ({ ok: true } & T) | { ok: false; error?: string; errors?: Record<string, string> };

async function readJson<T>(res: Response): Promise<Result<T>> {
  try {
    return (await res.json()) as Result<T>;
  } catch {
    return { ok: false, error: "Unexpected server response." };
  }
}

const NETWORK_ERR = { ok: false as const, error: "Could not reach the server. Check your connection." };

// ── Reads ─────────────────────────────────────────────────────────────────

export async function listProducts(): Promise<Result<{ products: Product[] }>> {
  try {
    return await readJson(await fetch(`${BASE}/products`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

export async function listCategories(): Promise<Result<{ categories: Category[] }>> {
  try {
    return await readJson(await fetch(`${BASE}/categories`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

// ── Product writes (multipart) ───────────────────────────────────────────────

/** Fields the form collects; price is in pesos, the backend stores centavos. */
export interface ProductFields {
  name: string;
  sku: string;
  categoryId: string; // "" => uncategorised
  price: string; // pesos
  stock: string;
  lowStockThreshold: string;
  isActive: boolean;
  vatClass: VatClass;
  scPwdEligible: boolean;
  /** Why stock changed, when it did (saved on the stock ledger entry). */
  stockReason?: StockReason;
}

export const STOCK_REASONS = ["Restock", "Damaged / expired", "Count correction", "Other"] as const;
export type StockReason = (typeof STOCK_REASONS)[number];

function toFormData(fields: Partial<ProductFields>, image: File | null, removeImage = false): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    fd.append(k, typeof v === "boolean" ? String(v) : v);
  }
  if (image) fd.append("image", image);
  if (removeImage) fd.append("removeImage", "true");
  return fd;
}

export async function createProduct(
  fields: ProductFields,
  image: File | null,
): Promise<Result<{ product: Product }>> {
  try {
    const res = await fetch(`${BASE}/products`, {
      method: "POST",
      credentials: "include",
      body: toFormData(fields, image),
    });
    return await readJson(res);
  } catch {
    return NETWORK_ERR;
  }
}

export async function updateProduct(
  id: string,
  fields: Partial<ProductFields>,
  image: File | null,
  removeImage = false,
): Promise<Result<{ product: Product }>> {
  try {
    const res = await fetch(`${BASE}/products/${id}`, {
      method: "PATCH",
      credentials: "include",
      body: toFormData(fields, image, removeImage),
    });
    return await readJson(res);
  } catch {
    return NETWORK_ERR;
  }
}

export async function deleteProduct(id: string): Promise<Result<Record<string, never>>> {
  try {
    const res = await fetch(`${BASE}/products/${id}`, { method: "DELETE", credentials: "include" });
    return await readJson(res);
  } catch {
    return NETWORK_ERR;
  }
}

// ── Category writes (JSON) ───────────────────────────────────────────────────

export interface CategoryFields {
  name: string;
  parentId: string; // "" => top-level
}

export async function createCategory(fields: CategoryFields): Promise<Result<{ category: Category }>> {
  try {
    const res = await fetch(`${BASE}/categories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(fields),
    });
    return await readJson(res);
  } catch {
    return NETWORK_ERR;
  }
}

export async function updateCategory(
  id: string,
  fields: Partial<CategoryFields>,
): Promise<Result<{ category: Category }>> {
  try {
    const res = await fetch(`${BASE}/categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(fields),
    });
    return await readJson(res);
  } catch {
    return NETWORK_ERR;
  }
}

export async function deleteCategory(id: string): Promise<Result<Record<string, never>>> {
  try {
    const res = await fetch(`${BASE}/categories/${id}`, { method: "DELETE", credentials: "include" });
    return await readJson(res);
  } catch {
    return NETWORK_ERR;
  }
}

// ── Stock history (the stock-movement ledger) ───────────────────────────────

const LEDGER = `${API_BASE_URL}/api/v1/inventory`;

/** Raw ledger reasons as stored server-side. */
export type MovementReason =
  | "sale"
  | "sale_void"
  | "return"
  | "po_receive"
  | "produce_consume"
  | "produce_output"
  | "adjust"
  | "count";

/** The Stock history filter groups (server maps each to its reasons). */
export type MovementType = "sales" | "reversals" | "manual" | "received" | "production";

export interface StockMovement {
  id: string;
  productId: string;
  productName: string | null;
  qtyDelta: number;
  balanceAfter: number;
  reason: MovementReason;
  refTable: string | null;
  refId: string | null;
  note: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface MovementQuery {
  type?: MovementType;
  productId?: string;
  /** Manila dates (YYYY-MM-DD), inclusive. */
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

/** The whole-store movement feed, newest first, with units in/out for the filtered set. */
export async function listStockMovements(
  q: MovementQuery,
): Promise<Result<{ movements: StockMovement[]; total: number; unitsIn: number; unitsOut: number; page: number; pageSize: number }>> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== "") params.set(k, String(v));
  try {
    return await readJson(await fetch(`${LEDGER}/movements?${params}`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}
