"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "../Icon";
import { AttendanceCalendar } from "../hr/AttendanceCalendar";
import { formatCents, formatCentsWhole, formatDate } from "@/lib/format";
import { getMyEssProfile, type EssProfile } from "@/lib/ess";
import type { EmployeePayslip } from "@/lib/hr";

/**
 * Employee Self-Service — a worker's own view: this month's shift hours (regular
 * vs overtime), accrued PTO, an attendance calendar, and a downloadable paystub
 * archive. All data is the signed-in user's own record (resolved server-side).
 */
function thisMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function EssPortal({ greetingName }: { greetingName: string }) {
  const [month, setMonth] = useState(thisMonth());
  const [state, setState] = useState<
    { status: "loading" } | { status: "error"; message: string } | { status: "ready"; profile: EssProfile }
  >({ status: "loading" });

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getMyEssProfile(month);
      if (!alive) return;
      if (res.ok) setState({ status: "ready", profile: res.profile });
      else setState({ status: "error", message: res.error ?? "Could not load your record." });
    })();
    return () => {
      alive = false;
    };
  }, [month]);

  const firstName = greetingName.split(/\s+/)[0] ?? greetingName;

  if (state.status === "loading") {
    return (
      <div className="space-y-5 animate-pulse">
        <div className="h-[80px] rounded-xl2 bg-surface hairline shadow-card" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[120px] rounded-xl2 bg-surface hairline shadow-card" />
          ))}
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    // A user with no linked employee record (e.g. the owner) lands here.
    return (
      <div className="rounded-xl2 bg-surface hairline shadow-card px-5 py-16 text-center">
        <span className="inline-grid place-items-center w-12 h-12 rounded-[14px] bg-brand-50 text-brand-600">
          <Icon name="users" className="w-6 h-6" strokeWidth={1.6} />
        </span>
        <p className="mt-3 text-[14px] font-semibold">No employee record linked</p>
        <p className="mt-1 text-[13px] text-ink-soft max-w-[44ch] mx-auto">{state.message}</p>
      </div>
    );
  }

  const p = state.profile;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[1.5rem] font-extrabold tracking-tightest">Hi, {firstName} 👋</h2>
        <p className="text-[13.5px] text-ink-soft">
          {p.employee.position ?? "Team member"}
          {p.storeName && <> · {p.storeName}</>}
          {p.employee.hireDate && <> · since {formatDate(p.employee.hireDate)}</>}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon="clock" label="Hours this month" value={`${p.hours.hoursWorked}h`} sub={`${p.hours.regularHours} reg · ${p.hours.overtimeHours} OT`} />
        <Stat icon="check" label="Attendance" value={`${p.hours.attendanceRatePct}%`} sub={`${p.hours.daysPresent} days present`} tone="good" />
        <Stat icon="heart" label="PTO balance" value={`${p.employee.ptoBalanceDays}d`} sub={`${p.ptoUsedYtd} used this year`} />
        <Stat icon="peso" label="Pay rate" value={formatCentsWhole(p.employee.payRateCents)} sub={`per ${rateUnit(p.employee.payType)}`} />
      </div>

      <div className="rounded-xl2 bg-surface hairline shadow-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <h3 className="font-extrabold tracking-tight">My attendance</h3>
            <p className="text-[12.5px] text-ink-soft">Your shift history for the month.</p>
          </div>
          <input
            type="month"
            value={month}
            max={thisMonth()}
            onChange={(e) => setMonth(e.target.value)}
            className="field-input rounded-[10px] px-3 py-2 text-[14px]"
          />
        </div>
        <div className="border-t border-ink/8 p-5">
          <AttendanceCalendar month={month} days={p.attendanceMonth} />
        </div>
      </div>

      <div className="rounded-xl2 bg-surface hairline shadow-card overflow-hidden">
        <div className="px-5 py-4">
          <h3 className="font-extrabold tracking-tight">My paystubs</h3>
          <p className="text-[12.5px] text-ink-soft">Download any payslip as a PDF for your records.</p>
        </div>
        {p.payslips.length === 0 ? (
          <p className="px-5 pb-6 text-[13px] text-ink-soft border-t border-ink/8 pt-4">
            No paystubs yet. They appear here after your store runs payroll.
          </p>
        ) : (
          <div className="overflow-x-auto border-t border-ink/8">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="text-left text-[12px] font-semibold text-ink-faint border-b border-ink/8 bg-paper/40">
                  <th className="px-5 py-2.5">Payslip</th>
                  <th className="px-3 py-2.5">Period</th>
                  <th className="px-3 py-2.5 text-right">Gross</th>
                  <th className="px-5 py-2.5 text-right">·</th>
                </tr>
              </thead>
              <tbody>
                {p.payslips.map((slip) => (
                  <tr key={slip.runId} className="border-b border-ink/5 last:border-0 hover:bg-paper/40 transition">
                    <td className="px-5 py-3 font-bold tabular-nums">{slip.reference}</td>
                    <td className="px-3 py-3 text-ink-soft tabular-nums whitespace-nowrap">
                      {formatDate(slip.periodStart)} – {formatDate(slip.periodEnd)}
                    </td>
                    <td className="px-3 py-3 text-right font-bold tabular-nums whitespace-nowrap">{formatCents(slip.grossCents)}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => printPayslip(p, slip)}
                        className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-600 hover:text-brand-700 transition"
                      >
                        <Icon name="download" className="w-4 h-4" strokeWidth={1.8} />
                        Download
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[11.5px] text-ink-faint flex items-start gap-1.5 max-w-[70ch]">
        <Icon name="shield" className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={1.7} />
        Paystubs show gross pay. Statutory deductions (SSS, PhilHealth, Pag-IBIG, tax) aren&rsquo;t itemised yet — ask your
        manager for your net figure.
      </p>
    </div>
  );
}

function rateUnit(payType: string): string {
  return payType === "Monthly" ? "month" : payType === "Daily" ? "day" : "hour";
}

/**
 * Open a print-ready paystub in a new window and trigger the browser print
 * dialog, where the worker can "Save as PDF". Self-contained HTML so it needs no
 * app styles. Escapes interpolated text to keep the markup well-formed.
 */
function printPayslip(p: EssProfile, slip: EmployeePayslip) {
  const esc = (s: string) =>
    s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;color:#555">${esc(label)}</td><td style="padding:6px 0;text-align:right;font-weight:600">${esc(value)}</td></tr>`;
  const basisUnit = slip.payType === "Hourly" ? "hours" : slip.payType === "Daily" ? "days" : "month";

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Payslip ${esc(slip.reference)}</title>
  <style>
    body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;max-width:560px;margin:32px auto;padding:0 24px}
    h1{font-size:20px;margin:0 0 2px} .muted{color:#777;font-size:13px}
    table{width:100%;border-collapse:collapse;font-size:14px}
    .total{border-top:2px solid #111;margin-top:8px}
    .total td{padding-top:10px;font-size:18px;font-weight:800}
    .hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #ddd;padding-bottom:14px;margin-bottom:14px}
  </style></head><body>
    <div class="hd">
      <div><h1>${esc(p.storeName ?? "Payslip")}</h1><div class="muted">Payslip · ${esc(slip.reference)}</div></div>
      <div class="muted" style="text-align:right">${esc(formatDate(slip.periodStart))} –<br>${esc(formatDate(slip.periodEnd))}</div>
    </div>
    <table>
      ${row("Employee", p.employee.name)}
      ${row("Position", p.employee.position ?? "—")}
      ${row("Pay basis", `${slip.payType} @ ${formatCents(slip.payRateCents)} / ${rateUnit(slip.payType)}`)}
      ${row(`Worked (${basisUnit})`, String(slip.basisQty))}
    </table>
    <table class="total"><tr><td>Gross pay</td><td style="text-align:right">${esc(formatCents(slip.grossCents))}</td></tr></table>
    <p class="muted" style="margin-top:20px">Gross pay only. Statutory deductions are not itemised on this payslip.</p>
  </body></html>`;

  const w = window.open("", "_blank", "width=640,height=800");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}

function Stat({ icon, label, value, sub, tone }: { icon: IconName; label: string; value: string; sub?: string; tone?: "good" }) {
  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card p-5">
      <span className={"grid place-items-center w-9 h-9 rounded-[10px] " + (tone === "good" ? "bg-accent-50 text-accent-600" : "bg-brand-50 text-brand-600")}>
        <Icon name={icon} className="w-[18px] h-[18px]" strokeWidth={1.7} />
      </span>
      <div className="mt-3 text-[1.6rem] leading-none font-extrabold tracking-tightest tabular-nums">{value}</div>
      <div className="mt-1.5 text-[12.5px] text-ink-soft">{label}</div>
      {sub && <div className="text-[11.5px] text-ink-faint mt-0.5">{sub}</div>}
    </div>
  );
}
