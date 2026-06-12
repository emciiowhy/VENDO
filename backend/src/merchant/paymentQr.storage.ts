import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "../env.js";
import { UPLOADS_ROOT } from "../products/products.storage.js";

/**
 * Storage for owner-uploaded e-wallet checkout QR codes — the same local-disk
 * pipeline as product images (approved buffer → public URL; raw bytes never
 * touch Postgres), just under a separate `payment-qrs/` prefix. Swapping in a
 * real bucket means replacing the body of putPaymentQr; the contract stays
 * Buffer + contentType → public URL.
 */
const QR_DIR = join(UPLOADS_ROOT, "payment-qrs");

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

/** Persist an approved QR image buffer and return its permanent public URL. */
export async function putPaymentQr(buffer: Buffer, contentType: string): Promise<string> {
  const ext = EXT_BY_MIME[contentType.toLowerCase()];
  if (!ext) throw new Error("Unsupported image type.");
  const key = `${randomUUID()}.${ext}`;

  await mkdir(QR_DIR, { recursive: true });
  await writeFile(join(QR_DIR, key), buffer);

  return `${env.publicBaseUrl}/uploads/payment-qrs/${key}`;
}

/** Best-effort removal of a previously stored local QR image (replace/delete). */
export async function removePaymentQr(imageUrl: string | null | undefined): Promise<void> {
  if (!imageUrl) return;
  const prefix = `${env.publicBaseUrl}/uploads/payment-qrs/`;
  if (!imageUrl.startsWith(prefix)) return; // not ours (e.g. a cloud URL)
  const key = imageUrl.slice(prefix.length);
  if (!key || key.includes("/") || key.includes("..")) return; // guard traversal
  await rm(join(QR_DIR, key), { force: true }).catch(() => {});
}
