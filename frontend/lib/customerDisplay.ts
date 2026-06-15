/**
 * Contract for the dual-screen Customer-Facing Display.
 *
 * The cashier pad publishes a full cart snapshot over a same-origin
 * BroadcastChannel; the `/pos/customer-display` view subscribes and mirrors it.
 * BroadcastChannel is scoped to a single browser/origin, so the sync is
 * inherently isolated to the active terminal node — no server round-trip, no
 * cross-terminal leakage. Money is integer centavos on the wire.
 */
export const DISPLAY_CHANNEL = "vendopos-customer-display";

export type DisplayStatus = "idle" | "active" | "payment" | "paid";

/** E-wallet rails that pop the QR presentation sheet on the customer screen. */
export type EwalletMethod = "GCash" | "Maya" | "QRPH";

export interface DisplayLine {
  id: string;
  name: string;
  qty: number;
  unitCents: number;
  lineCents: number;
  /** Raw product image reference (resolved to a URL on the display), or null. */
  imageUrl: string | null;
}

export interface DisplaySnapshot {
  storeName: string;
  /** The store's brand accent (#rrggbb) so the second screen matches; null = default. */
  accent: string | null;
  status: DisplayStatus;
  lines: DisplayLine[];
  grossCents: number;
  discountCents: number;
  discountLabel: string | null;
  vatCents: number;
  netCents: number;
  count: number;
  /**
   * Present while an e-wallet checkout is staged → drives the QR sheet.
   * `qrUrl` is the owner-uploaded scan-to-pay image for this rail, or null to
   * fall back to the placeholder QR.
   */
  payment: { method: EwalletMethod; netCents: number; qrUrl: string | null } | null;
  /** Present right after a sale commits → drives the thank-you screen. */
  paid: { totalCents: number; method: string; reference: string | null; changeCents: number | null } | null;
}

export const IDLE_SNAPSHOT: DisplaySnapshot = {
  storeName: "VendoPOS",
  accent: null,
  status: "idle",
  lines: [],
  grossCents: 0,
  discountCents: 0,
  discountLabel: null,
  vatCents: 0,
  netCents: 0,
  count: 0,
  payment: null,
  paid: null,
};
