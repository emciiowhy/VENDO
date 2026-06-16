"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "../Icon";
import { formatCents } from "@/lib/format";
import { listAuditLogs, type AuditAction, type AuditLog, type AuditSummary } from "@/lib/pos";

/**
 * Owner/manager view of the POS terminal audit trail — the sensitive shop-floor
 * actions (cart voids, cancelled transactions, drawer pops) that never reach the
 * sales ledger, surfaced so the owner can spot unauthorised cashier activity.
 * Read-only and tenant-scoped server-side; the log itself is append-only.
 */

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; logs: AuditLog[]; summary: AuditSummary };

const ACTION_META: Record<AuditAction, { label: string; icon: IconName; chip: string }> = {
  void_item: { label: "Item voided", icon: "ban", chip: "bg-amber-50 text-amber-700" },
  cancel_transaction: { label: "Transaction cancelled", icon: "x", chip: "bg-rose-50 text-rose-600" },
  open_drawer: { label: "Drawer opened", icon: "wallet", chip: "bg-brand-50 text-brand-700" },
};

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AuditConsole() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await listAuditLogs(200);
      if (!alive) return;
      if (res.ok) setState({ status: "ready", logs: res.logs, summary: res.summary });
      else setState({ status: "error", message: res.error ?? "Could not load the audit log." });
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="space-y-6 max-w-[1180px]">
      <div>
        <h2 className="text-[1.3rem] font-extrabold tracking-tightest">Terminal audit log</h2>
        <p className="text-[13.5px] text-ink-soft">
          Every cart void, cancelled sale and cash-drawer pop on your registers — your shrinkage
          tripwire.
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
            <Kpi icon="receipt" label="Logged events" value={String(state.summary.total)} />
            <Kpi
              icon="ban"
              label="Items voided"
              value={String(state.summary.byAction.void_item)}
              tone="warn"
            />
            <Kpi
              icon="x"
              label="Cancelled sales"
              value={String(state.summary.byAction.cancel_transaction)}
              tone="danger"
            />
            <Kpi
              icon="peso"
              label="Value flagged"
              value={formatCents(state.summary.flaggedValueCents)}
            />
          </div>

          {state.logs.length === 0 ? (
            <div className="rounded-xl2 bg-surface hairline shadow-card px-5 py-14 text-center">
              <span className="inline-grid place-items-center w-12 h-12 rounded-[14px] bg-accent-50 text-accent-600">
                <Icon name="shield" className="w-6 h-6" strokeWidth={1.6} />
              </span>
              <p className="mt-3 text-[14px] font-semibold">No flagged activity yet</p>
              <p className="mt-1 text-[13px] text-ink-soft max-w-[44ch] mx-auto">
                When a cashier voids a line, cancels a transaction or opens the drawer with no sale,
                it lands here for you to review.
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
                      <th className="px-3 py-2.5 font-semibold">Action</th>
                      <th className="px-3 py-2.5 font-semibold">Item</th>
                      <th className="px-5 py-2.5 font-semibold text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.logs.map((log) => {
                      const meta = ACTION_META[log.action];
                      return (
                        <tr key={log.id} className="border-b border-ink/5 last:border-0 hover:bg-paper/40 transition">
                          <td className="px-5 py-3 text-ink-soft tabular-nums whitespace-nowrap">
                            {fmtWhen(log.createdAt)}
                          </td>
                          <td className="px-3 py-3 font-semibold">{log.cashierName}</td>
                          <td className="px-3 py-3">
                            <span className={"inline-flex items-center gap-1.5 text-[11.5px] font-bold rounded-full px-2.5 py-0.5 " + meta.chip}>
                              <Icon name={meta.icon} className="w-3.5 h-3.5" strokeWidth={1.9} />
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-ink-soft">
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
                            {log.action === "open_drawer" ? (
                              <span className="text-ink-faint">—</span>
                            ) : (
                              formatCents(log.valueCents)
                            )}
                          </td>
                        </tr>
                      );
                    })}
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
