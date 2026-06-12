"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { useToast } from "../Toast";
import { formatCents } from "@/lib/format";
import {
  HEALTH_STREAM_URL,
  type ActivityEvent,
  type ServerMetrics,
  type VarianceAlert,
} from "@/lib/health";

/**
 * Module 2 — Real-Time System Health. Opens an authenticated SSE stream and
 * renders two live panels: a rolling cross-tenant activity ticker (sales +
 * product events as they land in the ledger) and infrastructure vitals (NeonDB
 * pool occupancy + a freshly-measured query latency timeline).
 *
 * setState only ever fires from EventSource callbacks (event handlers), never
 * synchronously in the effect body — so the react-hooks/set-state-in-effect
 * rule is satisfied.
 */

type Status = "connecting" | "live" | "down";

const MAX_ACTIVITY = 40;
const MAX_LATENCY = 32;

export function HealthMatrix() {
  const { push } = useToast();
  const [status, setStatus] = useState<Status>("connecting");
  const [metrics, setMetrics] = useState<ServerMetrics | null>(null);
  const [latency, setLatency] = useState<number[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [flags, setFlags] = useState<VarianceAlert[]>([]);
  // Guards against duplicate event ids across the initial backfill + ticks.
  const seen = useRef<Set<string>>(new Set());
  const seenFlags = useRef<Set<string>>(new Set());

  useEffect(() => {
    const es = new EventSource(HEALTH_STREAM_URL, { withCredentials: true });

    es.onopen = () => setStatus("live");
    es.onerror = () => setStatus((s) => (s === "live" ? "down" : s));

    es.addEventListener("metrics", (e) => {
      const m = JSON.parse((e as MessageEvent).data) as ServerMetrics;
      setStatus("live");
      setMetrics(m);
      setLatency((prev) => [...prev, m.latencyMs].slice(-MAX_LATENCY));
    });

    es.addEventListener("activity", (e) => {
      const ev = JSON.parse((e as MessageEvent).data) as ActivityEvent;
      if (seen.current.has(ev.id)) return;
      seen.current.add(ev.id);
      setActivity((prev) => [ev, ...prev].slice(0, MAX_ACTIVITY));
    });

    es.addEventListener("alert", (e) => {
      const al = JSON.parse((e as MessageEvent).data) as VarianceAlert;
      if (seenFlags.current.has(al.id)) return;
      seenFlags.current.add(al.id);
      setFlags((prev) => [al, ...prev].slice(0, 12));
      const over = al.varianceCents > 0;
      push({
        variant: "danger",
        title: `Drawer variance flagged · ${al.tenant}`,
        message: `${al.cashierName}'s Z-Read is ${over ? "over" : "short"} by ${formatCents(
          Math.abs(al.varianceCents),
        )}.`,
        ttl: 0,
      });
    });

    return () => es.close();
  }, [push]);

  return (
    <div className="space-y-7 max-w-[1180px]">
      <StatusBar status={status} latencyMs={metrics?.latencyMs ?? null} />

      {flags.length > 0 && <VarianceFlags flags={flags} />}

      <div className="grid gap-5 lg:grid-cols-5">
        {/* Live activity ticker */}
        <div className="lg:col-span-3 rounded-xl2 bg-surface hairline shadow-card overflow-hidden">
          <div className="flex items-center justify-between px-5 sm:px-6 py-4 hairline-b">
            <h3 className="font-extrabold tracking-tight flex items-center gap-2">
              <Icon name="pulse" className="w-[18px] h-[18px] text-brand-600" strokeWidth={1.8} />
              Live activity
            </h3>
            <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-accent-600">
              <span className="w-2 h-2 rounded-full bg-accent-500 animate-pulse" />
              cross-tenant
            </span>
          </div>
          <ActivityTicker events={activity} status={status} />
        </div>

        {/* Infrastructure vitals */}
        <div className="lg:col-span-2 space-y-5">
          <PoolPanel metrics={metrics} />
          <LatencyPanel samples={latency} current={metrics?.latencyMs ?? null} />
        </div>
      </div>
    </div>
  );
}

function VarianceFlags({ flags }: { flags: VarianceAlert[] }) {
  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card overflow-hidden ring-1 ring-rose-200 dark:ring-rose-500/30">
      <div className="flex items-center justify-between px-5 sm:px-6 py-4 hairline-b bg-rose-50/60 dark:bg-rose-500/10">
        <h3 className="font-extrabold tracking-tight flex items-center gap-2 text-rose-600">
          <Icon name="shield" className="w-[18px] h-[18px]" strokeWidth={1.9} />
          Shift variance flags
        </h3>
        <span className="text-[11px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-500/15 rounded-full px-2.5 py-0.5">
          {flags.length} flagged
        </span>
      </div>
      <ul className="divide-y divide-[rgba(11,18,32,0.06)] dark:divide-[rgba(255,255,255,0.07)]">
        {flags.map((f) => {
          const over = f.varianceCents > 0;
          return (
            <li key={f.id} className="step-in flex items-center gap-3 px-5 sm:px-6 py-3.5">
              <span className="grid place-items-center w-9 h-9 rounded-[10px] bg-rose-50 dark:bg-rose-500/15 text-rose-600 shrink-0">
                <Icon name="activity" className="w-[18px] h-[18px]" strokeWidth={1.9} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] leading-tight">
                  <span className="font-bold tracking-tight">{f.tenant}</span>{" "}
                  <span className="text-ink-soft">— {f.cashierName}&apos;s Z-Read</span>
                </div>
                <div className="text-[12px] text-ink-faint tabular-nums">
                  expected {formatCents(f.expectedCashCents)} · counted {formatCents(f.countedCashCents)}
                </div>
              </div>
              <span
                className={
                  "shrink-0 text-right text-[14px] font-extrabold tracking-tight tabular-nums " +
                  (over ? "text-amber-600" : "text-rose-600")
                }
              >
                <span className="block text-[10.5px] font-bold uppercase tracking-wide">
                  {over ? "Overage" : "Shortage"}
                </span>
                {over ? "+" : "−"}
                {formatCents(Math.abs(f.varianceCents))}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StatusBar({ status, latencyMs }: { status: Status; latencyMs: number | null }) {
  const map: Record<Status, { dot: string; text: string; label: string }> = {
    connecting: { dot: "bg-amber-500", text: "text-amber-600", label: "Connecting to telemetry…" },
    live: { dot: "bg-accent-500", text: "text-accent-600", label: "Telemetry stream live" },
    down: { dot: "bg-rose-500", text: "text-rose-600", label: "Stream interrupted — reconnecting…" },
  };
  const s = map[status];
  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card px-5 py-4 flex items-center gap-3">
      <span className={"w-2.5 h-2.5 rounded-full " + s.dot + (status !== "down" ? " animate-pulse" : "")} />
      <span className={"text-[14px] font-bold tracking-tight " + s.text}>{s.label}</span>
      {latencyMs !== null && (
        <span className="ml-auto text-[12.5px] font-semibold text-ink-soft tabular-nums">
          DB round-trip <span className="font-bold text-ink">{latencyMs} ms</span>
        </span>
      )}
    </div>
  );
}

function ActivityTicker({ events, status }: { events: ActivityEvent[]; status: Status }) {
  if (events.length === 0) {
    return (
      <p className="px-6 py-12 text-center text-[13.5px] text-ink-soft">
        {status === "connecting"
          ? "Waiting for the first events…"
          : "Quiet across the platform right now — new sales and product changes will stream in here."}
      </p>
    );
  }
  return (
    <ul className="divide-y divide-[rgba(11,18,32,0.06)] dark:divide-[rgba(255,255,255,0.07)] max-h-[420px] overflow-y-auto">
      {events.map((ev) => (
        <li key={ev.id} className="step-in flex items-center gap-3 px-5 sm:px-6 py-3">
          <span
            className={
              "grid place-items-center w-9 h-9 rounded-[10px] shrink-0 " +
              (ev.kind === "sale" ? "bg-accent-50 text-accent-600" : "bg-brand-50 text-brand-600")
            }
          >
            <Icon name={ev.kind === "sale" ? "receipt" : "box"} className="w-[18px] h-[18px]" strokeWidth={1.7} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] leading-tight">
              <span className="font-bold tracking-tight">{ev.tenant}</span>{" "}
              <span className="text-ink-soft">
                {ev.kind === "sale" ? "processed an order" : "added a product"}
              </span>
            </div>
            <div className="text-[12px] text-ink-faint truncate">
              {ev.kind === "sale" ? ev.detail : `“${ev.detail}”`} · {timeAgo(ev.at)}
            </div>
          </div>
          {ev.amountCents !== null && (
            <span className="text-[13.5px] font-bold tracking-tight tabular-nums shrink-0">
              {formatCents(ev.amountCents)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function PoolPanel({ metrics }: { metrics: ServerMetrics | null }) {
  const pool = metrics?.pool;
  const pct = pool ? (pool.active / pool.max) * 100 : 0;
  const hot = pct >= 80;
  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card p-5">
      <div className="flex items-center gap-2.5">
        <span className="grid place-items-center w-8 h-8 rounded-[10px] bg-brand-50 text-brand-600">
          <Icon name="database" className="w-[18px] h-[18px]" strokeWidth={1.7} />
        </span>
        <span className="text-[12.5px] font-bold tracking-wide text-ink-faint uppercase">
          NeonDB pool
        </span>
      </div>
      <div className="mt-3 flex items-end gap-2">
        <span className="text-[2rem] leading-none font-extrabold tracking-tightest tabular-nums">
          {pool ? pool.active : "—"}
        </span>
        <span className="text-[13px] font-semibold text-ink-faint pb-1">
          / {pool?.max ?? "—"} active
        </span>
      </div>
      <span className="mt-3 block h-2 rounded-full bg-paper hairline overflow-hidden">
        <span
          className={"block h-full rounded-full " + (hot ? "bg-rose-500" : "bg-brand-500")}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </span>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat label="Open" value={pool?.total} />
        <Stat label="Idle" value={pool?.idle} />
        <Stat label="Waiting" value={pool?.waiting} warn={(pool?.waiting ?? 0) > 0} />
      </div>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value?: number; warn?: boolean }) {
  return (
    <div className="rounded-[10px] bg-paper hairline py-2">
      <div className={"text-[15px] font-extrabold tracking-tight tabular-nums " + (warn ? "text-rose-600" : "")}>
        {value ?? "—"}
      </div>
      <div className="text-[11px] font-semibold text-ink-faint">{label}</div>
    </div>
  );
}

function LatencyPanel({ samples, current }: { samples: number[]; current: number | null }) {
  const max = Math.max(1, ...samples);
  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="grid place-items-center w-8 h-8 rounded-[10px] bg-brand-50 text-brand-600">
            <Icon name="activity" className="w-[18px] h-[18px]" strokeWidth={1.7} />
          </span>
          <span className="text-[12.5px] font-bold tracking-wide text-ink-faint uppercase">
            Query latency
          </span>
        </div>
        {current !== null && (
          <span className="text-[13px] font-bold tracking-tight tabular-nums">{current} ms</span>
        )}
      </div>
      <div className="mt-5 flex items-end gap-1 h-[64px]">
        {samples.length === 0 ? (
          <span className="w-full text-center text-[12.5px] text-ink-soft self-center">sampling…</span>
        ) : (
          samples.map((v, i) => (
            <span
              key={i}
              className="flex-1 rounded-t-[3px] bg-brand-400/70"
              style={{ height: `${Math.max(4, (v / max) * 100)}%` }}
              title={`${v} ms`}
            />
          ))
        )}
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 10) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}
