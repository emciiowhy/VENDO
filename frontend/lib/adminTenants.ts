/**
 * Client for the Super-Admin tenant control plane (`/api/v1/admin/tenants`).
 * SUPER_ADMIN-only server-side; the session cookie rides along with
 * `credentials: "include"`. The list reuses the live subscriber shape so the
 * Tenants directory and the Subscribers drawer never drift.
 */
import { API_BASE_URL } from "./api";
import type { Result, Subscriber } from "./adminAnalytics";

const BASE = `${API_BASE_URL}/api/v1/admin/tenants`;

export type Plan = "starter" | "business" | "enterprise";
export type TenantStatus = "active" | "suspended";

/** A managed store environment — the same row the subscriber register returns. */
export type Tenant = Subscriber;

export interface TenantPatch {
  plan?: Plan;
  status?: TenantStatus;
}

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

/** GET the full directory of store environments. */
export async function getTenants(): Promise<Result<{ tenants: Tenant[] }>> {
  try {
    return await readJson(await fetch(BASE, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

/** PATCH a tenant's plan and/or status; resolves to the updated row. */
export async function updateTenant(
  id: string,
  patch: TenantPatch,
): Promise<Result<{ tenant: Tenant }>> {
  try {
    return await readJson(
      await fetch(`${BASE}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(patch),
      }),
    );
  } catch {
    return NETWORK_ERR;
  }
}
