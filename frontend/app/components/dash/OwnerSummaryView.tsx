"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "../Icon";
import { formatCentsWhole, formatCount } from "@/lib/format";
import { useDashUser } from "./DashShell";
import { TierBadge } from "./TierBadge";
import { asTier } from "@/lib/tiers";
import { getOwnerSummary, type OwnerSummary } from "@/lib/merchant";

/**
 * The owner's phone-first at-a-glance view: three vital signs on one screen —
 * today's takings, registers open right now, and items running low — so a busy
 * owner away from the shop gets real-time peace of mind without digging through
 * the full dashboard. Tenant-scoped server-side; refreshed on a light poll.
 *
 * Built to be shift-free: the loading skeletons occupy the exact footprint of
 * the live metric cards, so the numbers land in place without the layout jumping.
 */

const POLL_MS = 30_000;

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; summary: OwnerSummary };

export function OwnerSummaryView() {
  const user = useDashUser();
  const store = user.tenantName ?? "your store";
  const [state, setState] = useState<State>({ status: "loading" });
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);

  const refresh = useCallback(async (signalAlive: () => boolean) => {
    const res = await getOwnerSummary();
    if (!signalAlive()) return;
    if (res.ok) {
      setState({ status: "ready", summary: res.summary });
      setRefreshedAt(new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }));
    } else {
      setState((prev) =>
        prev.status === "ready" ? prev : { status: "error", message: res.error ?? "Could not load your summary." },
      );
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = () => void refresh(() => alive);
    void tick();
    const timer = window.setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [refresh]);

  return (
    <div className="mx-auto w-full max-w-[520px] space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[1.3rem] font-extrabold tracking-tightest">Today at a glance</h2>
          {/* Store name + live tier badge sit on the store identity (always in the
              session), so the badge paints on first render and the trailing
              "updated" timestamp lands to its right without nudging it. */}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-fine">
            <span className="font-semibold text-ink">{store}</span>
            <TierBadge tier={asTier(user.tier)} />
            {refreshedAt && <span className="text-ink-soft">updated {refreshedAt}</span>}
          </div>
        </div>
        <Link
          href="/dashboard"
          className="shrink-0 inline-flex items-center gap-1.5 rounded-[10px] bg-paper hairline px-3 py-2 text-fine font-semibold text-ink-soft hover:text-brand-600 hover:border-brand-200 transition duration-150"
        >
          <Icon name="chart" className="w-[16px] h-[16px]" strokeWidth={1.7} />
          Full dashboard
        </Link>
      </div>

      {state.status === "error" ? (
        <div className="rounded-xl2 bg-surface hairline shadow-card p-8 text-center">
          <p className="text-[14px] font-semibold text-rose-600">{state.message}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <BigMetric
            icon="peso"
            label="Gross sales today"
            value={state.status === "ready" ? formatCentsWhole(state.summary.grossCents) : null}
            tone="brand"
          />
          <BigMetric
            icon="pos"
            label="Registers open now"
            value={state.status === "ready" ? formatCount(state.summary.activeRegisters) : null}
            sub={
              state.status === "ready"
                ? state.summary.activeRegisters === 0
                  ? "No tills open"
                  : `${state.summary.activeRegisters} ${state.summary.activeRegisters === 1 ? "till" : "tills"} ringing`
                : undefined
            }
            tone="accent"
          />
          <BigMetric
            icon="box"
            label="Low-stock alerts"
            value={state.status === "ready" ? formatCount(state.summary.lowStockCount) : null}
            sub={
              state.status === "ready"
                ? state.summary.lowStockCount === 0
                  ? "Everything well stocked"
                  : "Tap to restock"
                : undefined
            }
            tone={state.status === "ready" && state.summary.lowStockCount > 0 ? "warn" : "muted"}
            href={state.status === "ready" && state.summary.lowStockCount > 0 ? "/dashboard/inventory" : undefined}
          />
        </div>
      )}
    </div>
  );
}

const TONE: Record<string, { chip: string; ring: string }> = {
  brand: { chip: "bg-brand-50 text-brand-600", ring: "" },
  accent: { chip: "bg-accent-50 text-accent-600", ring: "" },
  warn: { chip: "bg-amber-50 text-amber-600", ring: "border-amber-200 dark:border-amber-500/30" },
  muted: { chip: "bg-paper hairline text-ink-faint", ring: "" },
};

/**
 * One vital sign. Fixed height across loading/ready so the figure resolves into
 * a stable card — no layout shift when the poll lands. Optionally a link (the
 * low-stock tile jumps straight to Inventory).
 */
function BigMetric({
  icon,
  label,
  value,
  sub,
  tone,
  href,
}: {
  icon: IconName;
  label: string;
  value: string | null;
  sub?: string;
  tone: "brand" | "accent" | "warn" | "muted";
  href?: string;
}) {
  const t = TONE[tone];
  const inner = (
    <div
      className={
        "rounded-xl2 bg-surface shadow-card p-6 h-[132px] flex flex-col justify-between " +
        (t.ring ? "border " + t.ring : "hairline")
      }
    >
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-bold tracking-tight text-ink-soft">{label}</span>
        <span className={"grid place-items-center w-10 h-10 rounded-[12px] " + t.chip}>
          <Icon name={icon} className="w-5 h-5" strokeWidth={1.7} />
        </span>
      </div>
      {value === null ? (
        <div className="h-9 w-32 rounded-[8px] bg-paper hairline animate-pulse" />
      ) : (
        <div>
          <div className="text-[2.1rem] leading-none font-extrabold tracking-tightest tabular-nums">{value}</div>
          {sub && <div className="mt-1 text-fine text-ink-faint">{sub}</div>}
        </div>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="block hover:opacity-95 transition duration-150">
      {inner}
    </Link>
  ) : (
    inner
  );
}
