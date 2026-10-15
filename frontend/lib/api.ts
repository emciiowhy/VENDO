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

export type VerifyEmailResult = { ok: true } | { ok: false; error?: string };

/**
 * Confirm a prospect owns their email. The verification link in the demo-request
 * email lands on the frontend /verify-email page, which posts the raw token here.
 */
export async function verifyLeadEmail(token: string): Promise<VerifyEmailResult> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/leads/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    return (await res.json()) as VerifyEmailResult;
  } catch {
    return { ok: false, error: "Could not reach the server. Please try again." };
  }
}

/**
 * The Enterprise concierge intake. Distinct from the demo lead: Enterprise never
 * self-serves a trial, so this funnel captures the extra operational detail a rep
 * needs to scope the 1-on-1 consultation and the in-person multi-location rollout.
 * On success the backend has persisted the lead and dispatched an internal admin
 * alert carrying these details (see POST /api/leads/enterprise).
 */
export interface EnterpriseInquiryPayload {
  name: string;
  businessName: string;
  email: string;
  phone: string;
  /** Free-text scale of the operation, e.g. "6–10 branches". */
  locations: string;
  currentSystem?: string;
  message?: string;
}

export type EnterpriseInquiryResult =
  | { ok: true; lead: { id: string; createdAt: string }; mailDelivered: boolean }
  | { ok: false; errors?: Record<string, string>; error?: string };

export async function submitEnterpriseInquiry(
  payload: EnterpriseInquiryPayload,
): Promise<EnterpriseInquiryResult> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/leads/enterprise`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return (await res.json()) as EnterpriseInquiryResult;
  } catch {
    return {
      ok: false,
      error: "Could not reach the server. Please check your connection and try again.",
    };
  }
}

/**
 * The Calendly scheduling link the Enterprise concierge books the mandatory
 * 1-on-1 Zoom consultation against. Surfaced as a constant so the in-app booking
 * page (/enterprise/book) can read it to initialise the embedded widget; override
 * per-environment via NEXT_PUBLIC_ENTERPRISE_BOOKING_URL.
 */
export const ENTERPRISE_BOOKING_URL =
  process.env.NEXT_PUBLIC_ENTERPRISE_BOOKING_URL ??
  "https://calendly.com/mcmcyap07/30min";
