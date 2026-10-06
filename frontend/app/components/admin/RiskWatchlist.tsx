"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "../Icon";
import { PlanBadge } from "./TenantsDirectory";
import { getAtRiskTenants, type RiskReason, type RiskTenant } from "@/lib/adminRisk";

/**
 * The churn-risk watchlist on the platform Overview — the stores that need
 * attention before they cancel, newest churn signal first. Distinct from the
 * Tenants directory (which manages ALL stores): this surfaces only the few that
 * are slipping, so a platform operator opening the console at 7am sees who to
 * save today without hunting. Every row deep-links into the directory to act.
 *
 * Colour carries the severity the same way the rest of the console does: rose =
 * already lost/frozen (danger), amber = a closing window (warning). A thin
 * semantic strip down the left edge of each row makes the list triage-able at a
 * glance — you read the colours before you read the names.
 */

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: RiskTenant[] };

export function RiskWatchlist() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getAtRiskTenants();
      if (!alive) return;
      if (res.ok) setState({ status: "ready", rows: res.tenants });
      else setState({ status: "error", message: res.error ?? "Could not load the watchlist." });
    })();
    return () => {
      alive = false;
    };
  }, []);

  const count = state.status === "ready" ? state.rows.length : 0;
  const dangerCount =
    state.status === "ready" ? state.rows.filter((r) => r.severity === "danger").length : 0;

  return (
    <section className="rounded-xl2 bg-surface hairline shadow-card overflow-hidden">
      {/* Header — the count is the headline; it reddens only when something is lost. */}
      <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 hairline-b">
        <div className="flex items-center gap-2.5">
          <span className="grid place-items-center w-8 h-8 rounded-[10px] bg-amber-50 text-amber-600">
            <Icon name="pulse" className="w-[18px] h-[18px]" strokeWidth={1.7} />
          </span>
          <div>
            <h3 className="font-extrabold tracking-tight leading-none">Needs attention</h3>
            <p className="mt-1 text-fine text-ink-soft">Stores at risk of churning</p>
          </div>
        </div>
        {state.status === "ready" && count > 0 && (
          <span
            className={
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-cap font-bold tracking-wide " +
              (dangerCount > 0 ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600")
            }
          >
            {count} flagged
          </span>
        )}
      </div>

      {state.status === "loading" && (
        <div className="divide-y divide-[rgba(11,18,32,0.07)] dark:divide-[rgba(255,255,255,0.09)]">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="px-5 sm:px-6 py-3.5">
              <div className="h-10 rounded-[10px] bg-paper hairline animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {state.status === "error" && (
        <p className="px-6 py-10 text-center text-note text-rose-600 font-semibold">
          {state.message}
        </p>
      )}

      {state.status === "ready" && count === 0 && (
        <div className="px-6 py-12 text-center">
          <span className="inline-grid place-items-center w-11 h-11 rounded-full bg-accent-50 text-accent-600 mb-3">
            <Icon name="check" className="w-5 h-5" strokeWidth={2.2} />
          </span>
          <p className="font-bold tracking-tight">All stores healthy</p>
          <p className="mt-1 text-fine text-ink-soft">No churn signals across the platform right now.</p>
        </div>
      )}

      {state.status === "ready" && count > 0 && (
        <ul>
          {state.rows.map((t) => (
            <li key={t.id}>
              <RiskRow t={t} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* --------------------------------- row ---------------------------------- */

function RiskRow({ t }: { t: RiskTenant }) {
  const danger = t.severity === "danger";
  return (
    <Link
      href={`/admin/tenants?manage=${t.id}`}
      className={
        "group flex items-center gap-4 pl-4 pr-4 sm:pr-5 py-3.5 border-l-2 hairline-b last:border-b-0 transition duration-150 hover:bg-paper/70 " +
        (danger ? "border-l-rose-400" : "border-l-amber-400")
      }
    >
      {/* Store + owner */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-bold tracking-tight truncate">{t.name}</span>
          <PlanBadge plan={t.plan} />
        </div>
        <div className="text-fine text-ink-faint truncate">{t.ownerEmail ?? "No owner contact"}</div>
      </div>

      {/* Why it's flagged */}
      <ReasonChip t={t} />

      <Icon
        name="chevron"
        className="w-4 h-4 -rotate-90 text-ink-faint shrink-0 group-hover:text-brand-600 group-hover:translate-x-0.5 transition"
      />
    </Link>
  );
}

const REASON_LABEL: Record<RiskReason, string> = {
  suspended: "Suspended",
  trial_expired: "Trial expired",
  trial_ending: "Trial ending",
  dormant: "Dormant",
  never_sold: "No sales yet",
};

/** The flag chip + a one-line numeric detail (days silent / days of trial left). */
function ReasonChip({ t }: { t: RiskTenant }) {
  const danger = t.severity === "danger";
  const detail = reasonDetail(t);
  return (
    <div className="flex flex-col items-end gap-1 shrink-0 text-right">
      <span
        className={
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-cap font-bold tracking-wide " +
          (danger ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600")
        }
      >
        <span className={"w-1.5 h-1.5 rounded-full " + (danger ? "bg-rose-500" : "bg-amber-500")} />
        {REASON_LABEL[t.reason]}
      </span>
      {detail && <span className="text-fine text-ink-faint tabular-nums">{detail}</span>}
    </div>
  );
}

/** The human detail line under the chip — the number that makes the flag actionable. */
function reasonDetail(t: RiskTenant): string | null {
  switch (t.reason) {
    case "trial_ending": {
      const d = t.daysToTrialEnd;
      if (d === null) return null;
      if (d <= 0) return "ends today";
      return `${d} day${d === 1 ? "" : "s"} left`;
    }
    case "dormant": {
      const d = t.daysSinceActivity;
      return d === null ? null : `silent ${d} day${d === 1 ? "" : "s"}`;
    }
    case "never_sold":
      return "never rang a sale";
    case "trial_expired":
    case "suspended":
      return t.daysSinceActivity !== null ? `last sale ${t.daysSinceActivity}d ago` : null;
    default:
      return null;
  }
}
