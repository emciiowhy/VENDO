/**
 * Client for the Super Admin platform broadcaster (`/api/v1/admin/broadcast/*`).
 * SUPER_ADMIN-only server-side; the session cookie rides along with
 * `credentials: "include"`.
 */
import { API_BASE_URL } from "./api";
import type { Plan } from "./adminAnalytics";

const BASE = `${API_BASE_URL}/api/v1/admin/broadcast`;

export type BroadcastSeverity = "info" | "success" | "warning" | "danger";

export interface BroadcastInput {
  title: string;
  body: string;
  severity: BroadcastSeverity;
  /** A single plan tier, or null to reach every active store. */
  plan: Plan | null;
}

type Ok<T> = ({ ok: true } & T) | { ok: false; error?: string };

const NETWORK_ERR = {
  ok: false as const,
  error: "Could not reach the server. Check your connection.",
};

/** Preview how many merchants the current audience selection reaches. */
export async function getRecipientCount(plan: Plan | null): Promise<Ok<{ count: number }>> {
  try {
    const qs = plan ? `?plan=${plan}` : "";
    const res = await fetch(`${BASE}/recipients${qs}`, { credentials: "include" });
    return (await res.json()) as Ok<{ count: number }>;
  } catch {
    return NETWORK_ERR;
  }
}

/** Fan a notice out to the chosen audience. Returns how many merchants were messaged. */
export async function sendBroadcast(
  input: BroadcastInput,
): Promise<Ok<{ delivered: number; audience: string }>> {
  try {
    const res = await fetch(BASE, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return (await res.json()) as Ok<{ delivered: number; audience: string }>;
  } catch {
    return NETWORK_ERR;
  }
}
