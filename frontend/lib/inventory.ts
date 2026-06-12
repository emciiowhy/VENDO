/**
 * Client for the Merchant Inventory & Category CRUD Matrix
 * (`/api/inventory/*`). The tenant scope is enforced server-side from the
 * session cookie, so every call just rides with `credentials: "include"`.
 *
 * Product writes are multipart (FormData) so an image file can travel with the
 * other fields; reads and category writes are plain JSON.
 */
import { API_BASE_URL } from "./api";

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
}

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
