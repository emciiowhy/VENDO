"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";

const DISMISS_KEY = "vendopos_promo_dismissed";

/**
 * Slim, dismissible promo bar above the nav. It surfaces the REAL first-purchase
 * campaign — the single `FIRST_PURCHASE_PROMO` source lives in `page.tsx` and is
 * passed in, so we never invent an offer. Dismissal persists in localStorage.
 *
 * Renders nothing on the server and the first client render, then reveals after
 * mount once localStorage has been read — a returning visitor who dismissed it
 * never sees a flash, and there's no hydration mismatch (same approach as
 * ThemeProvider).
 */
export function AnnounceBar({ promo }: { promo: boolean }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!promo) return;
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* private mode / disabled storage */
    }
    setShow(true);
  }, [promo]);

  if (!promo || !show) return null;

  function dismiss() {
    setShow(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="relative bg-ink text-paper">
      <div className="mx-auto max-w-[1160px] px-6">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 py-2.5 pr-8 text-center">
          <span className="inline-flex items-center gap-2 text-[13px] font-semibold tracking-tight">
            <Icon name="bolt" className="w-4 h-4 text-brand-200" strokeWidth={1.8} />
            First-time buyer — 20% off your first 3 months.
          </span>
          <a
            href="#pricing"
            className="press inline-flex items-center gap-1 text-[13px] font-bold text-brand-200 hover:text-paper transition duration-150"
          >
            See pricing
            <Icon name="arrow" className="w-[15px] h-[15px]" strokeWidth={2} />
          </a>
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss announcement"
        className="press absolute right-2 top-1/2 -translate-y-1/2 grid place-items-center w-9 h-9 rounded-[8px] text-paper/70 hover:text-paper hover:bg-white/10 transition duration-150"
      >
        <Icon name="x" className="w-[18px] h-[18px]" strokeWidth={1.8} />
      </button>
    </div>
  );
}
