/**
 * Client for the Merchant CRM module (`/api/v1/crm/*`) — customers + loyalty.
 * Purchase history & lifetime spend are derived from POS sales server-side;
 * loyalty accrues at checkout. The `searchCustomers` helper feeds the POS
 * customer picker. Tenant scope is enforced from the session cookie.
 */
import { API_BASE_URL } from "./api";

const BASE = `${API_BASE_URL}/api/v1/crm`;

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  tags: string[];
  note: string | null;
  loyaltyPoints: number;
  isActive: boolean;
  orderCount: number;
  totalSpentCents: number;
  lastOrderAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerSale {
  id: string;
  reference: string;
  totalCents: number;
  paymentMethod: string;
  createdAt: string;
}

export interface CustomerDetail extends Customer {
  recentSales: CustomerSale[];
}

export interface CustomerLite {
  id: string;
  name: string;
  phone: string | null;
  loyaltyPoints: number;
}

export interface CrmSummary {
  totalCustomers: number;
  newThisMonth: number;
  repeatCustomers: number;
  loyaltyPointsOutstanding: number;
}

export interface CustomerFields {
  name: string;
  phone: string;
  email: string;
  address: string;
  tags: string[];
  note: string;
  isActive: boolean;
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

const NETWORK_ERR = { ok: false as const, error: "Could not reach the server. Check your connection." };

// ── Reads ─────────────────────────────────────────────────────────────────

export async function getCrmSummary(): Promise<Result<{ summary: CrmSummary }>> {
  try {
    return await readJson(await fetch(`${BASE}/summary`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

export async function listCustomers(): Promise<Result<{ customers: Customer[] }>> {
  try {
    return await readJson(await fetch(`${BASE}/customers`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

export async function getCustomer(id: string): Promise<Result<{ customer: CustomerDetail }>> {
  try {
    return await readJson(await fetch(`${BASE}/customers/${id}`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

/** POS picker search by name/phone. */
export async function searchCustomers(q: string): Promise<Result<{ customers: CustomerLite[] }>> {
  try {
    return await readJson(
      await fetch(`${BASE}/customers/search?q=${encodeURIComponent(q)}`, { credentials: "include" }),
    );
  } catch {
    return NETWORK_ERR;
  }
}

// ── Writes ──────────────────────────────────────────────────────────────────

export async function createCustomer(fields: CustomerFields): Promise<Result<{ customer: Customer }>> {
  try {
    return await readJson(
      await fetch(`${BASE}/customers`, {
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

export async function updateCustomer(id: string, fields: Partial<CustomerFields>): Promise<Result<{ customer: Customer }>> {
  try {
    return await readJson(
      await fetch(`${BASE}/customers/${id}`, {
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

export async function deleteCustomer(id: string): Promise<Result<Record<string, never>>> {
  try {
    return await readJson(await fetch(`${BASE}/customers/${id}`, { method: "DELETE", credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}
