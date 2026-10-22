"use client";

import { useRef, useState } from "react";
import { Icon } from "./Icon";
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, clampPage, pageCount, pageRange, pageSlice, pageWindow } from "@/lib/pagination";

/**
 * Numbered pagination bar — "26–50 of 140" over a progress track, a pill of
 * ‹ Prev 1 … 4 5 6 … 9 Next › (the "…" jumps 5 pages; phones get a compact
 * "3 / 9"), "Go to" for long lists, and an optional segmented rows-per-page
 * picker. Paging scrolls the list's top back into view. One component for every long list in the
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
  const navRef = useRef<HTMLElement>(null);
  const [jump, setJump] = useState("");
  const count = pageCount(total, pageSize);
  const current = clampPage(page, total, pageSize);
  if (count <= 1 && !alwaysShow && !onPageSize) return null;
  if (total === 0) return null;
  const { from, to } = pageRange(current, total, pageSize);
  const fmt = (n: number) => n.toLocaleString("en-PH");

  // Change page, then bring the top of the list back into view if it scrolled
  // away — paging from the bottom bar shouldn't leave you staring at row 25.
  function go(p: number) {
    const next = clampPage(p, total, pageSize);
    if (next === current) return;
    onPage(next);
    const list = navRef.current?.parentElement;
    if (list && list.getBoundingClientRect().top < 0) {
      list.style.scrollMarginTop = "88px";
      list.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const step =
    "inline-flex items-center justify-center gap-1 h-8 rounded-full text-[13px] font-semibold text-ink-soft transition duration-150 hover:bg-surface hover:text-ink hover:shadow-card active:scale-95 disabled:opacity-35 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50";

  return (
    <nav
      ref={navRef}
      aria-label="Pagination"
      className={"flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-3.5 border-t border-ink/8 " + className}
    >
      {/* Where you are: range + a slim progress track through the whole list. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 min-w-0">
        <div className="min-w-0">
          <div className="text-[12.5px] text-ink-soft whitespace-nowrap">
            <b className="text-ink font-bold tabular-nums">
              {fmt(from)}–{fmt(to)}
            </b>{" "}
            of <b className="text-ink font-bold tabular-nums">{fmt(total)}</b> {noun}
          </div>
          {count > 1 && (
            <div className="mt-1.5 h-1 w-full min-w-[96px] rounded-full bg-ink/8 overflow-hidden" aria-hidden="true">
              <div
                className="h-full rounded-full bg-brand-500 transition-[width] duration-300 ease-out"
                style={{ width: `${(to / total) * 100}%` }}
              />
            </div>
          )}
        </div>

        {onPageSize && (
          <div role="radiogroup" aria-label="Rows per page" className="inline-flex items-center p-0.5 rounded-full bg-paper hairline">
            {PAGE_SIZES.map((n) => {
              const on = n === pageSize;
              return (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  title={`${n} per page`}
                  onClick={() => !on && onPageSize(n)}
                  className={
                    "h-7 min-w-9 px-2.5 rounded-full text-[12px] font-semibold tabular-nums transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 " +
                    (on ? "bg-surface text-ink shadow-card" : "text-ink-faint hover:text-ink")
                  }
                >
                  {n}
                </button>
              );
            })}
            <span className="pl-1.5 pr-2.5 text-[11.5px] text-ink-faint hidden sm:inline">/ page</span>
          </div>
        )}
      </div>

      {count > 1 && (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 p-1 rounded-full bg-paper hairline">
            <button type="button" onClick={() => go(current - 1)} disabled={current <= 1} aria-label="Previous page" className={step + " pl-2 pr-3"}>
              <Icon name="chevron" className="w-4 h-4 rotate-90" strokeWidth={2} />
              <span className="hidden sm:inline">Prev</span>
            </button>

            {/* Phones: a compact "3 / 9"; wider screens: the numbered window. */}
            <span className="sm:hidden px-2 text-[13px] font-semibold tabular-nums text-ink" aria-live="polite">
              {current} <span className="text-ink-faint font-normal">/ {count}</span>
            </span>
            <div className="hidden sm:flex items-center gap-0.5">
              {pageWindow(current, count).map((p, i, all) => {
                if (p === "…") {
                  // A gap jumps 5 pages toward the side it sits on.
                  const back = i < all.indexOf(current);
                  const target = back ? current - 5 : current + 5;
                  return (
                    <button
                      key={`gap-${i}`}
                      type="button"
                      onClick={() => go(target)}
                      title={back ? "Back 5 pages" : "Forward 5 pages"}
                      aria-label={back ? "Back 5 pages" : "Forward 5 pages"}
                      className={step + " group w-8 text-ink-faint"}
                    >
                      <span className="group-hover:hidden">…</span>
                      <span className="hidden group-hover:inline text-[12px]">{back ? "«" : "»"}</span>
                    </button>
                  );
                }
                const on = p === current;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => go(p)}
                    aria-current={on ? "page" : undefined}
                    aria-label={`Page ${p}`}
                    className={
                      on
                        ? "inline-flex items-center justify-center h-8 min-w-8 px-2.5 rounded-full text-[13px] font-bold tabular-nums bg-brand-500 text-white shadow-btn"
                        : step + " min-w-8 px-2.5 tabular-nums"
                    }
                  >
                    {p}
                  </button>
                );
              })}
            </div>

            <button type="button" onClick={() => go(current + 1)} disabled={current >= count} aria-label="Next page" className={step + " pl-3 pr-2"}>
              <span className="hidden sm:inline">Next</span>
              <Icon name="chevron" className="w-4 h-4 -rotate-90" strokeWidth={2} />
            </button>
          </div>

          {/* Long lists: type a page number and press Enter. */}
          {count > 7 && (
            <form
              className="hidden md:flex items-center gap-1.5 text-[12px] text-ink-faint"
              onSubmit={(e) => {
                e.preventDefault();
                const n = Number(jump);
                if (Number.isFinite(n) && n >= 1) go(n);
                setJump("");
              }}
            >
              <label htmlFor={`${noun}-jump`}>Go to</label>
              <input
                id={`${noun}-jump`}
                inputMode="numeric"
                value={jump}
                onChange={(e) => setJump(e.target.value.replace(/\D/g, "").slice(0, 5))}
                placeholder={String(current)}
                className="field-input w-12 h-8 rounded-full px-2 text-center text-[12.5px] tabular-nums"
              />
            </form>
          )}
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
