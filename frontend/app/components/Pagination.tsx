"use client";

import { useState } from "react";
import { Icon } from "./Icon";
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, clampPage, pageCount, pageRange, pageSlice, pageWindow } from "@/lib/pagination";

/**
 * Numbered pagination bar — "Showing 26–50 of 140" with ‹ 1 … 4 5 6 … 9 › and
 * an optional rows-per-page picker. One component for every long list in the
 * app (merchant and admin), styled with the shared tokens so it follows the
 * store theme and dark mode. Renders nothing for a list that fits on one page
 * unless `alwaysShow` is set.
 */
export function Pagination({
  page,
  total,
  pageSize,
  onPage,
  onPageSize,
  noun = "rows",
  alwaysShow = false,
  className = "",
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  /** Show the rows-per-page picker when provided. */
  onPageSize?: (size: number) => void;
  /** What is being counted, e.g. "products". */
  noun?: string;
  alwaysShow?: boolean;
  className?: string;
}) {
  const count = pageCount(total, pageSize);
  const current = clampPage(page, total, pageSize);
  if (count <= 1 && !alwaysShow && !onPageSize) return null;
  if (total === 0) return null;
  const { from, to } = pageRange(current, total, pageSize);

  const btn =
    "grid place-items-center min-w-8 h-8 px-2 rounded-[8px] text-[13px] font-semibold tabular-nums transition duration-150 disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <nav
      aria-label="Pagination"
      className={"flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-ink/8 " + className}
    >
      <div className="flex items-center gap-3 text-[12.5px] text-ink-soft">
        <span>
          Showing <b className="text-ink tabular-nums">{from.toLocaleString("en-PH")}</b>–
          <b className="text-ink tabular-nums">{to.toLocaleString("en-PH")}</b> of{" "}
          <b className="text-ink tabular-nums">{total.toLocaleString("en-PH")}</b> {noun}
        </span>
        {onPageSize && (
          <label className="inline-flex items-center gap-1.5">
            <span className="sr-only">Rows per page</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSize(Number(e.target.value))}
              className="field-input rounded-[8px] px-2 py-1 text-[12.5px]"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {count > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPage(current - 1)}
            disabled={current <= 1}
            aria-label="Previous page"
            className={btn + " text-ink-soft hover:bg-paper hover:text-ink"}
          >
            <Icon name="chevron" className="w-4 h-4 rotate-90" strokeWidth={2} />
          </button>
          {pageWindow(current, count).map((p, i) =>
            p === "…" ? (
              <span key={`gap-${i}`} className="px-1 text-[13px] text-ink-faint" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPage(p)}
                aria-current={p === current ? "page" : undefined}
                aria-label={`Page ${p}`}
                className={
                  btn +
                  (p === current ? " bg-brand-500 text-white shadow-btn" : " text-ink-soft hover:bg-paper hover:text-ink")
                }
              >
                {p}
              </button>
            ),
          )}
          <button
            type="button"
            onClick={() => onPage(current + 1)}
            disabled={current >= count}
            aria-label="Next page"
            className={btn + " text-ink-soft hover:bg-paper hover:text-ink"}
          >
            <Icon name="chevron" className="w-4 h-4 -rotate-90" strokeWidth={2} />
          </button>
        </div>
      )}
    </nav>
  );
}

/**
 * Client-side paging for a list already in memory (filtered/sorted by the
 * caller). `resetKey` — e.g. the search text — sends the list back to page 1
 * when it changes, without a state-in-effect reset.
 */
export function usePagination<T>(items: readonly T[], resetKey: unknown = null, initialPageSize = DEFAULT_PAGE_SIZE) {
  const [state, setState] = useState<{ key: unknown; page: number }>({ key: resetKey, page: 1 });
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const rawPage = Object.is(state.key, resetKey) ? state.page : 1;
  const page = clampPage(rawPage, items.length, pageSize);
  return {
    page,
    pageSize,
    total: items.length,
    pageItems: pageSlice(items, page, pageSize),
    setPage: (p: number) => setState({ key: resetKey, page: p }),
    setPageSize: (n: number) => {
      setPageSizeState(n);
      setState({ key: resetKey, page: 1 });
    },
  };
}
