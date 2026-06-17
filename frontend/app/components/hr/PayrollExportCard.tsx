"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { formatCents } from "@/lib/format";
import {
  getPayrollExportPreview,
  payrollExportUrl,
  type Employee,
  type PayrollExportReport,
} from "@/lib/hr";

/**
 * Payroll Export Studio — the accounting-ready snapshot controls inside the HR
 * console's Payroll tab. A date-range window, a night-differential toggle, and an
 * optional single-employee filter drive a live preview (regular / overtime /
 * night-diff hours + gross), and the high-visibility button streams the matching
 * CSV straight from the tenant-scoped export endpoint.
 *
 * Hours are derived from the labor clock (timecards), split on PH norms: 8h/day
 * before overtime (1.25×) and a 10% differential for 22:00–06:00 work. Money is
 * centavos end-to-end; the maths runs server-side in the pure PayrollProcessor.
 */
function isoToday(): string {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

function isoFirstOfMonth(): string {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), "01"].join("-");
}

type Preview =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; report: PayrollExportReport };

export function PayrollExportCard({ employees }: { employees: Employee[] }) {
  const [from, setFrom] = useState(isoFirstOfMonth());
  const [to, setTo] = useState(isoToday());
  const [nightDiff, setNightDiff] = useState(true);
  const [employeeId, setEmployeeId] = useState<string>("");
  const [preview, setPreview] = useState<Preview>({ status: "loading" });

  const rangeValid = from <= to;
  const activeEmployees = employees.filter((e) => e.isActive);

  useEffect(() => {
    if (!rangeValid) {
      setPreview({ status: "error", message: "The start date must be on or before the end date." });
      return;
    }
    let alive = true;
    setPreview({ status: "loading" });
    void (async () => {
      const res = await getPayrollExportPreview({ from, to, nightDiff, employeeId: employeeId || undefined });
      if (!alive) return;
      if (res.ok) setPreview({ status: "ready", report: res.report });
      else setPreview({ status: "error", message: res.error ?? "Could not build the payroll preview." });
    })();
    return () => {
      alive = false;
    };
  }, [from, to, nightDiff, employeeId, rangeValid]);

  const downloadUrl = payrollExportUrl({ from, to, nightDiff, employeeId: employeeId || undefined });
  const canDownload = rangeValid && preview.status === "ready" && preview.report.lines.length > 0;

  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 sm:px-6 py-4 hairline-b">
        <div>
          <h3 className="font-extrabold tracking-tight flex items-center gap-2">
            <Icon name="download" className="w-[18px] h-[18px] text-brand-600" strokeWidth={1.8} />
            Payroll export
          </h3>
          <p className="text-[12.5px] text-ink-soft max-w-[60ch]">
            Accounting-ready snapshot from the labor clock — regular, overtime (1.25×) and night-differential (10%,
            22:00–06:00) hours, with gross earnings per employee.
          </p>
        </div>
        <a
          href={canDownload ? downloadUrl : undefined}
          aria-disabled={!canDownload}
          onClick={(e) => {
            if (!canDownload) e.preventDefault();
          }}
          className={
            "inline-flex items-center gap-2 font-semibold text-[14px] px-5 py-2.5 rounded-[10px] shadow-btn tracking-tight transition duration-150 " +
            (canDownload
              ? "bg-brand-500 hover:bg-brand-600 text-white"
              : "bg-paper hairline text-ink-faint cursor-not-allowed")
          }
        >
          <Icon name="download" className="w-[18px] h-[18px]" strokeWidth={2} />
          Download CSV
        </a>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4 px-5 sm:px-6 py-4 hairline-b bg-paper/40">
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-soft">
          From
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="field-input rounded-[10px] px-3 py-2 text-[14px]"
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-soft">
          To
          <input
            type="date"
            value={to}
            min={from}
            max={isoToday()}
            onChange={(e) => setTo(e.target.value)}
            className="field-input rounded-[10px] px-3 py-2 text-[14px]"
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-soft">
          Employee
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="field-input rounded-[10px] px-3 py-2 text-[14px] min-w-[180px]"
          >
            <option value="">All employees</option>
            {activeEmployees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setNightDiff((v) => !v)}
          role="switch"
          aria-checked={nightDiff}
          className="flex items-center gap-2.5 text-[13px] font-semibold text-ink-soft ml-auto"
        >
          <span
            className={
              "relative inline-flex h-6 w-10 items-center rounded-full transition-colors duration-200 " +
              (nightDiff ? "bg-brand-500" : "bg-ink/15")
            }
          >
            <span
              className={
                "inline-block transform rounded-full bg-white shadow transition-transform duration-200 " +
                (nightDiff ? "translate-x-[18px]" : "translate-x-[3px]")
              }
              style={{ height: "1.125rem", width: "1.125rem" }}
            />
          </span>
          Night differential
        </button>
      </div>

      {/* Live preview */}
      {preview.status === "loading" && (
        <div className="px-5 sm:px-6 py-10 text-center text-[13px] text-ink-soft">Building preview…</div>
      )}
      {preview.status === "error" && (
        <div className="px-5 sm:px-6 py-8 text-center text-[13px] font-semibold text-rose-600">{preview.message}</div>
      )}
      {preview.status === "ready" && (
        <PreviewTable report={preview.report} />
      )}
    </div>
  );
}

function PreviewTable({ report }: { report: PayrollExportReport }) {
  if (report.lines.length === 0) {
    return (
      <div className="px-5 sm:px-6 py-10 text-center">
        <p className="text-[13.5px] font-semibold text-ink">No clocked hours in this window.</p>
        <p className="mt-1 text-[12.5px] text-ink-soft max-w-[48ch] mx-auto">
          Payroll hours come from the labor clock — once staff clock in and out their hours appear here, ready to export.
        </p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[11.5px] font-semibold text-ink-faint border-b border-ink/8 bg-paper/40">
            <th className="px-5 py-2.5 font-semibold">Employee</th>
            <th className="px-3 py-2.5 font-semibold">Pay type</th>
            <th className="px-3 py-2.5 font-semibold text-center">Days</th>
            <th className="px-3 py-2.5 font-semibold text-right">Regular</th>
            <th className="px-3 py-2.5 font-semibold text-right">OT</th>
            <th className="px-3 py-2.5 font-semibold text-right">Night</th>
            <th className="px-5 py-2.5 font-semibold text-right">Gross</th>
          </tr>
        </thead>
        <tbody>
          {report.lines.map((l) => (
            <tr key={l.employeeId} className="border-b border-ink/5 last:border-0 hover:bg-paper/40 transition">
              <td className="px-5 py-2.5">
                <span className="font-semibold">{l.name}</span>
                {l.position && <span className="block text-[11px] text-ink-faint">{l.position}</span>}
              </td>
              <td className="px-3 py-2.5 text-ink-soft">{l.payType}</td>
              <td className="px-3 py-2.5 text-center tabular-nums">{l.daysWorked}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{l.regularHours.toFixed(2)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {l.overtimeHours > 0 ? (
                  <span className="font-semibold text-amber-600">{l.overtimeHours.toFixed(2)}</span>
                ) : (
                  <span className="text-ink-faint">0.00</span>
                )}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {l.nightDiffHours > 0 ? (
                  <span className="font-semibold text-brand-600">{l.nightDiffHours.toFixed(2)}</span>
                ) : (
                  <span className="text-ink-faint">0.00</span>
                )}
              </td>
              <td className="px-5 py-2.5 text-right font-bold tabular-nums whitespace-nowrap">{formatCents(l.grossCents)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-ink/10 bg-paper/50 font-bold">
            <td className="px-5 py-3" colSpan={2}>
              {report.totals.headcount} employee{report.totals.headcount === 1 ? "" : "s"}
            </td>
            <td className="px-3 py-3" />
            <td className="px-3 py-3 text-right tabular-nums">{report.totals.regularHours.toFixed(2)}</td>
            <td className="px-3 py-3 text-right tabular-nums">{report.totals.overtimeHours.toFixed(2)}</td>
            <td className="px-3 py-3 text-right tabular-nums">{report.totals.nightDiffHours.toFixed(2)}</td>
            <td className="px-5 py-3 text-right tabular-nums whitespace-nowrap">{formatCents(report.totals.grossCents)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
