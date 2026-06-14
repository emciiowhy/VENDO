"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../Icon";
import { formatCents, formatCentsWhole, formatCount } from "@/lib/format";
import {
  getPlatformCompliance,
  platformComplianceCsvUrl,
  type PlatformComplianceSummary,
  type TenantComplianceRow,
} from "@/lib/adminCompliance";

/**
 * Super Admin — Platform Compliance Oversight. Rolls every active Tenant's
 * serialized output-VAT position up into one filing-period view: platform tax
 * totals with month-over-month deltas, a per-store register (issued-serial span
 * + sequence-integrity check, invoices, gross/VAT, reversals, a derived filing
 * status), a tenant search, per-store and consolidated CSV exports, and a
 * platform-health badge. Money arrives as centavos; every figure is live.
 *
 * Two months are fetched per period — the selected one and the one before it —
 * so the KPI trend chips compare real remittance against the prior filing
 * period. setState only runs after `await` in the effect, never synchronously.
 */

const PLAN_BADGE: Record<string, string> = {
  starter: "bg-paper text-ink-soft hairline",
  business: "bg-brand-50 text-brand-700",
  enterprise: "bg-accent-50 text-accent-600",
};

type FilingStatus = "filed" | "reversals" | "silent";

const STATUS_STYLE: Record<FilingStatus, { label: string; cls: string; dot: string }> = {
  filed: { label: "Filed", cls: "bg-accent-50 text-accent-600", dot: "bg-accent-500" },
  reversals: { label: "Reversals", cls: "bg-amber-50 text-amber-600", dot: "bg-amber-500" },
  silent: { label: "No filings", cls: "bg-paper text-ink-soft hairline", dot: "bg-ink-faint" },
};

export function ComplianceMatrix() {
  const [month, setMonth] = useState<string>(() => currentMonth());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<{
    label: string;
    summary: PlatformComplianceSummary;
    prev: PlatformComplianceSummary["totals"] | null;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [cur, prior] = await Promise.all([
        getPlatformCompliance(month),
        getPlatformCompliance(addMonths(month, -1)),
      ]);
      if (!alive) return;
      if (cur.ok) {
        setView({
          label: cur.label,
          summary: cur.summary,
          prev: prior.ok ? prior.summary.totals : null,
        });
        setError(null);
      } else {
        setError(cur.error ?? "Could not compile the platform summary.");
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [month]);

  const atCurrent = month >= currentMonth();

  function step(delta: number) {
    const next = addMonths(month, delta);
    if (next > currentMonth()) return; // never browse the future
    setMonth(next);
    setLoading(true);
    setError(null);
  }

  const totals = view?.summary.totals;
  const prev = view?.prev ?? null;
  const rows = view?.summary.rows ?? [];
  const label = view?.label ?? monthLabel(month);
  const hasData = !!totals && totals.invoiceCount > 0;

  const filtered = useMemo(() => {
    const all = view?.summary.rows ?? [];
    const q = query.trim().toLowerCase();
    return q ? all.filter((r) => r.tenant.toLowerCase().includes(q)) : all;
  }, [view, query]);

  return (
    <div className="space-y-7 max-w-[1180px]">
      {/* Toolbar: grouped filing-period control · platform status · CSV */}
      <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-start">
          <div className="inline-flex items-center gap-1 rounded-[12px] bg-surface hairline p-1">
            <PeriodButton onClick={() => step(-1)} label="Previous month" dir="prev" />
            <div className="px-2.5 min-w-[148px] text-center">
              <div className="flex items-center justify-center gap-1.5 text-[15px] font-extrabold tracking-tight">
                <Icon name="clock" className="w-4 h-4 text-ink-faint" strokeWidth={1.8} />
                {label}
              </div>
              <div className="text-[11px] text-ink-faint font-semibold uppercase tracking-wide">
                Filing period
              </div>
            </div>
            <PeriodButton onClick={() => step(1)} label="Next month" dir="next" disabled={atCurrent} />
          </div>
          <PlatformStatus totals={totals} storeCount={rows.length} />
        </div>

        <a
          href={platformComplianceCsvUrl(month)}
          className={
            "inline-flex items-center justify-center gap-2 font-semibold text-[14px] px-5 py-2.5 rounded-[10px] tracking-tight transition duration-150 " +
            (hasData
              ? "bg-brand-500 hover:bg-brand-600 text-white shadow-btn"
              : "bg-paper hairline text-ink-faint pointer-events-none")
          }
        >
          <Icon name="download" className="w-[18px] h-[18px]" strokeWidth={1.7} />
          Consolidated CSV
        </a>
      </div>

      {/* Platform tax totals */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Total
          icon="peso"
          label="Gross sales (VAT-incl)"
          value={totals ? formatCentsWhole(totals.grossCents) : "—"}
          delta={momPct(prev?.grossCents, totals?.grossCents)}
        />
        <Total
          icon="receipt"
          label="Output VAT (12%)"
          value={totals ? formatCentsWhole(totals.vatCents) : "—"}
          sub="platform-wide remittable"
          delta={momPct(prev?.vatCents, totals?.vatCents)}
          feature
        />
        <Total
          icon="file"
          label="Invoices issued"
          value={totals ? formatCount(totals.invoiceCount) : "—"}
          sub={totals ? `${formatCount(totals.reversalCount)} reversals` : undefined}
        />
        <Total
          icon="store"
          label="Stores filing"
          value={totals ? formatCount(totals.filedStores) : "—"}
          sub={
            totals && totals.silentStores > 0
              ? `${totals.silentStores} silent this month`
              : "all active stores filing"
          }
          warn={!!totals && totals.silentStores > 0}
        />
      </div>

      {/* Per-tenant oversight table */}
      <div className="rounded-xl2 bg-surface hairline shadow-card overflow-hidden">
        <div className="flex flex-col gap-3 px-5 sm:px-6 py-4 hairline-b sm:flex-row sm:items-center sm:justify-between">
          <h3 className="font-extrabold tracking-tight flex items-center gap-2">
            <Icon name="shield" className="w-[18px] h-[18px] text-brand-600" strokeWidth={1.8} />
            Tenant VAT register
          </h3>
          <div className="flex items-center gap-3">
            <label className="relative flex items-center">
              <Icon
                name="search"
                className="absolute left-3 w-[16px] h-[16px] text-ink-faint pointer-events-none"
                strokeWidth={1.8}
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search stores…"
                aria-label="Search stores by name"
                className="field-input rounded-[10px] pl-9 pr-3 py-2 text-[13px] w-[170px] focus:w-[210px] transition-[width] duration-200"
              />
            </label>
            <span className="hidden sm:block text-[12.5px] font-semibold text-ink-faint whitespace-nowrap">
              {totals
                ? query.trim()
                  ? `${formatCount(filtered.length)} of ${formatCount(rows.length)}`
                  : `${formatCount(rows.length)} active ${rows.length === 1 ? "store" : "stores"}`
                : ""}
            </span>
          </div>
        </div>

        {loading ? (
          <p className="px-6 py-12 text-center text-[13.5px] text-ink-soft">Compiling platform ledger…</p>
        ) : error ? (
          <p className="px-6 py-12 text-center text-[13.5px] text-rose-600">{error}</p>
        ) : rows.length === 0 ? (
          <p className="px-6 py-12 text-center text-[13.5px] text-ink-soft">
            No active stores to report for {label}.
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-6 py-12 text-center text-[13.5px] text-ink-soft">
            No stores match “{query.trim()}”.
          </p>
        ) : (
          <>
            {/* Phones: stacked per-store cards (the register table scrolls awkwardly under ~md). */}
            <ul className="md:hidden divide-y divide-[rgba(11,18,32,0.06)] dark:divide-[rgba(255,255,255,0.07)]">
              {filtered.map((r) => {
                const silent = r.invoiceCount === 0;
                return (
                  <li key={r.tenantId} className="px-5 py-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold tracking-tight text-[14px]">{r.tenant}</span>
                          <span
                            className={
                              "text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 " +
                              (PLAN_BADGE[r.plan] ?? PLAN_BADGE.starter)
                            }
                          >
                            {r.plan}
                          </span>
                          <StatusBadge status={rowStatus(r)} />
                        </div>
                        <SerialSpan row={r} className="mt-1.5" />
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-extrabold tracking-tight tabular-nums">{formatCents(r.grossCents)}</div>
                        <div className="text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">gross</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <MiniStat label="Invoices" value={silent ? "—" : formatCount(r.invoiceCount)} />
                      <MiniStat label="Net of VAT" value={formatCents(r.netCents)} />
                      <MiniStat label="Output VAT" value={formatCents(r.vatCents)} accent />
                    </div>
                    <div className="flex items-center justify-between">
                      {r.reversalCount > 0 ? (
                        <span className="text-[11.5px] text-amber-600 font-semibold">
                          {formatCount(r.reversalCount)} void/return
                        </span>
                      ) : (
                        <span />
                      )}
                      <TenantDownload month={month} row={r} />
                    </div>
                  </li>
                );
              })}
              {totals && (
                <li className="px-5 py-4 bg-brand-50/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11.5px] font-bold uppercase tracking-wide text-ink-faint">
                      Platform total
                    </span>
                    <span className="font-extrabold tracking-tight tabular-nums">
                      {formatCents(totals.grossCents)}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <MiniStat label="Invoices" value={formatCount(totals.invoiceCount)} />
                    <MiniStat label="Net of VAT" value={formatCents(totals.netCents)} />
                    <MiniStat label="Output VAT" value={formatCents(totals.vatCents)} accent />
                  </div>
                </li>
              )}
            </ul>

            {/* Tablet / iPad / desktop: full register table (scrolls horizontally only if truly cramped). */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[920px] text-left">
                <thead>
                  <tr className="text-[11px] font-bold tracking-wide text-ink-faint uppercase hairline-b">
                    <th className="px-6 py-3">Store</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Serial span</th>
                    <th className="px-4 py-3 text-right">Invoices</th>
                    <th className="px-4 py-3 text-right">Net of VAT</th>
                    <th className="px-4 py-3 text-right">Output VAT</th>
                    <th className="px-4 py-3 text-right">Gross</th>
                    <th className="px-6 py-3 text-right">Report</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const silent = r.invoiceCount === 0;
                    return (
                      <tr
                        key={r.tenantId}
                        className="hairline-b last:border-0 hover:bg-paper/70 transition duration-150"
                      >
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold tracking-tight text-[13.5px]">{r.tenant}</span>
                            <span
                              className={
                                "text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 " +
                                (PLAN_BADGE[r.plan] ?? PLAN_BADGE.starter)
                              }
                            >
                              {r.plan}
                            </span>
                          </div>
                          {r.reversalCount > 0 && (
                            <div className="text-[11.5px] text-amber-600 font-semibold mt-0.5">
                              {formatCount(r.reversalCount)} void/return
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={rowStatus(r)} />
                        </td>
                        <td className="px-4 py-3">
                          <SerialSpan row={r} />
                        </td>
                        <td className="px-4 py-3 text-right text-[13px] tabular-nums">
                          {silent ? "—" : formatCount(r.invoiceCount)}
                        </td>
                        <td className="px-4 py-3 text-right text-[13px] tabular-nums text-ink-soft">
                          {formatCents(r.netCents)}
                        </td>
                        <td className="px-4 py-3 text-right text-[13px] tabular-nums font-semibold text-brand-700">
                          {formatCents(r.vatCents)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold tracking-tight tabular-nums">
                          {formatCents(r.grossCents)}
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex justify-end">
                            <TenantDownload month={month} row={r} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {totals && (
                  <tfoot>
                    {/* Pinned platform-total row: a quiet brand wash sets it apart
                        from the per-store rows above it. */}
                    <tr className="bg-brand-50/40 font-bold hairline-t">
                      <td className="px-6 py-3.5 text-[12.5px] uppercase tracking-wide text-ink-faint" colSpan={3}>
                        Platform total
                      </td>
                      <td className="px-4 py-3.5 text-right text-[13px] tabular-nums">
                        {formatCount(totals.invoiceCount)}
                      </td>
                      <td className="px-4 py-3.5 text-right text-[13px] tabular-nums">
                        {formatCents(totals.netCents)}
                      </td>
                      <td className="px-4 py-3.5 text-right text-[13px] tabular-nums text-brand-700">
                        {formatCents(totals.vatCents)}
                      </td>
                      <td className="px-4 py-3.5 text-right tracking-tight tabular-nums">
                        {formatCents(totals.grossCents)}
                      </td>
                      <td className="px-6 py-3.5" />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Derived filing status — purely from the live ledger, no fabricated workflow. */
function rowStatus(r: TenantComplianceRow): FilingStatus {
  if (r.invoiceCount === 0) return "silent";
  if (r.reversalCount > 0) return "reversals";
  return "filed";
}

function StatusBadge({ status }: { status: FilingStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 " +
        s.cls
      }
    >
      <span className={"w-1.5 h-1.5 rounded-full " + s.dot} />
      {s.label}
    </span>
  );
}

/**
 * The issued-serial range with a sequence-integrity check. The POS hands out
 * gap-free `SI-` numbers per store (voids/returns burn a separate VD-/RV-
 * counter), so within a month the span should be perfectly contiguous — a green
 * dot confirms `last − first + 1 === invoices`; an amber dot would flag a hole
 * worth auditing before remittance.
 */
function SerialSpan({ row, className = "" }: { row: TenantComplianceRow; className?: string }) {
  if (row.invoiceCount === 0) {
    return (
      <span className={"inline-flex items-center gap-1.5 text-amber-600 font-semibold text-[12px] " + className}>
        <Icon name="ban" className="w-[14px] h-[14px]" strokeWidth={1.8} />
        no filings
      </span>
    );
  }
  const clean = sequenceClean(row);
  return (
    <span className={"inline-flex items-center gap-2 " + className}>
      <span
        className={
          "w-1.5 h-1.5 rounded-full shrink-0 " + (clean === false ? "bg-amber-500" : "bg-accent-500")
        }
        title={clean === false ? "Possible gap in serial sequence" : "Clean, contiguous sequence"}
      />
      <span className="font-mono text-[12.5px] text-ink-soft whitespace-nowrap">
        {row.firstSerial === row.lastSerial ? row.firstSerial : `${row.firstSerial} → ${row.lastSerial}`}
      </span>
    </span>
  );
}

/** Per-store filing report download (CSV). Muted for stores with nothing filed. */
function TenantDownload({ month, row }: { month: string; row: TenantComplianceRow }) {
  const empty = row.invoiceCount === 0;
  if (empty) {
    return (
      <span
        className="grid place-items-center w-8 h-8 rounded-[8px] text-ink-faint/50 pointer-events-none"
        aria-hidden="true"
      >
        <Icon name="download" className="w-[16px] h-[16px]" strokeWidth={1.7} />
      </span>
    );
  }
  return (
    <a
      href={platformComplianceCsvUrl(month, row.tenantId)}
      title={`Download ${row.tenant}'s VAT report`}
      aria-label={`Download ${row.tenant}'s VAT report`}
      className="grid place-items-center w-8 h-8 rounded-[8px] text-ink-soft hover:text-brand-600 hover:bg-brand-50 transition duration-150"
    >
      <Icon name="download" className="w-[16px] h-[16px]" strokeWidth={1.7} />
    </a>
  );
}

/** Platform-health pill — derived from the real count of non-filing stores. */
function PlatformStatus({
  totals,
  storeCount,
}: {
  totals: PlatformComplianceSummary["totals"] | undefined;
  storeCount: number;
}) {
  if (!totals || storeCount === 0) return null;
  const compliant = totals.silentStores === 0;
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 text-[12px] font-bold rounded-full px-3 py-1.5 " +
        (compliant ? "bg-accent-50 text-accent-600" : "bg-amber-50 text-amber-600")
      }
    >
      <Icon name={compliant ? "shield" : "ban"} className="w-[15px] h-[15px]" strokeWidth={1.9} />
      {compliant
        ? "System compliant"
        : `${totals.silentStores} ${totals.silentStores === 1 ? "store" : "stores"} not filing`}
    </span>
  );
}

function PeriodButton({
  onClick,
  label,
  dir,
  disabled,
}: {
  onClick: () => void;
  label: string;
  dir: "prev" | "next";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      disabled={disabled}
      className="grid place-items-center w-8 h-8 rounded-[9px] text-ink-soft hover:text-ink hover:bg-paper transition duration-150 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-soft"
    >
      <Icon
        name="chevron"
        className={"w-[18px] h-[18px] " + (dir === "prev" ? "rotate-90" : "-rotate-90")}
        strokeWidth={1.8}
      />
    </button>
  );
}

function Total({
  icon,
  label,
  value,
  sub,
  delta,
  feature,
  warn,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  value: string;
  sub?: string;
  delta?: number | null;
  /** The Output-VAT card — the figure that's actually owed — wears a brand accent. */
  feature?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={
        "rounded-xl2 bg-surface p-5 " +
        (feature
          ? "ring-1 ring-brand-200 shadow-soft relative overflow-hidden"
          : "hairline shadow-card")
      }
    >
      {feature && (
        <span
          className="pointer-events-none absolute -top-10 -right-10 w-28 h-28 rounded-full bg-brand-400/15 blur-2xl"
          aria-hidden="true"
        />
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span
            className={
              "grid place-items-center w-9 h-9 rounded-[10px] " +
              (feature ? "bg-brand-500 text-white" : "bg-brand-50 text-brand-600")
            }
          >
            <Icon name={icon} className="w-[18px] h-[18px]" strokeWidth={1.7} />
          </span>
          <span className="text-[11.5px] font-bold tracking-wide text-ink-faint uppercase leading-tight">
            {label}
          </span>
        </div>
        {delta !== undefined && <TrendChip value={delta} />}
      </div>
      <div
        className={
          "mt-3 text-[1.7rem] leading-none font-extrabold tracking-tightest tabular-nums " +
          (feature ? "text-brand-600" : "")
        }
      >
        {value}
      </div>
      {sub && (
        <div className={"mt-1.5 text-[12.5px] " + (warn ? "text-amber-600 font-semibold" : "text-ink-soft")}>
          {sub}
        </div>
      )}
    </div>
  );
}

/** A compact "+2.5% vs last period" chip; hidden when there's no baseline. */
function TrendChip({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return null;
  const up = value >= 0;
  return (
    <span
      className={
        "inline-flex items-center gap-0.5 text-[11.5px] font-bold rounded-full px-1.5 py-0.5 " +
        (up ? "text-accent-600 bg-accent-50" : "text-rose-600 bg-rose-50")
      }
      title="vs. previous filing period"
    >
      <svg
        viewBox="0 0 24 24"
        className="w-3 h-3"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {up ? <path d="M6 15l6-6 6 6" /> : <path d="M6 9l6 6 6-6" />}
      </svg>
      {Math.abs(value)}%
    </span>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-[10px] bg-paper hairline py-2 px-1">
      <div
        className={
          "text-[13px] font-extrabold tracking-tight tabular-nums " + (accent ? "text-brand-700" : "")
        }
      >
        {value}
      </div>
      <div className="mt-0.5 text-[10.5px] font-semibold text-ink-faint">{label}</div>
    </div>
  );
}

/** Parse the trailing number off an `SI-000045` style serial. */
function parseSerial(s: string | null): number | null {
  if (!s) return null;
  const m = s.match(/(\d+)\s*$/);
  return m ? Number(m[1]) : null;
}

/** Whether a month's serial span is contiguous: last − first + 1 === invoices. */
function sequenceClean(r: TenantComplianceRow): boolean | null {
  const first = parseSerial(r.firstSerial);
  const last = parseSerial(r.lastSerial);
  if (first === null || last === null) return null;
  return last - first + 1 === r.invoiceCount;
}

/** Month-over-month percentage change, rounded to 0.1; null when no baseline. */
function momPct(prev: number | undefined, cur: number | undefined): number | null {
  if (prev === undefined || cur === undefined || prev <= 0) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-PH", { month: "long", year: "numeric" });
}
