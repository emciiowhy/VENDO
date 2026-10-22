/**
 * Server-side pagination for lists that grow without bound (activity logs,
 * audit trails, sales, stock movements, leads). One parser so every endpoint
 * reads `?page=&pageSize=` the same way and nothing unsafe reaches SQL: both
 * are whole numbers, page ≥ 1, page size capped. Responses carry `total` so the
 * UI can show "Showing 26–50 of 140" and numbered pages.
 */

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export interface Paging {
  page: number;
  pageSize: number;
  offset: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function parsePaging(q: Record<string, unknown>, defaultSize = DEFAULT_PAGE_SIZE): Paging {
  const int = (v: unknown) => (typeof v === "string" && /^\d{1,6}$/.test(v) ? Number(v) : NaN);
  const rawPage = int(q.page);
  const rawSize = int(q.pageSize);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;
  const pageSize = Number.isFinite(rawSize) && rawSize >= 1 ? Math.min(rawSize, MAX_PAGE_SIZE) : defaultSize;
  return { page, pageSize, offset: (page - 1) * pageSize };
}
