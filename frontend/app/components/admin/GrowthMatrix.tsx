"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "../Icon";
import { formatCount } from "@/lib/format";
import { getGrowthMetrics, type GrowthMetrics } from "@/lib/adminAnalytics";

/**
 * Growth & retention — the companion to the Billing & MRR matrix. Trial→paid
 * conversion, current churn, and signup-month cohort retention, all derived
 * server-side from the tenant register (no new tracking). Rates arrive as whole
 * percents or null; a null renders as "—" so an early-stage platform with no
 * trials or no settled stores never shows NaN.
 */

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: GrowthMetrics };

export function GrowthMatrix() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getGrowthMetrics();
      if (!alive) return;
      if (res.ok) setState({ status: "ready", data: res.metrics });
      else setState({ status: "error", message: res.error ?? "Could not load growth metrics." });
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (state.status === "loading") return <Skeleton />;
  if (state.status === "error") {
    return (
      <div className="rounded-xl2 bg-surface hairline shadow-card p-8 text-center max-w-[1180px]">
        <p className="text-[14px] font-semibold text-rose-600">{state.message}</p>
      </div>
    );
  }

  const { conversion, churn, cohorts } = state.data;
  const maxSignups = Math.max(1, ...cohorts.map((c) => c.signups));

  return (
    <div className="space-y-7 max-w-[1180px]">
      <div>
        <h2 className="text-title font-extrabold tracking-tight">Growth &amp; retention</h2>
        <p className="text-fine text-ink-soft">
          Trial conversion, churn &amp; signup-cohort survival — derived from the tenant register
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon="trend"
          label="Trial → Paid conversion"
          value={asPct(conversion.ratePct)}
          sub={`${formatCount(conversion.converted)} of ${formatCount(conversion.trialsStarted)} trials`}
        />
        <Kpi
          icon="bolt"
          label="Churn rate"
          value={asPct(churn.ratePct)}
          sub={`${formatCount(churn.churnedStores)} of ${formatCount(
            churn.activeStores + churn.churnedStores,
          )} settled stores`}
          tone="danger"
        />
        <Kpi
          icon="store"
          label="Converted stores"
          value={formatCount(conversion.converted)}
          sub="trials now paying"
        />
        <Kpi
          icon="wallet"
          label="Churned stores"
          value={formatCount(churn.churnedStores)}
          sub="expired or suspended"
        />
      </div>

      {/* Signup-month cohort retention */}
      <div className="rounded-xl2 bg-surface hairline shadow-card p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold tracking-tight">Cohort retention</h3>
          <span className="text-[12.5px] font-semibold text-ink-faint">
            still live by signup month · last 6 mo
          </span>
        </div>
        <div className="mt-5 space-y-3">
          {cohorts.map((c) => (
            <div key={c.month} className="flex items-center gap-4">
              <span className="w-16 shrink-0 text-[12.5px] font-bold text-ink-soft">
                {monthLabel(c.month)}
              </span>
              <div className="flex-1">
                {/* Outer bar = this month's signups (relative to the busiest month);
                    inner fill = the share still live. */}
                <div
                  className="h-7 rounded-[8px] bg-paper hairline overflow-hidden"
                  style={{ width: `${Math.round((c.signups / maxSignups) * 100)}%`, minWidth: c.signups > 0 ? "56px" : "0" }}
                >
                  <div
                    className="h-full bg-brand-500/85 flex items-center justify-end pr-2"
                    style={{ width: `${c.retentionPct ?? 0}%` }}
                  >
                    {c.retained > 0 && (
                      <span className="text-[11px] font-bold text-white tabular-nums">
                        {c.retained}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <span className="w-28 shrink-0 text-right text-[12.5px] font-semibold text-ink-soft tabular-nums">
                {c.signups === 0 ? (
                  <span className="text-ink-faint">no signups</span>
                ) : (
                  <>
                    {asPct(c.retentionPct)} · {formatCount(c.retained)}/{formatCount(c.signups)}
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Whole-percent string, or an em dash when the rate is null (nothing to divide). */
function asPct(pct: number | null): string {
  return pct === null ? "—" : `${pct}%`;
}

/** "2026-06-01" → "Jun 2026". */
function monthLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-PH", { month: "short", year: "numeric", timeZone: "UTC" });
}

function Kpi({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: IconName;
  label: string;
  value: string;
  sub: string;
  tone?: "danger";
}) {
  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card p-5">
      <div className="flex items-center gap-2.5">
        <span
          className={
            "grid place-items-center w-9 h-9 rounded-[10px] " +
            (tone === "danger" ? "bg-rose-50 text-rose-600" : "bg-brand-50 text-brand-600")
          }
        >
          <Icon name={icon} className="w-[18px] h-[18px]" strokeWidth={1.7} />
        </span>
        <span className="text-[11.5px] font-bold tracking-wide text-ink-faint uppercase leading-tight">
          {label}
        </span>
      </div>
      <div className="mt-3 text-[1.8rem] leading-none font-extrabold tracking-tightest">{value}</div>
      <div className="mt-1.5 text-[12.5px] text-ink-soft">{sub}</div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-5 max-w-[1180px] animate-pulse">
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl2 bg-surface hairline shadow-card h-[132px]" />
        ))}
      </div>
      <div className="rounded-xl2 bg-surface hairline shadow-card h-[320px]" />
    </div>
  );
}
