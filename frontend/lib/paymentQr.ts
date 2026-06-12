/**
 * Client for owner-managed checkout QR codes (`/api/v1/merchant/payment-qrs`).
 * Store staff upload the real GCash / Maya / QRPH "scan to pay" images that the
 * POS then shows to customers. The secure session cookie rides along via
 * `credentials: "include"`; tenant scope is resolved server-side.
 */
import { API_BASE_URL } from "./api";

const BASE = `${API_BASE_URL}/api/v1/merchant/payment-qrs`;

export type QrMethod = "GCash" | "Maya" | "QRPH";
export const QR_METHODS: QrMethod[] = ["GCash", "Maya", "QRPH"];

/** Uploaded QR image URLs by method (null when the owner hasn't added one). */
export type PaymentQrMap = Record<QrMethod, string | null>;

type Result<T> = ({ ok: true } & T) | { ok: false; error?: string };

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

/** GET the tenant's method→URL map. */
export async function getPaymentQrs(): Promise<Result<{ qrs: PaymentQrMap }>> {
  try {
    return await readJson(await fetch(BASE, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

/** Upload (or replace) one rail's QR image. */
export async function uploadPaymentQr(
  method: QrMethod,
  file: File,
): Promise<Result<{ method: QrMethod; imageUrl: string }>> {
  try {
    const body = new FormData();
    body.append("qr", file);
    return await readJson(
      await fetch(`${BASE}/${method}`, { method: "POST", credentials: "include", body }),
    );
  } catch {
    return NETWORK_ERR;
  }
}

/** Remove one rail's QR image. */
export async function deletePaymentQr(method: QrMethod): Promise<Result<{ method: QrMethod }>> {
  try {
    return await readJson(
      await fetch(`${BASE}/${method}`, { method: "DELETE", credentials: "include" }),
    );
  } catch {
    return NETWORK_ERR;
  }
}
