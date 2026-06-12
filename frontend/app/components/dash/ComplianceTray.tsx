"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { formatCents } from "@/lib/format";
import {
  complianceCsvUrl,
  getComplianceLedger,
  type ComplianceLedger,
} from "@/lib/merchant";

/**
 * Module 4 — BIR Compliance & Audit Tray. Browses a Tenant's serialized sales
 * one calendar month at a time: headline tax totals (gross, net of VAT, 12%
 * output VAT, discounts), a chronological invoice tray, and a one-click CSV
 * export ready for tax-prep filing. All money arrives as centavos and renders
 * as peso strings; numbering is the immutable per-Tenant `SI-` serial.
 *
 * Loading is toggled from event handlers (month stepper) and the lazy initial
 * state — setState only happens after `await` in the effect, never synchronously
 * in its body.
 */
export function ComplianceTray() {
  const [month, setMonth] = useState<string>(() => currentMonth());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<{ label: string; ledger: ComplianceLedger } | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getComplianceLedger(month);
      if (!alive) return;
      if (res.ok) {
        setView({ label: res.label, ledger: res.ledger });
        setError(null);
      } else {
        setError(res.error ?? "Could not compile the ledger.");
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

  const totals = view?.ledger.totals;
  const label = view?.label ?? monthLabel(month);

  return (
    <div className="space-y-7 max-w-[1180px]">
      {/* Month stepper + export */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
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
            <div className="text-[11.5px] text-ink-faint font-semibold">filing period</div>
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
          href={complianceCsvUrl(month)}
          className={
            "inline-flex items-center gap-2 font-semibold text-[14px] px-5 py-2.5 rounded-[10px] tracking-tight transition duration-150 " +
            (totals && totals.count > 0
              ? "bg-brand-500 hover:bg-brand-600 text-white shadow-btn"
              : "bg-paper hairline text-ink-faint pointer-events-none")
          }
        >
          <Icon name="download" className="w-[18px] h-[18px]" strokeWidth={1.7} />
          Export CSV
        </a>
      </div>

      {/* Tax totals */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Total label="Gross sales (VAT-incl)" value={totals ? formatCents(totals.grossCents) : "—"} accent />
        <Total label="Net of VAT (taxable)" value={totals ? formatCents(totals.netCents) : "—"} />
        <Total label="Output VAT (12%)" value={totals ? formatCents(totals.vatCents) : "—"} />
        <Total label="Discounts applied" value={totals ? formatCents(totals.discountCents) : "—"} />
      </div>

      {/* Audit tray */}
      <div className="rounded-xl2 bg-surface hairline shadow-card overflow-hidden">
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 hairline-b">
          <h3 className="font-extrabold tracking-tight">Invoice ledger</h3>
          <span className="text-[12.5px] font-semibold text-ink-faint">
            {totals ? `${totals.count} ${totals.count === 1 ? "invoice" : "invoices"}` : ""}
          </span>
        </div>

        {loading ? (
          <p className="px-6 py-12 text-center text-[13.5px] text-ink-soft">Compiling ledger…</p>
        ) : error ? (
          <p className="px-6 py-12 text-center text-[13.5px] text-rose-600">{error}</p>
        ) : !view || view.ledger.rows.length === 0 ? (
          <p className="px-6 py-12 text-center text-[13.5px] text-ink-soft">
            No sales recorded for {label}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="text-[11px] font-bold tracking-wide text-ink-faint uppercase hairline-b">
                  <th className="px-6 py-3">Invoice</th>
                  <th className="px-4 py-3">Date / time</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3 text-right">Net of VAT</th>
                  <th className="px-4 py-3 text-right">VAT</th>
                  <th className="px-4 py-3 text-right">Discount</th>
                  <th className="px-6 py-3 text-right">Gross</th>
                </tr>
              </thead>
              <tbody>
                {view.ledger.rows.map((r) => (
                  <tr
                    key={r.reference}
                    className="hairline-b last:border-0 hover:bg-paper/70 transition duration-150"
                  >
                    <td className="px-6 py-3 font-mono text-[12.5px] font-semibold">{r.reference}</td>
                    <td className="px-4 py-3 text-[13px] text-ink-soft whitespace-nowrap">
                      {formatStamp(r.at)}
                    </td>
                    <td className="px-4 py-3 text-[13px]">
                      {r.paymentMethod}
                      {r.paymentRef && (
                        <span className="text-ink-faint"> ·{r.paymentRef}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] tabular-nums">{formatCents(r.netCents)}</td>
                    <td className="px-4 py-3 text-right text-[13px] tabular-nums text-ink-soft">
                      {formatCents(r.vatCents)}
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] tabular-nums text-ink-soft">
                      {r.discountCents > 0 ? `−${formatCents(r.discountCents)}` : "—"}
                    </td>
                    <td className="px-6 py-3 text-right font-bold tracking-tight tabular-nums">
                      {formatCents(r.grossCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Total({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card p-5">
      <div className="text-[11.5px] font-bold tracking-wide text-ink-faint uppercase">{label}</div>
      <div
        className={
          "mt-2 text-[1.55rem] leading-none font-extrabold tracking-tightest tabular-nums " +
          (accent ? "text-brand-600" : "")
        }
      >
        {value}
      </div>
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

function formatStamp(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
