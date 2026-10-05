"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "./Icon";
import { useTheme } from "./theme/ThemeProvider";

/**
 * A centered, read-in-full popup for a single notification or live-activity
 * event — so a message that's clipped in the bell dropdown or the activity
 * ticker can be read clearly. Shared by the NotificationBell (every role) and
 * the Super Admin System Health ticker. Portaled to <body> with the theme class
 * carried in (like ConfirmDialog) so dark tokens resolve outside the shell; Esc
 * or backdrop closes. When the item points somewhere, a "Go there" action
 * navigates; otherwise it's Close only.
 */

export type DetailSeverity = "info" | "success" | "warning" | "danger";

export interface DetailView {
  severity: DetailSeverity;
  title: string;
  body?: string | null;
  /** ISO timestamp the event occurred. */
  at: string;
  /** A frontend route to open, or null when the item isn't actionable. */
  link?: string | null;
}

const SEVERITY: Record<DetailSeverity, { icon: IconName; chip: string }> = {
  info: { icon: "bell", chip: "bg-brand-50 text-brand-600" },
  success: { icon: "check", chip: "bg-accent-50 text-accent-600" },
  warning: { icon: "activity", chip: "bg-amber-50 text-amber-600" },
  danger: { icon: "shield", chip: "bg-rose-50 text-rose-600" },
};

export function NotificationDetail({
  view,
  onClose,
  onGoThere,
}: {
  view: DetailView;
  onClose: () => void;
  onGoThere?: (link: string) => void;
}) {
  const { theme } = useTheme();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const sev = SEVERITY[view.severity];
  const canGo = Boolean(view.link && onGoThere);

  return createPortal(
    <div className={"text-ink " + (theme === "dark" ? "dark" : "")}>
      <div
        className="fixed inset-0 z-[125] grid place-items-center px-5"
        role="dialog"
        aria-modal="true"
        aria-label={view.title}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute inset-0 bg-black/45 backdrop-blur-sm overlay-backdrop"
        />
        <div className="relative w-full max-w-[420px] rounded-xl2 bg-surface hairline shadow-soft p-6 overlay-card">
          <div className="flex items-start gap-3">
            <span className={"grid place-items-center w-11 h-11 rounded-[12px] shrink-0 " + sev.chip}>
              <Icon name={sev.icon} className="w-5 h-5" strokeWidth={1.8} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-[1.1rem] font-extrabold tracking-tight leading-snug break-words">
                {view.title}
              </h3>
              <p className="mt-1 text-cap text-ink-faint tabular-nums">{formatWhen(view.at)}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-ink-faint hover:text-ink transition p-1 -mt-1 -mr-1 shrink-0"
            >
              <Icon name="x" className="w-5 h-5" strokeWidth={1.8} />
            </button>
          </div>

          {view.body && (
            <p className="mt-4 text-note text-ink-soft leading-relaxed break-words whitespace-pre-line">
              {view.body}
            </p>
          )}

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-[10px] text-[14px] font-semibold text-ink-soft hover:bg-paper transition duration-150"
            >
              Close
            </button>
            {canGo && (
              <button
                type="button"
                onClick={() => onGoThere!(view.link!)}
                className="inline-flex items-center gap-2 text-white font-semibold text-[14px] px-5 py-2.5 rounded-[10px] bg-brand-500 hover:bg-brand-600 shadow-btn tracking-tight transition duration-150"
              >
                Go there
                <Icon name="arrow" className="w-4 h-4" strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Full, readable timestamp: "Oct 6, 2026 · 2:34 PM". */
function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
