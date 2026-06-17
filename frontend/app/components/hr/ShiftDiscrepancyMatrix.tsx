"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "../Icon";
import { formatCents } from "@/lib/format";
import {
  getShiftReconciliations,
  type ShiftReconciliation,
  type ShiftReconciliationReport,
  type ShiftStatus,
} from "@/lib/hr";

/**
 * Cashier Shift Discrepancy Matrix — the manager loss-prevention audit over the
 * cashier_shifts drawer ledger. Every closed shift in the window with its blind-
 * count variance and short/over status, filterable by date, status and cashier,
 * with red/amber/green conditional badges that surface shrink at a glance.
 *
 * Read-only: the POS Z-Read / owner force-close paths are the only writers of
 * these rows. Tenant-scoped server-side (OWNER/MANAGER) — a manager never sees
 * another store's drawers.
 */
function isoToday(): string {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}
function isoDaysAgo(n: number): string {
  const d = new Date(Date.now() - n * 86_400_000);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Signed centavo variance → "+₱12.50" / "−₱8.00" / "₱0.00". */
function signedVariance(cents: number): string {
  if (cents === 0) return formatCents(0);
  return (cents > 0 ? "+" : "−") + formatCents(Math.abs(cents));
}

const STATUS_STYLE: Record<ShiftStatus, { pill: string; label: string }> = {
  balanced: { pill: "bg-accent-50 text-accent-600", label: "Balanced" },
  short: { pill: "bg-rose-50 text-rose-600", label: "Short" },
  over: { pill: "bg-amber-50 text-amber-600", label: "Over" },
};

type StatusFilter = "all" | ShiftStatus;

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; report: ShiftReconciliationReport };

export function ShiftDiscrepancyMatrix() {
  const [from, setFrom] = useState(isoDaysAgo(29));
  const [to, setTo] = useState(isoToday());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [cashier, setCashier] = useState<string>("");
  const [state, setState] = useState<State>({ status: "loading" });

  const rangeValid = from <= to;

  useEffect(() => {
    if (!rangeValid) {
      setState({ status: "error", message: "The start date must be on or before the end date." });
      return;
    }
    let alive = true;
    setState({ status: "loading" });
    void (async () => {
      const res = await getShiftReconciliations(from, to);
      if (!alive) return;
      if (res.ok) setState({ status: "ready", report: res.report });
      else setState({ status: "error", message: res.error ?? "Could not load shift reconciliations." });
    })();
    return () => {
      alive = false;
    };
  }, [from, to, rangeValid]);

  const report = state.status === "ready" ? state.report : null;

  // Cashier options drawn from the loaded rows (names, de-duplicated).
  const cashierNames = useMemo(() => {
    if (!report) return [];
    return [...new Set(report.rows.map((r) => r.cashierName))].sort((a, b) => a.localeCompare(b));
  }, [report]);

  const filtered = useMemo(() => {
    if (!report) return [];
    return report.rows.filter(
      (r) => (statusFilter === "all" || r.status === statusFilter) && (cashier === "" || r.cashierName === cashier),
    );
  }, [report, statusFilter, cashier]);

  return (
    <div className="space-y-5">
      {/* Summary KPIs */}
      {report && (
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Kpi icon="receipt" label="Shifts closed" value={String(report.totals.shifts)} />
          <Kpi
            icon="peso"
            label="Net variance"
            value={signedVariance(report.totals.netVarianceCents)}
            tone={report.totals.netVarianceCents === 0 ? "good" : report.totals.netVarianceCents < 0 ? "bad" : "warn"}
          />
          <Kpi icon="shield" label="Total shrink (abs)" value={formatCents(report.totals.absVarianceCents)} tone={report.totals.absVarianceCents > 0 ? "warn" : "good"} />
          <Kpi
            icon="ban"
            label="Short / over shifts"
            value={`${report.totals.shortCount} / ${report.totals.overCount}`}
            tone={report.totals.shortCount > 0 ? "bad" : "good"}
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 rounded-xl2 bg-surface hairline shadow-card px-5 py-4">
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-soft">
          From
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="field-input rounded-[10px] px-3 py-2 text-[14px]" />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-soft">
          To
          <input type="date" value={to} min={from} max={isoToday()} onChange={(e) => setTo(e.target.value)} className="field-input rounded-[10px] px-3 py-2 text-[14px]" />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-soft">
          Status
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="field-input rounded-[10px] px-3 py-2 text-[14px]">
            <option value="all">All</option>
            <option value="short">Short only</option>
            <option value="over">Over only</option>
            <option value="balanced">Balanced only</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-soft">
          Cashier
          <select value={cashier} onChange={(e) => setCashier(e.target.value)} className="field-input rounded-[10px] px-3 py-2 text-[14px] min-w-[160px]">
            <option value="">All cashiers</option>
            {cashierNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Matrix */}
      {state.status === "loading" && (
        <div className="rounded-xl2 bg-surface hairline shadow-card h-[260px] animate-pulse" />
      )}
      {state.status === "error" && (
        <div className="rounded-xl2 bg-surface hairline shadow-card p-8 text-center">
          <p className="text-[14px] font-semibold text-rose-600">{state.message}</p>
        </div>
      )}
      {state.status === "ready" && (
        <div className="rounded-xl2 bg-surface hairline shadow-card overflow-hidden">
          {filtered.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <span className="inline-grid place-items-center w-12 h-12 rounded-[14px] bg-brand-50 text-brand-600">
                <Icon name="receipt" className="w-6 h-6" strokeWidth={1.6} />
              </span>
              <p className="mt-3 text-[14px] font-semibold">No shifts match these filters</p>
              <p className="mt-1 text-[13px] text-ink-soft max-w-[44ch] mx-auto">
                Closed cashier shifts and their drawer variance appear here once a shift is reconciled.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[11.5px] font-semibold text-ink-faint border-b border-ink/8 bg-paper/40">
                    <th className="px-5 py-2.5 font-semibold">Cashier</th>
                    <th className="px-3 py-2.5 font-semibold">Closed</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Opening</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Cash sales</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Expected</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Counted</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Variance</th>
                    <th className="px-5 py-2.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <Row key={r.id} r={r} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ r }: { r: ShiftReconciliation }) {
  const style = STATUS_STYLE[r.status];
  const varianceColor = r.status === "balanced" ? "text-accent-600" : r.status === "short" ? "text-rose-600" : "text-amber-600";
  return (
    <tr className="border-b border-ink/5 last:border-0 hover:bg-paper/40 transition">
      <td className="px-5 py-3">
        <span className="font-semibold">{r.cashierName}</span>
        {r.note && <span className="block text-[11px] text-ink-faint max-w-[28ch] truncate" title={r.note}>{r.note}</span>}
      </td>
      <td className="px-3 py-3 text-ink-soft whitespace-nowrap tabular-nums">{formatDateTime(r.closedAt)}</td>
      <td className="px-3 py-3 text-right tabular-nums">{formatCents(r.openingCents)}</td>
      <td className="px-3 py-3 text-right tabular-nums">{formatCents(r.cashSalesCents)}</td>
      <td className="px-3 py-3 text-right tabular-nums">{formatCents(r.expectedCashCents)}</td>
      <td className="px-3 py-3 text-right tabular-nums">{formatCents(r.countedCashCents)}</td>
      <td className={"px-3 py-3 text-right font-bold tabular-nums whitespace-nowrap " + varianceColor}>
        {signedVariance(r.varianceCents)}
      </td>
      <td className="px-5 py-3">
        <span className={"inline-block text-[11px] font-bold rounded-full px-2.5 py-0.5 " + style.pill}>{style.label}</span>
      </td>
    </tr>
  );
}

function Kpi({ icon, label, value, tone }: { icon: IconName; label: string; value: string; tone?: "good" | "warn" | "bad" }) {
  const iconTone =
    tone === "bad" ? "bg-rose-50 text-rose-600" : tone === "warn" ? "bg-amber-50 text-amber-600" : tone === "good" ? "bg-accent-50 text-accent-600" : "bg-brand-50 text-brand-600";
  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-cap font-semibold uppercase tracking-wider text-ink-faint">{label}</span>
        <span className={"grid place-items-center w-8 h-8 rounded-[10px] " + iconTone}>
          <Icon name={icon} className="w-[17px] h-[17px]" strokeWidth={1.8} />
        </span>
      </div>
      <div className="mt-3.5 text-stat font-extrabold tracking-tightest tabular-nums text-ink">{value}</div>
    </div>
  );
}
