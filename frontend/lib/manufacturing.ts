/**
 * Client for the Merchant Manufacturing module (`/api/v1/manufacturing/*`) —
 * recipes (BOM) + production. Producing consumes component stock and increments
 * the finished good, server-side and atomically. Tenant scope is enforced from
 * the session cookie; every call rides with `credentials: "include"`.
 */
import { API_BASE_URL } from "./api";

const BASE = `${API_BASE_URL}/api/v1/manufacturing`;

export interface RecipeComponent {
  id: string;
  productId: string | null;
  name: string;
  qty: number;
  stock: number;
}

export interface Recipe {
  id: string;
  productId: string | null;
  productName: string;
  outputQty: number;
  note: string | null;
  isActive: boolean;
  components: RecipeComponent[];
  maxBatches: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionRunItem {
  id: string;
  productId: string | null;
  name: string;
  qtyConsumed: number;
}

export interface ProductionRunSummary {
  id: string;
  reference: string;
  recipeId: string | null;
  productId: string | null;
  productName: string;
  batches: number;
  outputQty: number;
  createdAt: string;
}

export interface ProductionRunDetail extends ProductionRunSummary {
  note: string | null;
  items: ProductionRunItem[];
}

export interface ManufacturingSummary {
  recipeCount: number;
  buildableNow: number;
  runsThisMonth: number;
  unitsThisMonth: number;
}

/** A component as the recipe form collects it. */
export interface ComponentDraft {
  productId: string;
  qty: number;
}

export interface RecipeFields {
  productId: string;
  outputQty: number;
  note: string;
  isActive: boolean;
  components: ComponentDraft[];
}

export type Result<T> =
  | ({ ok: true } & T)
  | { ok: false; error?: string; errors?: Record<string, string>; shortage?: { name: string; needed: number; available: number } };

async function readJson<T>(res: Response): Promise<Result<T>> {
  try {
    return (await res.json()) as Result<T>;
  } catch {
    return { ok: false, error: "Unexpected server response." };
  }
}

const NETWORK_ERR = { ok: false as const, error: "Could not reach the server. Check your connection." };

// ── Reads ─────────────────────────────────────────────────────────────────

export async function getManufacturingSummary(): Promise<Result<{ summary: ManufacturingSummary }>> {
  try {
    return await readJson(await fetch(`${BASE}/summary`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

export async function listRecipes(): Promise<Result<{ recipes: Recipe[] }>> {
  try {
    return await readJson(await fetch(`${BASE}/recipes`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

export async function listProductionRuns(): Promise<Result<{ runs: ProductionRunSummary[] }>> {
  try {
    return await readJson(await fetch(`${BASE}/runs`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

// ── Recipe writes ─────────────────────────────────────────────────────────────

export async function createRecipe(fields: RecipeFields): Promise<Result<{ recipe: Recipe }>> {
  try {
    return await readJson(
      await fetch(`${BASE}/recipes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(fields),
      }),
    );
  } catch {
    return NETWORK_ERR;
  }
}

export async function updateRecipe(
  id: string,
  fields: Partial<RecipeFields>,
): Promise<Result<{ recipe: Recipe }>> {
  try {
    return await readJson(
      await fetch(`${BASE}/recipes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(fields),
      }),
    );
  } catch {
    return NETWORK_ERR;
  }
}

export async function deleteRecipe(id: string): Promise<Result<Record<string, never>>> {
  try {
    return await readJson(await fetch(`${BASE}/recipes/${id}`, { method: "DELETE", credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

export async function produce(
  id: string,
  batches: number,
  note = "",
): Promise<Result<{ run: ProductionRunDetail }>> {
  try {
    return await readJson(
      await fetch(`${BASE}/recipes/${id}/produce`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ batches, note }),
      }),
    );
  } catch {
    return NETWORK_ERR;
  }
}
