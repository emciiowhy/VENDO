import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "../env.js";
import { UPLOADS_ROOT } from "../products/products.storage.js";

/**
 * Storage for owner Account imagery — the store logo and personal avatars —
 * reusing the same local-disk pipeline as product images (approved buffer →
 * public URL; raw bytes never touch Postgres). Each kind lives under its own
 * prefix. Swapping in a real bucket means replacing the body of putAccountImage;
 * the contract (Buffer + contentType → public URL) stays identical.
 */
export type AccountImageKind = "logos" | "avatars";

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

/** Persist an approved image buffer under `account/<kind>/` and return its URL. */
export async function putAccountImage(
  buffer: Buffer,
  contentType: string,
  kind: AccountImageKind,
): Promise<string> {
  const ext = EXT_BY_MIME[contentType.toLowerCase()];
  if (!ext) throw new Error("Unsupported image type.");
  const key = `${randomUUID()}.${ext}`;
  const dir = join(UPLOADS_ROOT, "account", kind);

  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, key), buffer);

  return `${env.publicBaseUrl}/uploads/account/${kind}/${key}`;
}

/** Best-effort removal of a previously stored local Account image (replace/delete). */
export async function removeAccountImage(
  imageUrl: string | null | undefined,
  kind: AccountImageKind,
): Promise<void> {
  if (!imageUrl) return;
  const prefix = `${env.publicBaseUrl}/uploads/account/${kind}/`;
  if (!imageUrl.startsWith(prefix)) return; // not ours (e.g. a cloud URL)
  const key = imageUrl.slice(prefix.length);
  if (!key || key.includes("/") || key.includes("..")) return; // guard traversal
  await rm(join(UPLOADS_ROOT, "account", kind, key), { force: true }).catch(() => {});
}
