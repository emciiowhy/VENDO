"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { formatCents, formatDate } from "@/lib/format";
import { getPayrollRun, type PayrollRunDetail } from "@/lib/hr";

/** Right-side drawer showing a payroll run's per-employee gross breakdown. */
export function PayrollDetailDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const [run, setRun] = useState<PayrollRunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getPayrollRun(id);
      if (!alive) return;
      if (res.ok) setRun(res.run);
      else setError(res.error ?? "Could not load the payroll run.");
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function basisLabel(payType: string, qty: number): string {
    if (payType === "Daily") return `${qty} day${qty === 1 ? "" : "s"}`;
    if (payType === "Hourly") return `${qty} hr${qty === 1 ? "" : "s"}`;
    return "Monthly";
  }

  return (
    <div className="fixed inset-0 z-[120] flex justify-end" role="dialog" aria-modal="true" aria-label="Payroll detail">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/45 backdrop-blur-sm overlay-backdrop" />
      <div className="slide-over relative w-full max-w-[480px] h-full bg-surface hairline shadow-soft overflow-y-auto">
        {!run ? (
          <div className="p-6">
            {error ? (
              <p className="text-[14px] font-semibold text-rose-600">{error}</p>
            ) : (
              <div className="space-y-3 animate-pulse">
                <div className="h-8 w-40 rounded-lg bg-paper" />
                <div className="h-40 rounded-xl2 bg-paper" />
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="sticky top-0 bg-surface hairline-b px-6 py-4 flex items-start justify-between">
              <div>
                <h3 className="text-[1.2rem] font-extrabold tracking-tight tabular-nums">{run.reference}</h3>
                <p className="mt-0.5 text-[13px] text-ink-soft">
                  {formatDate(run.periodStart)} – {formatDate(run.periodEnd)} · {run.headcount} employees
                </p>
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="text-ink-faint hover:text-ink transition p-1">
                <Icon name="x" className="w-5 h-5" strokeWidth={1.8} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="rounded-xl2 bg-brand-50 p-4 text-center">
                <div className="text-[12px] font-semibold text-brand-600">Total gross pay</div>
                <div className="mt-1 text-[1.9rem] font-extrabold tracking-tightest tabular-nums text-brand-700">
                  {formatCents(run.totalGrossCents)}
                </div>
              </div>

              <div className="rounded-xl2 hairline overflow-hidden">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left text-[11.5px] font-semibold text-ink-faint bg-paper/50">
                      <th className="px-3 py-2 font-semibold">Employee</th>
                      <th className="px-2 py-2 font-semibold">Basis</th>
                      <th className="px-3 py-2 font-semibold text-right">Gross</th>
                    </tr>
                  </thead>
                  <tbody>
                    {run.items.map((it) => (
                      <tr key={it.id} className="border-t border-ink/5">
                        <td className="px-3 py-2.5">
                          <span className="font-semibold">{it.name}</span>
                          <span className="block text-[11px] text-ink-faint">
                            {it.payType} · {formatCents(it.payRateCents)}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-ink-soft">{basisLabel(it.payType, it.basisQty)}</td>
                        <td className="px-3 py-2.5 text-right font-bold tabular-nums">{formatCents(it.grossCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {run.note && (
                <div className="rounded-[10px] bg-paper hairline p-3 text-[13px] text-ink-soft">
                  <span className="font-semibold text-ink">Note:</span> {run.note}
                </div>
              )}
              <p className="text-[11.5px] text-ink-faint">
                Gross pay only — statutory deductions (SSS, PhilHealth, Pag-IBIG, tax) are not yet applied.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
