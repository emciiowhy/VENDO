import { putMedia, removeMedia } from "../media/media.store.js";

/**
 * Product image storage. Approved buffers go to the shared durable media store
 * (see media/media.store.ts) and only the resulting public URL is persisted on
 * the product row. Swapping in a real bucket (S3, Cloudinary) means replacing
 * the media store; the contract (Buffer + contentType → public URL) stays.
 */
export { UPLOADS_ROOT } from "../media/media.store.js";

/** Persist an approved image buffer and return its permanent public URL. */
export function putProductImage(buffer: Buffer, contentType: string): Promise<string> {
  return putMedia("products", buffer, contentType);
}

/** Best-effort removal of a previously stored image (product deleted/replaced). */
export function removeProductImage(imageUrl: string | null | undefined): Promise<void> {
  return removeMedia("products", imageUrl);
}
