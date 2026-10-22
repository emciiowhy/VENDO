/**
 * Numbered pagination maths — pure, so the backend test suite holds it to its
 * expected behaviour (frontendParity.test.ts loads this file directly).
 *
 * Numbered pages (‹ 1 2 … 9 ›) are the pattern for VendoPOS records: products,
 * transactions, attendance, employees and logs, where people need to jump to a
 * page and keep their place — unlike "load more" or infinite scroll.
 */

export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZES = [10, 25, 50, 100] as const;

/** Number of pages for `total` items (always at least 1). */
export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)));
}

/** Keep a page number within 1…pageCount. */
export function clampPage(page: number, total: number, pageSize: number): number {
  const n = Number.isFinite(page) ? Math.floor(page) : 1;
  return Math.min(Math.max(1, n), pageCount(total, pageSize));
}

/** The 1-based range shown, e.g. { from: 26, to: 50 } — { 0, 0 } when empty. */
export function pageRange(page: number, total: number, pageSize: number): { from: number; to: number } {
  if (total <= 0) return { from: 0, to: 0 };
  const p = clampPage(page, total, pageSize);
  return { from: (p - 1) * pageSize + 1, to: Math.min(total, p * pageSize) };
}

/** The items on one page of an in-memory list. */
export function pageSlice<T>(items: readonly T[], page: number, pageSize: number): T[] {
  const p = clampPage(page, items.length, pageSize);
  return items.slice((p - 1) * pageSize, p * pageSize);
}

/**
 * The page buttons to show: always the first and last page, the current page
 * and its neighbours, with "…" for the gaps. At most 7 slots, so the bar never
 * wraps on a phone. e.g. page 6 of 20 → [1, "…", 5, 6, 7, "…", 20].
 */
export function pageWindow(current: number, count: number): (number | "…")[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const c = Math.min(Math.max(1, current), count);
  if (c <= 4) return [1, 2, 3, 4, 5, "…", count];
  if (c >= count - 3) return [1, "…", count - 4, count - 3, count - 2, count - 1, count];
  return [1, "…", c - 1, c, c + 1, "…", count];
}
