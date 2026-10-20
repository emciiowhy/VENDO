"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "../Icon";
import { Pagination, usePagination } from "../Pagination";
import { AttendanceCalendar, fmtHours } from "../hr/AttendanceCalendar";
import { AttendanceDayPanel } from "../hr/AttendanceDayPanel";
import { formatCents, formatCentsWhole, formatDate } from "@/lib/format";
import { getMyEssProfile, type EssErrorKind, type EssProfile } from "@/lib/ess";
import type { Role } from "@/lib/auth";
import type { EmployeePayslip } from "@/lib/hr";

/**
 * Employee Self-Service — a worker's own view: this month's shift hours (regular
 * vs overtime), accrued PTO, an attendance calendar, and a downloadable paystub
 * archive. All data is the signed-in user's own record (resolved server-side).
 */
function thisMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

const NO_SLIPS: EmployeePayslip[] = [];

export function EssPortal({ greetingName, role }: { greetingName: string; role: Role }) {
  const [month, setMonth] = useState(thisMonth());
  const [reload, setReload] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; kind: EssErrorKind; message: string }
    | { status: "ready"; profile: EssProfile }
  >({ status: "loading" });

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getMyEssProfile(month);
      if (!alive) return;
      if (res.ok) setState({ status: "ready", profile: res.profile });
      else
        setState({
          status: "error",
          kind: res.kind ?? "other",
          message: res.error ?? "Could not load your record.",
        });
    })();
    return () => {
      alive = false;
    };
  }, [month, reload]);

  const firstName = greetingName.split(/\s+/)[0] ?? greetingName;

  const slips = usePagination(state.status === "ready" ? state.profile.payslips : NO_SLIPS, null, 10);
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
    const isAdmin = role === "MERCHANT_OWNER" || role === "MANAGER";
    // Each failure gets its own explanation and a next step — the old single
    // "No employee record linked" card also swallowed plan gates and outages.
    const copy: { icon: IconName; title: string; body: string } =
      state.kind === "not_linked"
        ? isAdmin
          ? {
              icon: "users",
              title: "Payroll records are for roster staff",
              body: "Owner and manager accounts aren't on the payroll roster, so there are no paystubs or PTO here. Your shift clock is shown above.",
            }
          : {
              icon: "users",
              title: "Your login isn't linked yet",
              body: "Ask your store owner to open HR → Employees, pick your profile, and link this login. Your hours and paystubs will appear here.",
            }
        : state.kind === "plan"
          ? { icon: "lock", title: "Paystubs aren't on this plan", body: state.message }
          : { icon: "warning", title: "Couldn't load your record", body: state.message };
    return (
      <div role="status" className="rounded-xl2 bg-surface hairline shadow-card px-5 py-12 sm:py-16 text-center">
        <span className="inline-grid place-items-center w-12 h-12 rounded-[14px] bg-brand-50 text-brand-600">
          <Icon name={copy.icon} className="w-6 h-6" strokeWidth={1.6} />
        </span>
        <p className="mt-3 text-[14px] font-semibold">{copy.title}</p>
        <p className="mt-1 text-[13px] text-ink-soft max-w-[44ch] mx-auto">{copy.body}</p>
        {state.kind === "not_linked" && isAdmin && (
          <Link
            href="/dashboard/hr"
            className="tap press mt-5 inline-flex items-center gap-2 min-h-[44px] px-4 rounded-[12px] bg-brand-600 text-white text-[13.5px] font-semibold hover:bg-brand-700 transition"
          >
            Manage employees
            <Icon name="arrow" className="w-4 h-4" />
          </Link>
        )}
        {state.kind === "other" && (
          <button
            type="button"
            onClick={() => {
              setState({ status: "loading" });
              setReload((n) => n + 1);
            }}
            className="tap press mt-5 inline-flex items-center gap-2 min-h-[44px] px-4 rounded-[12px] bg-surface hairline text-[13.5px] font-semibold hover:border-brand-300 transition"
          >
            <Icon name="refresh" className="w-4 h-4" />
            Try again
          </button>
        )}
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
        <Stat icon="clock" label="Hours worked this month" value={fmtHours(p.attendanceSummary.workedMinutes)} sub={`after unpaid breaks`} />
        <Stat icon="check" label="Attendance" value={`${p.hours.attendanceRatePct}%`} sub={`${p.attendanceSummary.presentDays} present · ${p.attendanceSummary.absentDays} absent`} tone="good" />
        <Stat icon="heart" label="PTO balance" value={`${p.employee.ptoBalanceDays}d`} sub={`${p.ptoUsedYtd} used this year`} />
        <Stat icon="peso" label="Daily rate" value={p.employee.dailyRateCents != null ? formatCentsWhole(p.employee.dailyRateCents) : "—"} sub="set by your employer" />
      </div>

      <div className="rounded-xl2 bg-surface hairline shadow-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <h3 className="font-extrabold tracking-tight">My attendance</h3>
            <p className="text-[12.5px] text-ink-soft">From your Shift In / Shift Out. Tap a date for its times.</p>
          </div>
          <input
            type="month"
            value={month}
            max={thisMonth()}
            onChange={(e) => {
              setMonth(e.target.value);
              setSelectedDate(null);
            }}
            className="field-input rounded-[10px] px-3 py-2 text-[14px]"
          />
        </div>
        <div className="border-t border-ink/8 p-5 grid gap-5 lg:grid-cols-2">
          <AttendanceCalendar
            month={month}
            days={p.attendanceMonth}
            selected={selectedDate}
            onSelect={setSelectedDate}
          />
          {(() => {
            const day = p.attendanceMonth.find((d) => d.date === selectedDate);
            // Read-only: no employeeId, so no fixes — staff see their own times only.
            return day ? (
              <AttendanceDayPanel day={day} />
            ) : (
              <p className="text-[13px] text-ink-soft">Tap a date to see your Time In, Time Out and hours.</p>
            );
          })()}
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
                  <th className="px-3 py-2.5 text-right">Final pay</th>
                  <th className="px-5 py-2.5 text-right">·</th>
                </tr>
              </thead>
              <tbody>
                {slips.pageItems.map((slip) => (
                  <tr key={slip.runId} className="border-b border-ink/5 last:border-0 hover:bg-paper/40 transition">
                    <td className="px-5 py-3 font-bold tabular-nums">{slip.reference}</td>
                    <td className="px-3 py-3 text-ink-soft tabular-nums whitespace-nowrap">
                      {formatDate(slip.periodStart)} – {formatDate(slip.periodEnd)}
                    </td>
                    <td className="px-3 py-3 text-right font-bold tabular-nums whitespace-nowrap">{formatCents(slip.payableCents)}</td>
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
            <Pagination page={slips.page} total={slips.total} pageSize={slips.pageSize} onPage={slips.setPage} noun="payslips" />
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
  // Lines from the attendance-based payroll are Daily with regular HOURS as the basis.
  const daily = slip.attendanceBased;

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
      ${daily
        ? row("Daily rate", formatCents(slip.payRateCents)) + row("Regular hours worked", `${slip.basisQty} h`)
        : row("Pay basis", `${slip.payType} @ ${formatCents(slip.payRateCents)} / ${rateUnit(slip.payType)}`) +
          row(`Worked (${basisUnit})`, String(slip.basisQty))}
      ${row("Base earnings", formatCents(slip.grossCents))}
      ${row("Approved adjustments", formatCents(slip.payableCents - slip.grossCents))}
    </table>
    <table class="total"><tr><td>Final pay</td><td style="text-align:right">${esc(formatCents(slip.payableCents))}</td></tr></table>
    <p class="muted" style="margin-top:20px">SSS, PhilHealth, Pag-IBIG and withholding tax are not computed by VendoPOS; your employer handles them separately.</p>
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
