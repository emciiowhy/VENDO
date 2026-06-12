/**
 * Client for the Merchant Procurement module (`/api/v1/procurement/*`) —
 * suppliers + purchase orders. Receiving a PO restocks Inventory server-side.
 * Tenant scope is enforced from the session cookie, so every call rides with
 * `credentials: "include"`. All payloads are plain JSON.
 */
import { API_BASE_URL } from "./api";

const BASE = `${API_BASE_URL}/api/v1/procurement`;

export interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  note: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderItem {
  id: string;
  productId: string | null;
  name: string;
  qty: number;
  unitCostCents: number;
  unitCost: number;
  lineTotalCents: number;
}

export type PoStatus = "draft" | "ordered" | "received" | "cancelled";

export interface PurchaseOrderSummary {
  id: string;
  reference: string;
  supplierId: string | null;
  supplierName: string | null;
  status: PoStatus;
  orderDate: string;
  expectedDate: string | null;
  receivedAt: string | null;
  totalCents: number;
  itemCount: number;
  createdAt: string;
}

export interface PurchaseOrderDetail extends PurchaseOrderSummary {
  note: string | null;
  items: PurchaseOrderItem[];
}

export interface ProcurementSummary {
  supplierCount: number;
  openOrders: number;
  onOrderValueCents: number;
  receivedThisMonthCents: number;
}

/** Fields the supplier form collects. */
export interface SupplierFields {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  note: string;
  isActive: boolean;
}

/** A line item as the PO form collects it; unitCost is pesos. */
export interface PoLineDraft {
  productId: string; // "" => free-text / non-catalogue
  name: string;
  qty: number;
  unitCost: string; // pesos
}

export interface PoCreateFields {
  supplierId: string;
  status: "draft" | "ordered";
  orderDate: string;
  expectedDate: string;
  note: string;
  items: { productId: string; name: string; qty: number; unitCost: string }[];
}

export type Result<T> =
  | ({ ok: true } & T)
  | { ok: false; error?: string; errors?: Record<string, string> };

async function readJson<T>(res: Response): Promise<Result<T>> {
  try {
    return (await res.json()) as Result<T>;
  } catch {
    return { ok: false, error: "Unexpected server response." };
  }
}

const NETWORK_ERR = {
  ok: false as const,
  error: "Could not reach the server. Check your connection.",
};

// ── Reads ─────────────────────────────────────────────────────────────────

export async function getProcurementSummary(): Promise<Result<{ summary: ProcurementSummary }>> {
  try {
    return await readJson(await fetch(`${BASE}/summary`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

export async function listSuppliers(): Promise<Result<{ suppliers: Supplier[] }>> {
  try {
    return await readJson(await fetch(`${BASE}/suppliers`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

export async function listPurchaseOrders(): Promise<Result<{ purchaseOrders: PurchaseOrderSummary[] }>> {
  try {
    return await readJson(await fetch(`${BASE}/purchase-orders`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

export async function getPurchaseOrder(id: string): Promise<Result<{ po: PurchaseOrderDetail }>> {
  try {
    return await readJson(await fetch(`${BASE}/purchase-orders/${id}`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

// ── Supplier writes ───────────────────────────────────────────────────────────

export async function createSupplier(fields: SupplierFields): Promise<Result<{ supplier: Supplier }>> {
  try {
    return await readJson(
      await fetch(`${BASE}/suppliers`, {
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

export async function updateSupplier(
  id: string,
  fields: Partial<SupplierFields>,
): Promise<Result<{ supplier: Supplier }>> {
  try {
    return await readJson(
      await fetch(`${BASE}/suppliers/${id}`, {
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

export async function deleteSupplier(id: string): Promise<Result<Record<string, never>>> {
  try {
    return await readJson(
      await fetch(`${BASE}/suppliers/${id}`, { method: "DELETE", credentials: "include" }),
    );
  } catch {
    return NETWORK_ERR;
  }
}

// ── Purchase-order writes ─────────────────────────────────────────────────────

export async function createPurchaseOrder(
  fields: PoCreateFields,
): Promise<Result<{ po: PurchaseOrderDetail }>> {
  try {
    return await readJson(
      await fetch(`${BASE}/purchase-orders`, {
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

export async function receivePurchaseOrder(id: string): Promise<Result<{ po: PurchaseOrderDetail }>> {
  try {
    return await readJson(
      await fetch(`${BASE}/purchase-orders/${id}/receive`, {
        method: "POST",
        credentials: "include",
      }),
    );
  } catch {
    return NETWORK_ERR;
  }
}

export async function setPurchaseOrderStatus(
  id: string,
  status: "draft" | "ordered" | "cancelled",
): Promise<Result<{ po: PurchaseOrderDetail }>> {
  try {
    return await readJson(
      await fetch(`${BASE}/purchase-orders/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      }),
    );
  } catch {
    return NETWORK_ERR;
  }
}

export async function deletePurchaseOrder(id: string): Promise<Result<Record<string, never>>> {
  try {
    return await readJson(
      await fetch(`${BASE}/purchase-orders/${id}`, { method: "DELETE", credentials: "include" }),
    );
  } catch {
    return NETWORK_ERR;
  }
}
