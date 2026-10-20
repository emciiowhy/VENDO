"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "../Icon";
import { formatCents } from "@/lib/format";
import {
  listAuditLogs,
  listReversals,
  type ActivityAction,
  type ActivityActor,
  type AuditLog,
  type AuditSummary,
  type ReversalLogEntry,
  type ReversalSummary,
} from "@/lib/pos";

/**
 * Owner/manager activity log — one timeline of what every staff member did:
 * sales, refunds, voids, discounts, sign-in/out, Shift In/Out on the labor
 * clock, cash-drawer open/close, plus the shop-floor events (cart voids,
 * cancelled sales, drawer pops) that never reach the sales ledger. Read-only
 * and tenant-scoped server-side; the log itself is append-only, and cashiers
 * get a 403 reading it.
 */

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; logs: AuditLog[]; actors: ActivityActor[]; summary: AuditSummary };

const WARN = "bg-amber-50 text-amber-700";
const DANGER = "bg-rose-50 text-rose-600";
const BRAND = "bg-brand-50 text-brand-700";
const GOOD = "bg-accent-50 text-accent-600";
const MUTED = "bg-paper text-ink-soft hairline";

const ACTION_META: Record<ActivityAction, { label: string; icon: IconName; chip: string }> = {
  sale: { label: "Sale", icon: "receipt", chip: GOOD },
  discount_applied: { label: "Discount applied", icon: "tag", chip: BRAND },
  refund: { label: "Refund / return", icon: "refresh", chip: WARN },
  void_sale: { label: "Sale voided", icon: "ban", chip: DANGER },
  void_item: { label: "Item voided", icon: "ban", chip: WARN },
  cancel_transaction: { label: "Transaction cancelled", icon: "x", chip: DANGER },
  open_drawer: { label: "Drawer opened (no sale)", icon: "wallet", chip: WARN },
  shift_open: { label: "Drawer opened (shift start)", icon: "wallet", chip: BRAND },
  shift_close: { label: "Drawer closed (Z-Read)", icon: "wallet", chip: BRAND },
  clock_in: { label: "Shift In", icon: "clock", chip: GOOD },
  clock_out: { label: "Shift Out", icon: "clock", chip: MUTED },
  login: { label: "Signed in", icon: "lock", chip: MUTED },
  logout: { label: "Signed out", icon: "logout", chip: MUTED },
  timecard_corrected: { label: "Timecard corrected", icon: "pencil", chip: WARN },
  payroll_approved: { label: "Payroll approved", icon: "check", chip: GOOD },
};

/** Value is meaningless for these, so the column shows a dash. */
const NO_VALUE: ReadonlySet<ActivityAction> = new Set([
  "open_drawer",
  "login",
  "logout",
  "clock_in",
  "clock_out",
  "timecard_corrected",
]);

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const SELECT =
  "field-input w-full rounded-[10px] px-3 py-2 text-[13.5px] transition duration-150 ease-in-out";

export function AuditConsole() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [who, setWho] = useState("");
  const [action, setAction] = useState<ActivityAction | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await listAuditLogs({ userId: who, action: action || undefined, from, to, limit: 200 });
      if (!alive) return;
      if (res.ok) setState({ status: "ready", logs: res.logs, actors: res.actors ?? [], summary: res.summary });
      else setState({ status: "error", message: res.error ?? "Could not load the activity log." });
    })();
    return () => {
      alive = false;
    };
  }, [who, action, from, to]);

  const filtered = who !== "" || action !== "" || from !== "" || to !== "";
  const s = state.status === "ready" ? state.summary : null;

  return (
    <div className="space-y-6 max-w-[1180px]">
      <div>
        <h2 className="text-[1.3rem] font-extrabold tracking-tightest">Activity log</h2>
        <p className="text-[13.5px] text-ink-soft">
          What every staff member did — sales, refunds, voids, discounts, sign-ins and Shift In/Out. Only
          owners and managers can see this.
        </p>
      </div>

      {/* Filters */}
      <div className="rounded-xl2 bg-surface hairline shadow-card p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto_auto] lg:items-end">
        <label className="block space-y-1">
          <span className="text-[12px] font-semibold text-ink-faint">Who</span>
          <select value={who} onChange={(e) => setWho(e.target.value)} className={SELECT}>
            <option value="">Everyone</option>
            {state.status === "ready" &&
              state.actors.map((a) => (
                <option key={a.userId} value={a.userId}>
                  {a.name}
                </option>
              ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] font-semibold text-ink-faint">Action</span>
          <select value={action} onChange={(e) => setAction(e.target.value as ActivityAction | "")} className={SELECT}>
            <option value="">All actions</option>
            {(Object.keys(ACTION_META) as ActivityAction[]).map((a) => (
              <option key={a} value={a}>
                {ACTION_META[a].label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] font-semibold text-ink-faint">From</span>
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={SELECT} />
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] font-semibold text-ink-faint">To</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={SELECT} />
        </label>
        <button
          type="button"
          onClick={() => {
            setWho("");
            setAction("");
            setFrom("");
            setTo("");
          }}
          disabled={!filtered}
          className="h-[38px] px-4 rounded-[10px] text-[13px] font-semibold text-ink-soft hover:text-ink hover:bg-paper disabled:opacity-40"
        >
          Clear
        </button>
      </div>

      {state.status === "loading" && <Skeleton />}
      {state.status === "error" && (
        <div className="rounded-xl2 bg-surface hairline shadow-card p-8 text-center">
          <p className="text-[14px] font-semibold text-rose-600">{state.message}</p>
        </div>
      )}

      {state.status === "ready" && s && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi icon="receipt" label={filtered ? "Events shown" : "Recent events"} value={String(s.total)} />
            <Kpi icon="cart" label="Sales" value={String(s.byAction.sale)} />
            <Kpi
              icon="ban"
              label="Voids, refunds & cancels"
              value={String(s.byAction.void_sale + s.byAction.refund + s.byAction.void_item + s.byAction.cancel_transaction)}
              tone="warn"
            />
            <Kpi icon="peso" label="Value flagged" value={formatCents(s.flaggedValueCents)} tone="danger" />
          </div>

          {state.logs.length === 0 ? (
            <div className="rounded-xl2 bg-surface hairline shadow-card px-5 py-14 text-center">
              <span className="inline-grid place-items-center w-12 h-12 rounded-[14px] bg-accent-50 text-accent-600">
                <Icon name="shield" className="w-6 h-6" strokeWidth={1.6} />
              </span>
              <p className="mt-3 text-[14px] font-semibold">{filtered ? "Nothing matches these filters" : "No activity yet"}</p>
              <p className="mt-1 text-[13px] text-ink-soft max-w-[44ch] mx-auto">
                Sales, refunds, discounts, sign-ins and Shift In/Out from your registers land here.
              </p>
            </div>
          ) : (
            <div className="rounded-xl2 bg-surface hairline shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[13.5px]">
                  <thead>
                    <tr className="text-left text-[12px] font-semibold text-ink-faint border-b border-ink/8 bg-paper/40">
                      <th className="px-5 py-2.5 font-semibold">When</th>
                      <th className="px-3 py-2.5 font-semibold">Who</th>
                      <th className="px-3 py-2.5 font-semibold">Action</th>
                      <th className="px-3 py-2.5 font-semibold">Details</th>
                      <th className="px-5 py-2.5 font-semibold text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.logs.map((log) => {
                      const meta = ACTION_META[log.action] ?? { label: log.action, icon: "activity" as IconName, chip: MUTED };
                      return (
                        <tr key={log.id} className="border-b border-ink/5 last:border-0 hover:bg-paper/40 transition">
                          <td className="px-5 py-3 text-ink-soft tabular-nums whitespace-nowrap">{fmtWhen(log.createdAt)}</td>
                          <td className="px-3 py-3 font-semibold whitespace-nowrap">{log.cashierName}</td>
                          <td className="px-3 py-3">
                            <span className={"inline-flex items-center gap-1.5 whitespace-nowrap text-[11.5px] font-bold rounded-full px-2.5 py-0.5 " + meta.chip}>
                              <Icon name={meta.icon} className="w-3.5 h-3.5" strokeWidth={1.9} />
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-ink-soft min-w-[14rem]">
                            {log.itemName ? (
                              <>
                                {log.itemName}
                                {log.itemQty ? <span className="text-ink-faint"> ×{log.itemQty}</span> : null}
                              </>
                            ) : (
                              <span className="text-ink-faint">{log.detail ?? "—"}</span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right font-bold tracking-tight tabular-nums whitespace-nowrap">
                            {NO_VALUE.has(log.action) ? <span className="text-ink-faint">—</span> : formatCents(log.valueCents)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {state.logs.length >= 200 && (
                <p className="px-5 py-3 text-[12.5px] text-ink-faint hairline-t">
                  Showing the latest 200 — narrow the dates or pick a person to see older activity.
                </p>
              )}
            </div>
          )}
        </>
      )}

      <ReversalsReview />
    </div>
  );
}

/**
 * Committed voids & returns — the money-back reversals, sourced from the sales
 * ledger. Sits beside the terminal-action log so the owner has one place to see
 * every reversal with the cashier who did it and the reason they were made to
 * give. Independent fetch so a hiccup in one section never blanks the other.
 */
function ReversalsReview() {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; reversals: ReversalLogEntry[]; summary: ReversalSummary }
  >({ status: "loading" });

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await listReversals(200);
      if (!alive) return;
      if (res.ok) setState({ status: "ready", reversals: res.reversals, summary: res.summary });
      else setState({ status: "error", message: res.error ?? "Could not load reversals." });
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="space-y-5 pt-4">
      <div>
        <h2 className="text-[1.3rem] font-extrabold tracking-tightest">Refunds &amp; voids</h2>
        <p className="text-[13.5px] text-ink-soft">
          Every committed void and return on your registers — the cashier who processed it and the
          reason they gave.
        </p>
      </div>

      {state.status === "loading" && <Skeleton />}
      {state.status === "error" && (
        <div className="rounded-xl2 bg-surface hairline shadow-card p-8 text-center">
          <p className="text-[14px] font-semibold text-rose-600">{state.message}</p>
        </div>
      )}

      {state.status === "ready" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi icon="refresh" label="Reversals" value={String(state.summary.total)} />
            <Kpi icon="ban" label="Voided sales" value={String(state.summary.voids)} tone="danger" />
            <Kpi icon="refresh" label="Returns" value={String(state.summary.returns)} tone="warn" />
            <Kpi icon="peso" label="Total refunded" value={formatCents(state.summary.refundedCents)} tone="danger" />
          </div>

          {state.reversals.length === 0 ? (
            <div className="rounded-xl2 bg-surface hairline shadow-card px-5 py-14 text-center">
              <span className="inline-grid place-items-center w-12 h-12 rounded-[14px] bg-accent-50 text-accent-600">
                <Icon name="shield" className="w-6 h-6" strokeWidth={1.6} />
              </span>
              <p className="mt-3 text-[14px] font-semibold">No refunds or voids yet</p>
              <p className="mt-1 text-[13px] text-ink-soft max-w-[46ch] mx-auto">
                When a cashier voids a sale or returns items, it lands here with their name and the
                reason they entered.
              </p>
            </div>
          ) : (
            <div className="rounded-xl2 bg-surface hairline shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[13.5px]">
                  <thead>
                    <tr className="text-left text-[12px] font-semibold text-ink-faint border-b border-ink/8 bg-paper/40">
                      <th className="px-5 py-2.5 font-semibold">When</th>
                      <th className="px-3 py-2.5 font-semibold">Cashier</th>
                      <th className="px-3 py-2.5 font-semibold">Type</th>
                      <th className="px-3 py-2.5 font-semibold">Against</th>
                      <th className="px-3 py-2.5 font-semibold">Reason</th>
                      <th className="px-5 py-2.5 font-semibold text-right">Refunded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.reversals.map((r) => (
                      <tr key={r.id} className="border-b border-ink/5 last:border-0 hover:bg-paper/40 transition">
                        <td className="px-5 py-3 text-ink-soft tabular-nums whitespace-nowrap">
                          {fmtWhen(r.createdAt)}
                        </td>
                        <td className="px-3 py-3 font-semibold">{r.cashierName ?? "—"}</td>
                        <td className="px-3 py-3">
                          <span
                            className={
                              "inline-flex items-center gap-1.5 text-[11.5px] font-bold rounded-full px-2.5 py-0.5 " +
                              (r.kind === "void" ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-700")
                            }
                          >
                            <Icon name={r.kind === "void" ? "ban" : "refresh"} className="w-3.5 h-3.5" strokeWidth={1.9} />
                            {r.kind === "void" ? "Void" : "Return"}
                          </span>
                        </td>
                        <td className="px-3 py-3 font-mono text-ink-soft whitespace-nowrap">
                          {r.originalReference ?? "—"}
                        </td>
                        <td className="px-3 py-3 text-ink-soft max-w-[260px]">
                          {r.reason ? (
                            <span className="line-clamp-2">{r.reason}</span>
                          ) : (
                            <span className="text-ink-faint">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right font-bold tracking-tight tabular-nums whitespace-nowrap text-rose-600">
                          −{formatCents(r.amountCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  tone,
}: {
  icon: IconName;
  label: string;
  value: string;
  tone?: "warn" | "danger";
}) {
  const chip =
    tone === "danger"
      ? "bg-rose-50 text-rose-600"
      : tone === "warn"
        ? "bg-amber-50 text-amber-600"
        : "bg-brand-50 text-brand-600";
  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card p-5">
      <span className={"grid place-items-center w-9 h-9 rounded-[10px] " + chip}>
        <Icon name={icon} className="w-[18px] h-[18px]" strokeWidth={1.7} />
      </span>
      <div className="mt-3 text-[1.7rem] leading-none font-extrabold tracking-tightest">{value}</div>
      <div className="mt-1.5 text-[12.5px] text-ink-soft">{label}</div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl2 bg-surface hairline shadow-card h-[120px]" />
        ))}
      </div>
      <div className="rounded-xl2 bg-surface hairline shadow-card h-[320px]" />
    </div>
  );
}
