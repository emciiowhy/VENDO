"use client";

import { useCallback, useState } from "react";
import { Icon, type IconName } from "../Icon";
import { useDashUser } from "../dash/DashShell";
import { StaffMatrix } from "../dash/StaffMatrix";
import { UpgradeCard } from "../FeatureGate";
import { CashierAttendance } from "./CashierAttendance";
import { asTier, featureAllowed } from "@/lib/tiers";

/**
 * Cashiers — the owner's one home for the people on the till:
 *   • Cashiers — till logins, PINs, opening float, PIN reset requests (any tier).
 *   • Attendance — hours each cashier worked from their Shift In / Shift Out,
 *     with a month calendar (Business+, `multi_staff_roles`).
 * There is no payroll: the owner works out pay from the hours. `?tab=` deep-links
 * a section; the old /dashboard/hr and /dashboard/staff URLs redirect here.
 */

type Tab = "cashiers" | "attendance";

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "cashiers", label: "Cashiers", icon: "pos" },
  { id: "attendance", label: "Attendance", icon: "clock" },
];

function readTab(): Tab {
  if (typeof window === "undefined") return "cashiers";
  const t = new URLSearchParams(window.location.search).get("tab");
  return t === "attendance" ? "attendance" : "cashiers";
}

export function CashiersWorkspace() {
  const user = useDashUser();
  const hasAttendance = featureAllowed(asTier(user.tier), "multi_staff_roles");
  const [tab, setTabState] = useState<Tab>(readTab);
  // Mount Attendance lazily, then keep both mounted so switching tabs never
  // refetches or drops an open form.
  const [attendanceSeen, setAttendanceSeen] = useState(tab === "attendance");
  const [cashierCount, setCashierCount] = useState<number | undefined>(undefined);
  const onCashierCount = useCallback((n: number) => setCashierCount(n), []);

  function setTab(next: Tab) {
    setTabState(next);
    if (next === "attendance") setAttendanceSeen(true);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(window.history.state, "", url);
  }

  return (
    <div className="space-y-6 max-w-[1180px]">
      <div role="tablist" aria-label="Cashiers sections" className="flex items-center gap-1 p-1 rounded-[14px] bg-paper hairline w-full sm:w-fit overflow-x-auto scrollbar-none">
        {TABS.map((s) => {
          const on = s.id === tab;
          const locked = s.id === "attendance" && !hasAttendance;
          const n = s.id === "cashiers" ? cashierCount : undefined;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(s.id)}
              title={locked ? "Business feature" : undefined}
              className={
                "shrink-0 inline-flex items-center gap-2 h-9 px-3.5 rounded-[10px] text-[13.5px] font-semibold whitespace-nowrap transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 " +
                (on ? "bg-surface text-ink shadow-card" : "text-ink-soft hover:text-ink")
              }
            >
              <Icon name={s.icon} className={"w-4 h-4 " + (on ? "text-brand-600" : "")} strokeWidth={1.8} />
              {s.label}
              {locked ? (
                <Icon name="lock" className="w-3.5 h-3.5 text-ink-faint" strokeWidth={1.9} />
              ) : n !== undefined ? (
                <span
                  className={
                    "min-w-5 h-5 px-1.5 grid place-items-center rounded-full text-[11px] font-bold tabular-nums " +
                    (on ? "bg-brand-50 text-brand-700" : "bg-ink/6 text-ink-faint")
                  }
                >
                  {n}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div hidden={tab !== "cashiers"} className="space-y-5">
        <div>
          <h2 className="text-[1.3rem] font-extrabold tracking-tightest">Cashiers</h2>
          <p className="text-[13.5px] text-ink-soft">
            Till logins — add or disable cashiers, set their 4-digit PINs and opening float, and resolve PIN reset
            requests.
          </p>
        </div>
        <StaffMatrix onCount={onCashierCount} />
      </div>

      {tab === "attendance" && !hasAttendance && (
        <UpgradeCard
          feature="multi_staff_roles"
          title="Cashier attendance"
          description="See how many hours each cashier worked from their Shift In / Shift Out, on a month calendar you can export for your own payroll."
        />
      )}
      {hasAttendance && attendanceSeen && (
        <div hidden={tab !== "attendance"} className="space-y-5">
          <div>
            <h2 className="text-[1.3rem] font-extrabold tracking-tightest">Attendance</h2>
            <p className="text-[13.5px] text-ink-soft">
              Hours each cashier worked, from their Shift In and Shift Out on the till. Use these hours to work out pay
              — VendoPOS doesn’t run payroll.
            </p>
          </div>
          <CashierAttendance />
        </div>
      )}
    </div>
  );
}
