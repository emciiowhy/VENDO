"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { formatCount, formatCentsWhole } from "@/lib/format";
import { getBillingAnalytics, type BillingAnalytics } from "@/lib/adminAnalytics";
import { getServerMetrics, type ServerMetrics } from "@/lib/health";
import { PLAN_LABEL, type Plan } from "./tenants.data";

/**
 * Module 1 — Global Metrics Summary. Not a flat grid of equal tiles: MRR is the
 * one figure a platform admin came to read, so it leads as the feature card,
 * Active Merchants sits beside it as the secondary hero, and live infrastructure
 * load runs underneath as a thin telemetry strip — big → big → dense, so the eye
 * has somewhere to land. Green carries money + health; blue carries the platform
 * and its infra.
 *
 * Every figure here is live: MRR / merchants / per-plan split + month-over-month
 * deltas come from the billing analytics rollup; the telemetry strip samples the
 * real NeonDB pool and a fresh query round-trip. No placeholders.
 *
 * setState only fires after an `await` inside the effect (or from the lazy
 * initial state), never synchronously in the effect body.
 */

const PLAN_ORDER: Plan[] = ["enterprise", "business", "starter"];

export function MetricsBento() {
  const [analytics, setAnalytics] = useState<BillingAnalytics | null>(null);
  const [metrics, setMetrics] = useState<ServerMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [billing, infra] = await Promise.all([getBillingAnalytics(), getServerMetrics()]);
      if (!alive) return;
      if (billing.ok) {
        setAnalytics(billing.analytics);
        setError(null);
      } else {
        setError(billing.error ?? "Could not load platform metrics.");
      }
      // Infra vitals are best-effort: a missing sample just dims the strip.
      if (infra.ok) setMetrics(infra.metrics);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const mrrDelta = momDelta(analytics?.mrrTrend.map((p) => p.mrrCents));
  const storesDelta = momDelta(analytics?.mrrTrend.map((p) => p.stores));
  const mrrMax = analytics
    ? Math.max(1, ...PLAN_ORDER.map((p) => planMrr(analytics, p)))
    : 1;

  // Receipts settled in the current Manila month (0 until the first sale lands).
  const monthKey = new Date().toISOString().slice(0, 7);
  const receiptsThisMonth =
    analytics?.feeTrend.find((f) => f.month.slice(0, 7) === monthKey)?.txns ?? 0;

  if (error) {
    return (
      <div className="rounded-xl2 bg-surface hairline shadow-card px-6 py-12 text-center">
        <p className="text-note text-rose-600 font-semibold">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Focal row: MRR feature (2/3) + Active Merchants (1/3) */}
      <div className="grid gap-5 md:grid-cols-3">
        {/* MRR — the dominant figure on the screen */}
        <section className="md:col-span-2 rounded-xl2 bg-surface hairline-strong shadow-soft p-6">
          <CardHead icon="peso" label="Monthly Recurring Revenue" tone="money" />
          <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-1">
            <span className="text-feature font-extrabold tabular-nums">
              {analytics ? formatCentsWhole(analytics.mrrCents) : <Skeleton w="9rem" h="2.6rem" />}
            </span>
            <span className="text-fine font-semibold text-ink-faint pb-1.5">/mo</span>
            <Delta value={mrrDelta} className="pb-2" />
          </div>
          <div className="mt-5 space-y-2.5">
            {PLAN_ORDER.map((p) => {
              const mrr = analytics ? planMrr(analytics, p) : 0;
              return (
                <div key={p} className="flex items-center gap-3">
                  <span className="w-[76px] text-fine font-semibold text-ink-soft">{PLAN_LABEL[p]}</span>
                  <span className="flex-1 h-2 rounded-full bg-paper hairline overflow-hidden">
                    <span
                      className="block h-full rounded-full bg-accent-500 transition-[width] duration-500"
                      style={{ width: analytics ? `${Math.round((mrr / mrrMax) * 100)}%` : "0%" }}
                    />
                  </span>
                  <span className="w-[92px] text-right text-note font-bold tracking-tight tabular-nums">
                    {analytics ? formatCentsWhole(mrr) : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Active merchants — secondary hero, given room to breathe */}
        <section className="rounded-xl2 bg-surface hairline shadow-card p-6 flex flex-col">
          <CardHead icon="store" label="Active Merchants" tone="brand" />
          <div className="mt-3 flex items-end gap-2.5">
            <span className="text-hero font-extrabold tabular-nums">
              {analytics ? formatCount(analytics.activeStores) : <Skeleton w="4.5rem" h="2.2rem" />}
            </span>
            <Delta value={storesDelta} className="pb-1" />
          </div>
          <p className="mt-2 text-fine text-ink-soft">Live storefronts nationwide</p>
          <p className="mt-auto pt-4 text-fine text-ink-faint">
            {storesDelta === null
              ? "Subscription seats billing this month"
              : `Onboarding ${storesDelta >= 0 ? "up" : "down"} ${Math.abs(storesDelta)}% this month`}
          </p>
        </section>
      </div>

      {/* Telemetry strip: dense horizontal band, deliberately flat against the
          cards above so the rhythm shifts from "read" to "scan". All live. */}
      <section className="rounded-xl2 bg-surface hairline p-1.5">
        <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[rgba(11,18,32,0.07)] dark:divide-[rgba(255,255,255,0.09)]">
          <Telemetry
            icon="activity"
            label="Query latency"
            value={
              metrics ? (
                <span
                  className={
                    "inline-flex items-center gap-1.5 " +
                    (metrics.latencyMs < 80 ? "text-accent-600" : "text-amber-600")
                  }
                >
                  <span
                    className={
                      "w-2 h-2 rounded-full animate-pulse " +
                      (metrics.latencyMs < 80 ? "bg-accent-500" : "bg-amber-500")
                    }
                  />
                  <span className="font-bold tabular-nums">{metrics.latencyMs}</span>
                  <span className="text-ink-faint font-semibold">ms</span>
                </span>
              ) : (
                <span className="text-ink-faint">{loading ? "sampling…" : "—"}</span>
              )
            }
          />
          <Telemetry
            icon="database"
            label="NeonDB pool"
            value={
              metrics ? (
                <span className="w-full max-w-[180px]">
                  <span className="flex items-center justify-between">
                    <span className="font-bold tabular-nums">
                      {metrics.pool.active}
                      <span className="text-ink-faint font-semibold">/{metrics.pool.max}</span>
                    </span>
                  </span>
                  <span className="mt-1.5 block h-1.5 rounded-full bg-paper hairline overflow-hidden">
                    <span
                      className={
                        "block h-full rounded-full " +
                        (poolPct(metrics) >= 80 ? "bg-rose-500" : "bg-brand-500")
                      }
                      style={{ width: `${poolPct(metrics)}%` }}
                    />
                  </span>
                </span>
              ) : (
                <span className="text-ink-faint">{loading ? "sampling…" : "—"}</span>
              )
            }
          />
          <Telemetry
            icon="receipt"
            label="Receipts this month"
            value={
              analytics ? (
                <span className="font-bold tabular-nums">
                  {formatCount(receiptsThisMonth)}
                  <span className="text-ink-faint font-semibold"> issued</span>
                </span>
              ) : (
                <span className="text-ink-faint">{loading ? "…" : "—"}</span>
              )
            }
          />
        </div>
      </section>
    </div>
  );
}

/** This tier's MRR contribution (centavos) from the live plan breakdown. */
function planMrr(a: BillingAnalytics, plan: Plan): number {
  return a.byPlan.find((b) => b.plan === plan)?.mrrCents ?? 0;
}

/** NeonDB pool occupancy as a clamped 0–100 percentage. */
function poolPct(m: ServerMetrics): number {
  return Math.min(100, (m.pool.active / m.pool.max) * 100);
}

/**
 * Month-over-month change from a cumulative trend series: the last point vs the
 * one before it, as a signed percentage rounded to one decimal. Returns null
 * when there's no prior point or the baseline is zero (nothing to compare to).
 */
function momDelta(series: number[] | undefined): number | null {
  if (!series || series.length < 2) return null;
  const cur = series[series.length - 1];
  const prev = series[series.length - 2];
  if (prev <= 0) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

const TONE: Record<string, string> = {
  brand: "bg-brand-50 text-brand-600",
  money: "bg-accent-50 text-accent-600",
  ok: "bg-accent-50 text-accent-600",
};

function CardHead({
  icon,
  label,
  tone = "brand",
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  tone?: keyof typeof TONE;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={"grid place-items-center w-8 h-8 rounded-[10px] " + TONE[tone]}>
        <Icon name={icon} className="w-[18px] h-[18px]" strokeWidth={1.7} />
      </span>
      <span className="text-cap font-bold tracking-wide text-ink-faint uppercase">{label}</span>
    </div>
  );
}

function Telemetry({
  icon,
  label,
  value,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <span className="grid place-items-center w-9 h-9 rounded-[10px] shrink-0 bg-brand-50 text-brand-600">
        <Icon name={icon} className="w-[18px] h-[18px]" strokeWidth={1.7} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-cap font-bold tracking-wide text-ink-faint uppercase">{label}</div>
        <div className="mt-0.5 text-note">{value}</div>
      </div>
    </div>
  );
}

function Delta({ value, className = "" }: { value: number | null; className?: string }) {
  if (value === null) return null;
  const up = value >= 0;
  return (
    <span
      className={
        "inline-flex items-center gap-0.5 text-fine font-bold " +
        (up ? "text-accent-600" : "text-rose-600") +
        " " +
        className
      }
    >
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        {up ? <path d="M6 15l6-6 6 6" /> : <path d="M6 9l6 6 6-6" />}
      </svg>
      {Math.abs(value)}%
    </span>
  );
}

/** A pulsing placeholder block sized to the figure it stands in for. */
function Skeleton({ w, h }: { w: string; h: string }) {
  return (
    <span
      className="inline-block rounded-md bg-paper animate-pulse align-bottom"
      style={{ width: w, height: h }}
    />
  );
}
