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

/* --------------------------- support / operate (A1–A3) --------------------- */

/** A1: reset the store owner's password → a one-time temp password shown once. */
export async function resetOwnerPassword(
  id: string,
): Promise<Result<{ tempPassword: string; ownerEmail: string; mailDelivered: boolean }>> {
  try {
    return await readJson(
      await fetch(`${BASE}/${id}/reset-owner-password`, { method: "POST", credentials: "include" }),
    );
  } catch {
    return NETWORK_ERR;
  }
}

/** A1: re-send the owner's onboarding / sign-in email. */
export async function resendOnboarding(
  id: string,
): Promise<Result<{ ownerEmail: string; mailDelivered: boolean }>> {
  try {
    return await readJson(
      await fetch(`${BASE}/${id}/resend-onboarding`, { method: "POST", credentials: "include" }),
    );
  } catch {
    return NETWORK_ERR;
  }
}

/** A3: one open cashier shift awaiting a Z-Read. */
export interface OpenShift {
  cashierUserId: string;
  cashierName: string;
  openingCents: number;
  openedAt: string;
  salesCents: number;
}

/** A3: list the tenant's currently-open shifts. */
export async function getOpenShifts(id: string): Promise<Result<{ shifts: OpenShift[] }>> {
  try {
    return await readJson(await fetch(`${BASE}/${id}/open-shifts`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

/** A3: force-close (remote Z-Read) a stuck shift by its cashier. */
export async function forceCloseShift(
  id: string,
  cashierUserId: string,
  note?: string,
): Promise<Result<{ zread: { cashierName: string; cashVarianceCents: number } }>> {
  try {
    return await readJson(
      await fetch(`${BASE}/${id}/force-close-shift`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ cashierUserId, ...(note ? { note } : {}) }),
      }),
    );
  } catch {
    return NETWORK_ERR;
  }
}

/** A2: one entry in the per-tenant support timeline — a note or an audit event. */
export type TimelineEntry =
  | { kind: "note"; id: string; authorName: string; body: string; at: string; edited: boolean }
  | { kind: "event"; id: string; authorName: string; action: string; detail: string | null; at: string };

/** A2: the tenant's support timeline (notes UNION audit events, newest first). */
export async function getTimeline(id: string): Promise<Result<{ timeline: TimelineEntry[] }>> {
  try {
    return await readJson(await fetch(`${BASE}/${id}/timeline`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

export interface SupportNote {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

/** A2: append a support note. */
export async function createNote(id: string, body: string): Promise<Result<{ note: SupportNote }>> {
  try {
    return await readJson(
      await fetch(`${BASE}/${id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body }),
      }),
    );
  } catch {
    return NETWORK_ERR;
  }
}

/** A2: edit a support note's body. */
export async function updateNote(
  id: string,
  noteId: string,
  body: string,
): Promise<Result<{ note: SupportNote }>> {
  try {
    return await readJson(
      await fetch(`${BASE}/${id}/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body }),
      }),
    );
  } catch {
    return NETWORK_ERR;
  }
}

/** A2: delete a support note. */
export async function deleteNote(id: string, noteId: string): Promise<Result<Record<string, never>>> {
  try {
    return await readJson(
      await fetch(`${BASE}/${id}/notes/${noteId}`, { method: "DELETE", credentials: "include" }),
    );
  } catch {
    return NETWORK_ERR;
  }
}
