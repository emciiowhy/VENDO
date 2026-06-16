"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { getMyTimecards, formatClock, formatMinutes, type MyTimecards, type Timecard } from "@/lib/timecard";

/**
 * A worker's own shift-clock history — their personal punch records, hours this
 * week and month, and a live read of any open punch. This is the cashier's
 * self-service summary: it loads from the time-clock engine (resolved from the
 * session, never an id), so it shows for ANY signed-in staff member regardless
 * of the store's tier — independent of the payroll-gated ESS profile alongside
 * it. No back-office data is reachable from here.
 *
 * Hydration discipline: `nowMs` seeds to null and only ticks inside a post-mount
 * effect, so the live duration never diverges between server and first render.
 */
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", weekday: "short" });
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function MyClockRecords() {
  const [state, setState] = useState<
    { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: MyTimecards }
  >({ status: "loading" });
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getMyTimecards();
      if (!alive) return;
      if (res.ok) setState({ status: "ready", data: { timecards: res.timecards, weekMinutes: res.weekMinutes, monthMinutes: res.monthMinutes } });
      else setState({ status: "error", message: res.error ?? "Could not load your shift records." });
    })();
    return () => {
      alive = false;
    };
  }, []);

  const active =
    state.status === "ready" ? state.data.timecards.find((t) => t.status === "ACTIVE") ?? null : null;

  // Live tick for the open punch. `nowMs` is updated only from timer callbacks
  // (deferred external-system updates), never synchronously in the effect body,
  // so it stays null through hydration and the set-state-in-effect lint is happy.
  useEffect(() => {
    if (!active) return;
    const seed = window.setTimeout(() => setNowMs(Date.now()), 0);
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => {
      window.clearTimeout(seed);
      window.clearInterval(id);
    };
  }, [active]);

  if (state.status === "loading") {
    return <div className="h-[260px] rounded-xl2 bg-surface hairline shadow-card animate-pulse" />;
  }
  if (state.status === "error") {
    return (
      <div className="rounded-xl2 bg-surface hairline shadow-card px-5 py-10 text-center">
        <p className="text-[13px] font-semibold text-rose-600">{state.message}</p>
      </div>
    );
  }

  const { data } = state;

  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h3 className="font-extrabold tracking-tight flex items-center gap-2">
            <Icon name="clock" className="w-[18px] h-[18px] text-brand-600" strokeWidth={1.7} />
            My shift clock
          </h3>
          <p className="text-[12.5px] text-ink-soft">Your clock-in / clock-out history and hours worked.</p>
        </div>
        <div className="flex items-center gap-2">
          <Total label="This week" minutes={data.weekMinutes} />
          <Total label="This month" minutes={data.monthMinutes} />
        </div>
      </div>

      {active && (
        <div className="mx-5 mb-1 flex items-center justify-between rounded-[12px] bg-accent-50 px-4 py-3">
          <span className="inline-flex items-center gap-2 text-[13px] font-bold text-accent-600">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-accent-500 opacity-60 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-500" />
            </span>
            On the clock since {fmtTime(active.clockIn)}
          </span>
          <span className="text-[15px] font-extrabold tabular-nums text-accent-600">
            {nowMs !== null ? formatClock((nowMs - Date.parse(active.clockIn)) / 1000) : "—"}
          </span>
        </div>
      )}

      {data.timecards.length === 0 ? (
        <p className="px-5 py-10 text-center text-[13px] text-ink-soft border-t border-ink/8">
          No shift records yet. Use the clock on the register to punch in.
        </p>
      ) : (
        <div className="overflow-x-auto border-t border-ink/8 mt-2">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="text-left text-[12px] font-semibold text-ink-faint border-b border-ink/8 bg-paper/40">
                <th className="px-5 py-2.5">Date</th>
                <th className="px-3 py-2.5">Clock in</th>
                <th className="px-3 py-2.5">Clock out</th>
                <th className="px-3 py-2.5 text-right">Duration</th>
                <th className="px-5 py-2.5 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.timecards.map((t) => (
                <ClockRow key={t.id} t={t} nowMs={nowMs} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ClockRow({ t, nowMs }: { t: Timecard; nowMs: number | null }) {
  const live = t.status === "ACTIVE" && nowMs !== null;
  const minutes = live ? (nowMs - Date.parse(t.clockIn)) / 60_000 : t.durationMinutes;
  return (
    <tr className="border-b border-ink/5 last:border-0 hover:bg-paper/40 transition">
      <td className="px-5 py-3 font-semibold whitespace-nowrap">{fmtDate(t.clockIn)}</td>
      <td className="px-3 py-3 tabular-nums text-ink-soft">{fmtTime(t.clockIn)}</td>
      <td className="px-3 py-3 tabular-nums text-ink-soft">{t.clockOut ? fmtTime(t.clockOut) : "—"}</td>
      <td className="px-3 py-3 text-right font-bold tabular-nums whitespace-nowrap">{formatMinutes(minutes)}</td>
      <td className="px-5 py-3 text-right">
        <span
          className={
            "inline-block text-[11px] font-bold rounded-full px-2.5 py-0.5 " +
            (t.status === "ACTIVE" ? "bg-accent-50 text-accent-600" : "bg-paper hairline text-ink-faint")
          }
        >
          {t.status === "ACTIVE" ? "Open" : "Completed"}
        </span>
      </td>
    </tr>
  );
}

function Total({ label, minutes }: { label: string; minutes: number }) {
  return (
    <div className="rounded-[10px] bg-paper hairline px-3.5 py-2 text-right">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">{label}</div>
      <div className="text-[15px] font-extrabold tabular-nums tracking-tight">{formatMinutes(minutes)}</div>
    </div>
  );
}
