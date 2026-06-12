import { query } from "../db.js";

/**
 * Per-tenant e-wallet checkout QR codes. Every query is scoped by `tenantId`
 * (read from the verified session, never the request), so one store can only
 * ever read or change its own codes.
 */

/** The e-wallet rails that pop a scan-to-pay QR at checkout. */
export const QR_METHODS = ["GCash", "Maya", "QRPH"] as const;
export type QrMethod = (typeof QR_METHODS)[number];

export function isQrMethod(value: string): value is QrMethod {
  return (QR_METHODS as readonly string[]).includes(value);
}

/** A tenant's uploaded QR URLs keyed by method (null when none uploaded). */
export type PaymentQrMap = Record<QrMethod, string | null>;

const EMPTY_MAP: PaymentQrMap = { GCash: null, Maya: null, QRPH: null };

/** The full method→URL map for a tenant (missing rails come back as null). */
export async function getPaymentQrMap(tenantId: string): Promise<PaymentQrMap> {
  const { rows } = await query<{ method: string; image_url: string }>(
    `SELECT method, image_url FROM tenant_payment_qrs WHERE tenant_id = $1`,
    [tenantId],
  );
  const map: PaymentQrMap = { ...EMPTY_MAP };
  for (const r of rows) {
    if (isQrMethod(r.method)) map[r.method] = r.image_url;
  }
  return map;
}

/** The current QR URL for one method, or null — used to clean up on replace. */
export async function getPaymentQrUrl(
  tenantId: string,
  method: QrMethod,
): Promise<string | null> {
  const { rows } = await query<{ image_url: string }>(
    `SELECT image_url FROM tenant_payment_qrs WHERE tenant_id = $1 AND method = $2`,
    [tenantId, method],
  );
  return rows[0]?.image_url ?? null;
}

/** Upsert a method's QR image URL (re-upload replaces the prior row). */
export async function upsertPaymentQr(
  tenantId: string,
  method: QrMethod,
  imageUrl: string,
): Promise<void> {
  await query(
    `INSERT INTO tenant_payment_qrs (tenant_id, method, image_url, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (tenant_id, method)
     DO UPDATE SET image_url = EXCLUDED.image_url, updated_at = now()`,
    [tenantId, method, imageUrl],
  );
}

/** Remove a method's QR row; returns the URL that was removed (for file cleanup). */
export async function deletePaymentQr(
  tenantId: string,
  method: QrMethod,
): Promise<string | null> {
  const { rows } = await query<{ image_url: string }>(
    `DELETE FROM tenant_payment_qrs WHERE tenant_id = $1 AND method = $2 RETURNING image_url`,
    [tenantId, method],
  );
  return rows[0]?.image_url ?? null;
}
