import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "../env.js";

/**
 * Product image storage pipeline.
 *
 * Approved buffers are streamed to an object store and only the resulting
 * public URL is ever persisted on the row — raw bytes never touch Postgres.
 *
 * The default provider here writes to a local `uploads/` directory served
 * statically by Express, so the whole flow works out of the box in dev with no
 * external credentials. Swapping in a real bucket (Supabase Storage, S3,
 * Cloudinary) is a matter of replacing the body of {@link putProductImage}
 * with a client call that returns the bucket's public URL — the contract
 * (Buffer + contentType → public URL string) stays identical, so nothing
 * upstream changes.
 */

/** Absolute root of the static uploads tree; app.ts serves this at /uploads. */
export const UPLOADS_ROOT = join(process.cwd(), "uploads");
const PRODUCTS_DIR = join(UPLOADS_ROOT, "products");

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

/**
 * Persist an approved image buffer and return its permanent public URL.
 * `contentType` has already been constrained to `image/*` by the upload
 * middleware; we still map it to a known extension and reject the rest.
 */
export async function putProductImage(buffer: Buffer, contentType: string): Promise<string> {
  const ext = EXT_BY_MIME[contentType.toLowerCase()];
  if (!ext) {
    throw new Error("Unsupported image type.");
  }
  const key = `${randomUUID()}.${ext}`;

  await mkdir(PRODUCTS_DIR, { recursive: true });
  await writeFile(join(PRODUCTS_DIR, key), buffer);

  return `${env.publicBaseUrl}/uploads/products/${key}`;
}

/**
 * Best-effort removal of a previously stored local image (e.g. when a product
 * is deleted or its image replaced). No-op for URLs we don't own, so it's safe
 * to call on cloud-hosted URLs once a real bucket is wired in.
 */
export async function removeProductImage(imageUrl: string | null | undefined): Promise<void> {
  if (!imageUrl) return;
  const prefix = `${env.publicBaseUrl}/uploads/products/`;
  if (!imageUrl.startsWith(prefix)) return;
  const key = imageUrl.slice(prefix.length);
  if (!key || key.includes("/") || key.includes("..")) return; // guard traversal
  await rm(join(PRODUCTS_DIR, key), { force: true }).catch(() => {});
}
