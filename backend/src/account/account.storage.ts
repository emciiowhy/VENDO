import { putMedia, removeMedia } from "../media/media.store.js";

/**
 * Storage for owner Account imagery — the store logo and personal avatars —
 * via the shared durable media store (approved buffer → public URL), each kind
 * under its own `account/<kind>/` prefix.
 */
export type AccountImageKind = "logos" | "avatars";

/** Persist an approved image buffer under `account/<kind>/` and return its URL. */
export function putAccountImage(
  buffer: Buffer,
  contentType: string,
  kind: AccountImageKind,
): Promise<string> {
  return putMedia(`account/${kind}`, buffer, contentType);
}

/** Best-effort removal of a previously stored Account image (replace/delete). */
export function removeAccountImage(
  imageUrl: string | null | undefined,
  kind: AccountImageKind,
): Promise<void> {
  return removeMedia(`account/${kind}`, imageUrl);
}
