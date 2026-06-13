"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { formatCents, formatCentsWhole, formatCount } from "@/lib/format";
import {
  getPlatformCompliance,
  platformComplianceCsvUrl,
  type PlatformComplianceSummary,
} from "@/lib/adminCompliance";

/**
 * Super Admin — Platform Compliance Oversight. Rolls every active Tenant's
 * serialized output-VAT position up into one filing-period view: platform tax
 * totals, a per-store table (issued-serial span, invoices, gross/VAT, reversals),
 * a "silent store" watch for tenants that filed nothing, and a one-click
 * consolidated CSV for remittance reconciliation. Money arrives as centavos.
 *
 * Loading is toggled from the month-stepper handler and the lazy initial state;
 * setState only runs after `await` in the effect, never synchronously in its body.
 */

const PLAN_BADGE: Record<string, string> = {
  starter: "bg-paper text-ink-soft hairline",
  business: "bg-brand-50 text-brand-700",
  enterprise: "bg-accent-50 text-accent-600",
};

export function ComplianceMatrix() {
  const [month, setMonth] = useState<string>(() => currentMonth());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<{ label: string; summary: PlatformComplianceSummary } | null>(
    null,
  );

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getPlatformCompliance(month);
      if (!alive) return;
      if (res.ok) {
        setView({ label: res.label, summary: res.summary });
        setError(null);
      } else {
        setError(res.error ?? "Could not compile the platform summary.");
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
  const rows = view?.summary.rows ?? [];
  const label = view?.label ?? monthLabel(month);
  const hasData = !!totals && totals.invoiceCount > 0;

  return (
    <div className="space-y-7 max-w-[1180px]">
      {/* Month stepper + export */}
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex items-center justify-center gap-2 sm:justify-start">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Previous month"
            className="grid place-items-center w-9 h-9 rounded-[10px] bg-surface hairline text-ink-soft hover:text-ink hover:border-brand-200 transition duration-150"
          >
            <Icon name="chevron" className="w-[18px] h-[18px] rotate-90" strokeWidth={1.8} />
          </button>
          <div className="min-w-[150px] text-center">
            <div className="text-[15px] font-extrabold tracking-tight">{label}</div>
            <div className="text-[11.5px] text-ink-faint font-semibold">platform filing period</div>
          </div>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={atCurrent}
            aria-label="Next month"
            className="grid place-items-center w-9 h-9 rounded-[10px] bg-surface hairline text-ink-soft hover:text-ink hover:border-brand-200 transition duration-150 disabled:opacity-40 disabled:hover:text-ink-soft disabled:hover:border-[rgba(11,18,32,0.07)]"
          >
            <Icon name="chevron" className="w-[18px] h-[18px] -rotate-90" strokeWidth={1.8} />
          </button>
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
          accent
        />
        <Total
          icon="receipt"
          label="Output VAT (12%)"
          value={totals ? formatCentsWhole(totals.vatCents) : "—"}
          sub="platform-wide remittable"
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
          sub={totals && totals.silentStores > 0 ? `${totals.silentStores} silent this month` : "all active stores filing"}
          warn={!!totals && totals.silentStores > 0}
        />
      </div>

      {/* Per-tenant oversight table */}
      <div className="rounded-xl2 bg-surface hairline shadow-card overflow-hidden">
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 hairline-b">
          <h3 className="font-extrabold tracking-tight flex items-center gap-2">
            <Icon name="shield" className="w-[18px] h-[18px] text-brand-600" strokeWidth={1.8} />
            Tenant VAT register
          </h3>
          <span className="text-[12.5px] font-semibold text-ink-faint">
            {totals ? `${formatCount(rows.length)} active ${rows.length === 1 ? "store" : "stores"}` : ""}
          </span>
        </div>

        {loading ? (
          <p className="px-6 py-12 text-center text-[13.5px] text-ink-soft">Compiling platform ledger…</p>
        ) : error ? (
          <p className="px-6 py-12 text-center text-[13.5px] text-rose-600">{error}</p>
        ) : rows.length === 0 ? (
          <p className="px-6 py-12 text-center text-[13.5px] text-ink-soft">
            No active stores to report for {label}.
          </p>
        ) : (
          <>
            {/* Phones: stacked per-store cards (the register table scrolls awkwardly under ~md). */}
            <ul className="md:hidden divide-y divide-[rgba(11,18,32,0.06)] dark:divide-[rgba(255,255,255,0.07)]">
              {rows.map((r) => {
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
                        </div>
                        <div className="mt-1 text-[12px] font-mono text-ink-soft break-all">
                          {silent ? (
                            <span className="inline-flex items-center gap-1.5 font-sans text-amber-600 font-semibold">
                              <Icon name="ban" className="w-[14px] h-[14px]" strokeWidth={1.8} />
                              no filings
                            </span>
                          ) : r.firstSerial === r.lastSerial ? (
                            r.firstSerial
                          ) : (
                            `${r.firstSerial} → ${r.lastSerial}`
                          )}
                        </div>
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
                    {r.reversalCount > 0 && (
                      <div className="text-[11.5px] text-amber-600 font-semibold">
                        {formatCount(r.reversalCount)} void/return
                      </div>
                    )}
                  </li>
                );
              })}
              {totals && (
                <li className="px-5 py-4 bg-paper/60 space-y-3">
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
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="text-[11px] font-bold tracking-wide text-ink-faint uppercase hairline-b">
                  <th className="px-6 py-3">Store</th>
                  <th className="px-4 py-3">Serial span</th>
                  <th className="px-4 py-3 text-right">Invoices</th>
                  <th className="px-4 py-3 text-right">Net of VAT</th>
                  <th className="px-4 py-3 text-right">Output VAT</th>
                  <th className="px-6 py-3 text-right">Gross</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
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
                      <td className="px-4 py-3 text-[12.5px] font-mono text-ink-soft whitespace-nowrap">
                        {silent ? (
                          <span className="inline-flex items-center gap-1.5 font-sans text-amber-600 font-semibold">
                            <Icon name="ban" className="w-[15px] h-[15px]" strokeWidth={1.8} />
                            no filings
                          </span>
                        ) : r.firstSerial === r.lastSerial ? (
                          r.firstSerial
                        ) : (
                          `${r.firstSerial} → ${r.lastSerial}`
                        )}
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
                      <td className="px-6 py-3 text-right font-bold tracking-tight tabular-nums">
                        {formatCents(r.grossCents)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {totals && (
                <tfoot>
                  <tr className="bg-paper/60 font-bold">
                    <td className="px-6 py-3 text-[12.5px] uppercase tracking-wide text-ink-faint" colSpan={2}>
                      Platform total
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] tabular-nums">
                      {formatCount(totals.invoiceCount)}
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] tabular-nums">
                      {formatCents(totals.netCents)}
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] tabular-nums text-brand-700">
                      {formatCents(totals.vatCents)}
                    </td>
                    <td className="px-6 py-3 text-right tracking-tight tabular-nums">
                      {formatCents(totals.grossCents)}
                    </td>
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

function Total({
  icon,
  label,
  value,
  sub,
  accent,
  warn,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card p-5">
      <div className="flex items-center gap-2.5">
        <span className="grid place-items-center w-9 h-9 rounded-[10px] bg-brand-50 text-brand-600">
          <Icon name={icon} className="w-[18px] h-[18px]" strokeWidth={1.7} />
        </span>
        <span className="text-[11.5px] font-bold tracking-wide text-ink-faint uppercase leading-tight">
          {label}
        </span>
      </div>
      <div
        className={
          "mt-3 text-[1.7rem] leading-none font-extrabold tracking-tightest tabular-nums " +
          (accent ? "text-brand-600" : "")
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

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-[10px] bg-paper hairline py-2 px-1">
      <div
        className={
          "text-[13px] font-extrabold tracking-tight tabular-nums " +
          (accent ? "text-brand-700" : "")
        }
      >
        {value}
      </div>
      <div className="mt-0.5 text-[10.5px] font-semibold text-ink-faint">{label}</div>
    </div>
  );
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
