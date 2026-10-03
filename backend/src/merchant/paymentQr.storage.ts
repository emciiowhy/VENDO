import { putMedia, removeMedia } from "../media/media.store.js";

/**
 * Storage for owner-uploaded e-wallet checkout QR codes — the shared durable
 * media store (approved buffer → public URL) under a `payment-qrs/` prefix.
 */

/** Persist an approved QR image buffer and return its permanent public URL. */
export function putPaymentQr(buffer: Buffer, contentType: string): Promise<string> {
  return putMedia("payment-qrs", buffer, contentType);
}

/** Best-effort removal of a previously stored QR image (replace/delete). */
export function removePaymentQr(imageUrl: string | null | undefined): Promise<void> {
  return removeMedia("payment-qrs", imageUrl);
}
