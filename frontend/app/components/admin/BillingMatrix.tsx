"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "../Icon";
import { formatCents, formatCentsWhole, formatCount } from "@/lib/format";
import { getBillingAnalytics, type BillingAnalytics } from "@/lib/adminAnalytics";
import { FeeTrendChart, MrrTrendChart, PlanDistributionChart } from "./BillingCharts";
import { SubscribersDrawer } from "./SubscribersDrawer";

/**
 * Module 1 — Billing & MRR Engine. The platform's live recurring-revenue
 * picture: aggregated MRR, annual run rate, blended ARPA, and interactive
 * Recharts visualizations (MRR growth curve, plan-tier distribution, and the
 * transaction-fee trend). The "Active Subscribers" KPI drills into the live
 * subscriber register. All figures arrive as centavos and render as peso strings.
 */

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: BillingAnalytics };

export function BillingMatrix() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getBillingAnalytics();
      if (!alive) return;
      if (res.ok) setState({ status: "ready", data: res.analytics });
      else setState({ status: "error", message: res.error ?? "Could not load billing analytics." });
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

  const m = state.data;

  return (
    <div className="space-y-7 max-w-[1180px]">
      {/* Headline KPIs */}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon="peso" label="Monthly Recurring Revenue" value={formatCentsWhole(m.mrrCents)} sub="/mo across active stores" />
        <Kpi icon="trend" label="Annual Run Rate" value={formatCentsWhole(m.arrCents)} sub="MRR × 12" />
        <Kpi
          icon="store"
          label="Active Subscribers"
          value={formatCount(m.activeStores)}
          sub="paying storefronts"
          onClick={() => setDrawerOpen(true)}
        />
        <Kpi icon="wallet" label="Avg. Revenue / Account" value={formatCents(m.arpaCents)} sub="blended ARPA" />
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        {/* MRR growth curve */}
        <div className="lg:col-span-3 rounded-xl2 bg-surface hairline shadow-card p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold tracking-tight">MRR growth</h3>
            <span className="text-[12.5px] font-semibold text-ink-faint">last 6 months</span>
          </div>
          <div className="mt-4">
            <MrrTrendChart points={m.mrrTrend} />
          </div>
        </div>

        {/* Plan-tier distribution */}
        <div className="lg:col-span-2 rounded-xl2 bg-surface hairline shadow-card p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold tracking-tight">Plan distribution</h3>
            <span className="text-[12.5px] font-semibold text-ink-faint">active tiers</span>
          </div>
          <div className="mt-4">
            <PlanDistributionChart byPlan={m.byPlan} />
          </div>
        </div>
      </div>

      {/* Transaction-fee revenue */}
      <div className="rounded-xl2 bg-surface hairline shadow-card p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold tracking-tight">Transaction-fee revenue</h3>
          <span className="text-[12.5px] font-semibold text-ink-faint">
            {m.feeRatePct}% of GMV · last 6 mo
          </span>
        </div>
        <div className="mt-4">
          <FeeTrendChart points={m.feeTrend} feeRatePct={m.feeRatePct} />
        </div>
      </div>

      {drawerOpen && <SubscribersDrawer onClose={() => setDrawerOpen(false)} />}
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  onClick,
}: {
  icon: IconName;
  label: string;
  value: string;
  sub: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="flex items-center gap-2.5">
        <span className="grid place-items-center w-9 h-9 rounded-[10px] bg-brand-50 text-brand-600">
          <Icon name={icon} className="w-[18px] h-[18px]" strokeWidth={1.7} />
        </span>
        <span className="text-[11.5px] font-bold tracking-wide text-ink-faint uppercase leading-tight">
          {label}
        </span>
        {onClick && (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold text-brand-600">
            View
            <Icon name="arrow" className="w-3.5 h-3.5" strokeWidth={2} />
          </span>
        )}
      </div>
      <div className="mt-3 text-[1.8rem] leading-none font-extrabold tracking-tightest">{value}</div>
      <div className="mt-1.5 text-[12.5px] text-ink-soft">{sub}</div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="text-left rounded-xl2 bg-surface hairline shadow-card p-5 hover:border-brand-200 hover:shadow-soft active:scale-[0.99] transition duration-150"
      >
        {body}
      </button>
    );
  }
  return <div className="rounded-xl2 bg-surface hairline shadow-card p-5">{body}</div>;
}

function Skeleton() {
  return (
    <div className="space-y-5 max-w-[1180px] animate-pulse">
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl2 bg-surface hairline shadow-card h-[132px]" />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3 rounded-xl2 bg-surface hairline shadow-card h-[300px]" />
        <div className="lg:col-span-2 rounded-xl2 bg-surface hairline shadow-card h-[300px]" />
      </div>
      <div className="rounded-xl2 bg-surface hairline shadow-card h-[270px]" />
    </div>
  );
}
