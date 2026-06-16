"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../Icon";
import { useTheme } from "../theme/ThemeProvider";
import {
  clockIn as apiClockIn,
  clockOut as apiClockOut,
  getClockStatus,
  formatClock,
  formatMinutes,
  type ClockStatus,
} from "@/lib/timecard";

/**
 * The on-the-floor shift-clock utility for the POS terminal. A compact header
 * pill shows the operator's live status; tapping it opens a focused sheet to
 * punch in or out.
 *
 * Hydration discipline: the live duration is NEVER seeded from a clock inside a
 * state initializer (server and client would disagree and React would warn).
 * `nowMs` starts null — a deterministic placeholder — and is set, then ticked,
 * strictly inside a post-mount effect that only runs while clocked in. Open
 * state is owned by the parent so the terminal can suspend the global barcode
 * wedge while the sheet is up (a stray scan can't ring a hidden cart).
 */
export function ClockWidget({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { theme } = useTheme();
  const [status, setStatus] = useState<ClockStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const res = await getClockStatus();
    if (res.ok) {
      setStatus({ timecard: res.timecard, todayMinutes: res.todayMinutes });
      setError(null);
    } else {
      setError(res.error ?? "Could not read your clock.");
    }
    setLoaded(true);
  }, []);

  // Initial load. Inlined (rather than calling `refresh`) so the await is
  // lexically visible — the set-state-in-effect lint forbids invoking a
  // setState-bearing helper synchronously from an effect body.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getClockStatus();
      if (!alive) return;
      if (res.ok) {
        setStatus({ timecard: res.timecard, todayMinutes: res.todayMinutes });
        setError(null);
      } else {
        setError(res.error ?? "Could not read your clock.");
      }
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const active = status?.timecard ?? null;

  // Tick once per second while on the clock. `nowMs` stays null until the first
  // timer callback fires (a deferred external-system update, never a synchronous
  // setState in the effect body), so the first client render matches the
  // server's null clock — no hydration mismatch.
  useEffect(() => {
    if (!active) return;
    const seed = window.setTimeout(() => setNowMs(Date.now()), 0);
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => {
      window.clearTimeout(seed);
      window.clearInterval(id);
    };
  }, [active]);

  // Close the sheet on Escape, matching every other register overlay.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const elapsedSeconds =
    active && nowMs !== null ? Math.max(0, Math.floor((nowMs - Date.parse(active.clockIn)) / 1000)) : null;
  const elapsedMinutes = elapsedSeconds !== null ? elapsedSeconds / 60 : active?.durationMinutes ?? 0;

  const doClockIn = useCallback(async () => {
    setBusy(true);
    setError(null);
    const res = await apiClockIn();
    setBusy(false);
    if (res.ok) await refresh();
    else {
      setError(res.error ?? "Could not clock you in.");
      await refresh(); // a 409 means we're already on the clock — reflect the truth
    }
  }, [refresh]);

  const doClockOut = useCallback(async () => {
    setBusy(true);
    setError(null);
    const res = await apiClockOut();
    setBusy(false);
    if (res.ok) await refresh();
    else {
      setError(res.error ?? "Could not clock you out.");
      await refresh();
    }
  }, [refresh]);

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        title="Shift clock — clock in / out"
        aria-label="Shift clock"
        className={
          "inline-flex items-center gap-1.5 rounded-[10px] hairline px-3 py-2 text-[13px] font-semibold transition duration-150 " +
          (active
            ? "bg-accent-50 text-accent-600 hover:border-accent-200"
            : "bg-surface text-ink-soft hover:text-brand-600 hover:border-brand-200")
        }
      >
        {active ? (
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-accent-500 opacity-60 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-500" />
          </span>
        ) : (
          <Icon name="clock" className="w-[18px] h-[18px]" strokeWidth={1.7} />
        )}
        <span className="hidden lg:inline tabular-nums">
          {!loaded ? "Clock" : active ? `On the clock · ${formatMinutes(elapsedMinutes)}` : "Clock in"}
        </span>
      </button>

      {open &&
        createPortal(
          // Portal to <body> so this fixed overlay escapes the POS header's
          // .glass (backdrop-filter) containing block. Left as a header
          // descendant it gets clamped to the ~60px lock bar and its card bleeds
          // down across the search/category row. The theme class + base text-ink
          // are carried in so tokens resolve outside the app-shell root (mirrors
          // PinSwitcher).
          <div className={"text-ink " + (theme === "dark" ? "dark" : "")}>
            <div
              className="fixed inset-0 z-[120] grid place-items-center px-5"
              role="dialog"
              aria-modal="true"
              aria-label="Shift clock"
            >
          <button
            type="button"
            aria-label="Close"
            onClick={() => onOpenChange(false)}
            className="absolute inset-0 glass overlay-backdrop"
          />
          <div className="relative w-full max-w-[400px] overflow-hidden rounded-xl2 bg-surface hairline shadow-soft overlay-card">
            <div className="flex items-center justify-between px-6 py-4 hairline-b">
              <h3 className="text-[1.15rem] font-extrabold tracking-tightest flex items-center gap-2">
                <Icon name="clock" className="w-5 h-5 text-brand-600" strokeWidth={1.8} />
                Shift clock
              </h3>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Close"
                className="text-ink-faint hover:text-ink transition p-1"
              >
                <Icon name="x" className="w-5 h-5" strokeWidth={1.8} />
              </button>
            </div>

            <div className="px-6 py-6 space-y-5">
              {/* Live status face */}
              <div className="rounded-[14px] bg-paper hairline px-5 py-6 text-center">
                {active ? (
                  <>
                    <div className="inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-accent-600">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-accent-500 opacity-60 animate-ping" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-500" />
                      </span>
                      On the clock
                    </div>
                    <div className="mt-2 text-[2.4rem] leading-none font-extrabold tracking-tightest tabular-nums text-ink">
                      {elapsedSeconds !== null ? formatClock(elapsedSeconds) : "—"}
                    </div>
                    <div className="mt-2 text-[12.5px] text-ink-soft">
                      Clocked in at{" "}
                      {new Date(active.clockIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-[12px] font-bold uppercase tracking-wide text-ink-faint">Off the clock</div>
                    <div className="mt-2 text-[2.4rem] leading-none font-extrabold tracking-tightest tabular-nums text-ink-faint">
                      00:00:00
                    </div>
                    <div className="mt-2 text-[12.5px] text-ink-soft">Punch in to start tracking your hours.</div>
                  </>
                )}
              </div>

              <div className="flex items-center justify-between rounded-[10px] bg-paper hairline px-4 py-2.5 text-[13px]">
                <span className="font-semibold text-ink-soft">Worked today</span>
                <span className="font-bold tabular-nums">{formatMinutes(status?.todayMinutes ?? 0)}</span>
              </div>

              {error && (
                <p className="text-[12.5px] font-semibold text-rose-600 flex items-center gap-1.5">
                  <Icon name="ban" className="w-[15px] h-[15px]" strokeWidth={1.8} />
                  {error}
                </p>
              )}

              {active ? (
                <button
                  type="button"
                  onClick={() => void doClockOut()}
                  disabled={busy}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-[10px] bg-rose-500 hover:bg-rose-600 py-3.5 font-semibold text-white shadow-btn tracking-tight transition duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Icon name="check" className="w-[18px] h-[18px]" strokeWidth={1.9} />
                  {busy ? "Clocking out…" : "Clock out"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void doClockIn()}
                  disabled={busy || !loaded}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-[10px] bg-brand-500 hover:bg-brand-600 py-3.5 font-semibold text-white shadow-btn tracking-tight transition duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Icon name="bolt" className="w-[18px] h-[18px]" strokeWidth={1.9} />
                  {busy ? "Clocking in…" : "Clock in"}
                </button>
              )}

              <p className="text-[11.5px] text-ink-faint flex items-start gap-1.5">
                <Icon name="shield" className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={1.7} />
                Your hours are logged to your own record only. See the full history under “My record”.
              </p>
            </div>
          </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
