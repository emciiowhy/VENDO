"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { formatDate } from "@/lib/format";
import { getSubscribers, type Subscriber } from "@/lib/adminAnalytics";
import { impersonateTenant } from "@/lib/auth";

/**
 * Right-anchored drill-down drawer for the live subscriber register. Opened from
 * the "Active Subscribers" KPI; lists every Tenant with its owner's contact
 * details, plan tier, onboarding date and operational status. Fetches on open
 * (setState after await, alive-guarded — never synchronously in the effect).
 */

const PLAN_BADGE: Record<string, string> = {
  starter: "bg-paper text-ink-soft hairline",
  business: "bg-brand-50 text-brand-700",
  enterprise: "bg-accent-50 text-accent-600",
};
const PLAN_LABEL: Record<string, string> = {
  starter: "Starter",
  business: "Business",
  enterprise: "Enterprise",
};
const STATUS_STYLE: Record<string, string> = {
  active: "text-accent-600 bg-accent-50",
  suspended: "text-rose-600 bg-rose-50",
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: Subscriber[] };

export function SubscribersDrawer({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<State>({ status: "loading" });
  // The store currently being opened, plus the id of any row whose open failed.
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState<{ id: string; message: string } | null>(null);

  // Mint an owner session for this Tenant and hard-navigate into its dashboard.
  // A full navigation (not router.push) is required so the swapped session cookie
  // and the reset useSession cache both take effect for the new identity.
  async function openOwnerDashboard(s: Subscriber) {
    setOpenError(null);
    setOpening(s.id);
    const res = await impersonateTenant(s.id);
    if (res.ok) {
      window.location.assign(res.redirectTo);
      return; // navigating away — leave the spinner up
    }
    setOpenError({ id: s.id, message: res.error });
    setOpening(null);
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getSubscribers();
      if (!alive) return;
      if (res.ok) setState({ status: "ready", rows: res.subscribers });
      else setState({ status: "error", message: res.error ?? "Could not load subscribers." });
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Esc closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const count = state.status === "ready" ? state.rows.length : null;

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Subscriber directory">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] overlay-backdrop"
      />
      <aside className="slide-over absolute right-0 inset-y-0 w-full max-w-[460px] bg-surface hairline-l shadow-soft flex flex-col">
        <div className="shrink-0 flex items-center justify-between px-5 sm:px-6 py-4 hairline-b">
          <div>
            <h3 className="text-[1.15rem] font-extrabold tracking-tightest flex items-center gap-2">
              <Icon name="store" className="w-[18px] h-[18px] text-brand-600" strokeWidth={1.8} />
              Subscribers
            </h3>
            <p className="text-[12.5px] text-ink-soft">
              {count !== null ? `${count} live storefront${count === 1 ? "" : "s"}` : "Loading register…"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid place-items-center w-9 h-9 rounded-[10px] text-ink-soft hover:text-ink hover:bg-paper transition duration-150"
          >
            <Icon name="x" className="w-5 h-5" strokeWidth={1.8} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-4">
          {state.status === "loading" ? (
            <div className="space-y-3 animate-pulse">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-[82px] rounded-xl2 bg-paper hairline" />
              ))}
            </div>
          ) : state.status === "error" ? (
            <p className="py-12 text-center text-[13.5px] text-rose-600">{state.message}</p>
          ) : state.rows.length === 0 ? (
            <p className="py-12 text-center text-[13.5px] text-ink-soft">No subscribers yet.</p>
          ) : (
            <div className="space-y-2.5">
              {state.rows.map((s) => (
                <div key={s.id} className="rounded-xl2 bg-paper hairline p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold tracking-tight truncate">{s.name}</div>
                      <div className="text-[12px] text-ink-faint font-mono truncate">{s.slug ?? "—"}</div>
                    </div>
                    <span
                      className={
                        "shrink-0 inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-tight " +
                        (PLAN_BADGE[s.plan] ?? "bg-paper text-ink-soft hairline")
                      }
                    >
                      {PLAN_LABEL[s.plan] ?? s.plan}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center gap-2.5">
                    <span className="grid place-items-center w-8 h-8 rounded-full bg-ink dark:bg-[#0b1220] text-white text-[12px] font-bold shrink-0">
                      {initials(s.ownerName)}
                    </span>
                    <div className="min-w-0 leading-tight">
                      <div className="text-[13px] font-semibold truncate">{s.ownerName ?? "—"}</div>
                      <div className="text-[12px] text-ink-soft truncate">{s.ownerEmail ?? "No owner contact"}</div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[12px]">
                    <span className="text-ink-faint">Onboarded {formatDate(s.createdAt)}</span>
                    <span
                      className={
                        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-bold tracking-tight " +
                        (STATUS_STYLE[s.status] ?? "text-ink-soft bg-paper hairline")
                      }
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      {s.status}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => void openOwnerDashboard(s)}
                    disabled={opening === s.id || !s.ownerEmail}
                    className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-[10px] bg-ink dark:bg-[#0b1220] text-white font-semibold text-[13px] py-2.5 hover:opacity-90 transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Icon name="eye" className="w-4 h-4" strokeWidth={1.8} />
                    {opening === s.id
                      ? "Opening…"
                      : s.ownerEmail
                        ? "Open owner dashboard"
                        : "No owner to open"}
                  </button>
                  {openError?.id === s.id && (
                    <p className="mt-2 text-[12px] font-semibold text-rose-600">{openError.message}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 px-5 sm:px-6 py-3 hairline-t">
          <p className="text-[11.5px] leading-relaxed text-ink-faint">
            <span className="font-semibold text-ink-soft">Open owner dashboard</span> signs you in as
            that store’s owner for support. To return to the platform console, sign out and sign back
            in as the admin.
          </p>
        </div>
      </aside>
    </div>
  );
}

function initials(name: string | null): string {
  if (!name) return "—";
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "—"
  );
}
