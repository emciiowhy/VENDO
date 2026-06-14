/**
 * Client for the VendoPOS backend. The only call the landing page makes is the
 * Lead capture seam: POST /api/leads.
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";

export interface LeadPayload {
  name: string;
  businessName: string;
  email: string;
  phone: string;
  businessType: string;
  message?: string;
  /**
   * Optional. A prospect may choose their own owner password with the request,
   * so the team can approve them without issuing one. Sent only when set;
   * stored hashed server-side and never returned.
   */
  password?: string;
}

export type LeadResult =
  | { ok: true; lead: LeadPayload & { id: string; createdAt: string } }
  | { ok: false; errors?: Record<string, string>; error?: string };

export async function submitLead(payload: LeadPayload): Promise<LeadResult> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as LeadResult;
    return data;
  } catch {
    return {
      ok: false,
      error: "Could not reach the server. Please check your connection and try again.",
    };
  }
}
