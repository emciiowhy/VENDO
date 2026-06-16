/**
 * Client for the Super Admin Leads pipeline (`/api/v1/admin/leads/*`).
 * SUPER_ADMIN-only server-side; calls ride with `credentials: "include"`.
 */
import { API_BASE_URL } from "./api";

const BASE = `${API_BASE_URL}/api/v1/admin/leads`;

export type LeadStatus = "PENDING_DEMO" | "APPROVED" | "REJECTED";
export type Plan = "starter" | "business" | "enterprise";

export interface Lead {
  id: string;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  status: LeadStatus;
  requestedAt: string;
  businessType: string | null;
  message: string | null;
  /** True when the prospect set their own owner password on the demo request. */
  hasOwnerPassword: boolean;
}

export interface ProvisionPayload {
  storeName: string;
  slug: string;
  plan: Plan;
  ownerEmail: string;
  ownerName: string;
  /**
   * Optional. Leave blank to keep the password the owner set on their request
   * (or to provision a Google-only owner when none was set). Supplying one here
   * overrides it.
   */
  ownerPassword?: string;
}

export interface ProvisionedTenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

export type Result<T> =
  | ({ ok: true } & T)
  | { ok: false; error?: string; field?: string; errors?: Record<string, string> };

const NETWORK_ERR = { ok: false as const, error: "Could not reach the server. Check your connection." };

async function readJson<T>(res: Response): Promise<Result<T>> {
  try {
    return (await res.json()) as Result<T>;
  } catch {
    return { ok: false, error: "Unexpected server response." };
  }
}

/** Mirrors the backend slugify so the drawer previews the exact stored slug. */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export async function listLeads(): Promise<Result<{ leads: Lead[] }>> {
  try {
    return await readJson(await fetch(`${BASE}`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

export async function approveLead(
  id: string,
  payload: ProvisionPayload,
): Promise<
  Result<{
    tenant: ProvisionedTenant;
    lead: Lead;
    onboardingEmailTo?: string;
    /**
     * Whether the onboarding email actually reached the transport. `false` means
     * the store was provisioned but the welcome mail was dropped (e.g. a Resend
     * rejection) — the UI shows a warning toast rather than promising delivery.
     */
    mailDelivered?: boolean;
  }>
> {
  try {
    const res = await fetch(`${BASE}/${id}/approve`, {
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

export async function rejectLead(id: string): Promise<Result<{ lead: Lead }>> {
  try {
    const res = await fetch(`${BASE}/${id}/reject`, { method: "POST", credentials: "include" });
    return await readJson(res);
  } catch {
    return NETWORK_ERR;
  }
}
