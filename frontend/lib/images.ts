import { API_BASE_URL } from "./api";

/**
 * Resolve a stored product image reference to a fully-qualified URL the browser
 * can load. Backend rows hold an absolute URL built from PUBLIC_BASE_URL, but
 * we defend against rows that stored a relative `/uploads/...` path by
 * prefixing the API origin. Returns null when there's nothing to show, so
 * callers fall back to the monochrome icon frame.
 */
export function resolveAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url) || url.startsWith("data:") || url.startsWith("blob:")) {
    return url;
  }
  return `${API_BASE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}
