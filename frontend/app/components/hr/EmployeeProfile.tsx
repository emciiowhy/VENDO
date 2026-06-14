"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "../Icon";
import { useToast } from "../Toast";
import { formatCents, formatCentsWhole, formatDate } from "@/lib/format";
import { getEmployeeDetail, type EmployeeDetail } from "@/lib/hr";
import { AttendanceCalendar } from "./AttendanceCalendar";
import { EmployeeFormModal } from "./EmployeeFormModal";
import { PayrollDetailDrawer } from "./PayrollDetailDrawer";

/**
 * The deep-dive employee file: personal dossier, financial suite (pay config +
 * masked direct-deposit + PTO), an attendance calendar with regular/overtime
 * totals, a performance snapshot, and the paystub archive. Tenant-scoped
 * server-side; the URL only carries the employee id.
 */
function thisMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function EmployeeProfile({ employeeId }: { employeeId: string }) {
  const { push } = useToast();
  const [month, setMonth] = useState(thisMonth());
  const [state, setState] = useState<
    { status: "loading" } | { status: "error"; message: string } | { status: "ready"; emp: EmployeeDetail }
  >({ status: "loading" });
  const [editing, setEditing] = useState(false);
  const [payslipRun, setPayslipRun] = useState<string | null>(null);

  async function load() {
    const res = await getEmployeeDetail(employeeId, month);
    if (res.ok) setState({ status: "ready", emp: res.employee });
    else setState({ status: "error", message: res.error ?? "Could not load the employee file." });
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getEmployeeDetail(employeeId, month);
      if (!alive) return;
      if (res.ok) setState({ status: "ready", emp: res.employee });
      else setState({ status: "error", message: res.error ?? "Could not load the employee file." });
    })();
    return () => {
      alive = false;
    };
  }, [employeeId, month]);

  if (state.status === "loading") {
    return (
      <div className="max-w-[1100px] space-y-5 animate-pulse">
        <div className="h-[120px] rounded-xl2 bg-surface hairline shadow-card" />
        <div className="grid gap-5 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-[200px] rounded-xl2 bg-surface hairline shadow-card" />
          ))}
        </div>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="max-w-[1100px]">
        <BackLink />
        <div className="mt-4 rounded-xl2 bg-surface hairline shadow-card p-10 text-center">
          <p className="text-[14px] font-semibold text-rose-600">{state.message}</p>
        </div>
      </div>
    );
  }

  const e = state.emp;
  const initials = e.name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");

  return (
    <div className="max-w-[1100px] space-y-5">
      <BackLink />

      {/* Header */}
      <div className="rounded-xl2 bg-surface hairline shadow-card p-5 sm:p-6 flex flex-wrap items-center gap-4">
        <span className="grid place-items-center w-14 h-14 rounded-2xl bg-brand-500 text-white font-extrabold text-[18px] tracking-tight shrink-0">
          {initials || "?"}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-[1.4rem] font-extrabold tracking-tightest">{e.name}</h2>
            <span className={"inline-block text-[11px] font-bold rounded-full px-2.5 py-0.5 " + (e.isActive ? "bg-accent-50 text-accent-600" : "bg-paper hairline text-ink-faint")}>
              {e.isActive ? "Active" : "Inactive"}
            </span>
          </div>
          <p className="text-[13.5px] text-ink-soft mt-0.5">
            {e.position ?? "No position set"} · {e.employmentType}
            {e.hireDate && <> · Hired {formatDate(e.hireDate)}</>}
            {!e.isActive && e.separatedOn && <> · Left {formatDate(e.separatedOn)}</>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="ml-auto inline-flex items-center gap-2 bg-paper hairline text-ink font-semibold text-[14px] px-4 py-2.5 rounded-[10px] hover:border-brand-200 hover:text-brand-600 transition duration-150"
        >
          <Icon name="pencil" className="w-[17px] h-[17px]" strokeWidth={1.8} />
          Edit
        </button>
      </div>

      {/* Stat strip */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon="clock" label="Hours this month" value={`${e.hours.hoursWorked}h`} sub={`${e.hours.regularHours} reg · ${e.hours.overtimeHours} OT`} />
        <Stat icon="check" label="Attendance" value={`${e.hours.attendanceRatePct}%`} sub={`${e.hours.daysPresent} days present`} tone="good" />
        <Stat icon="heart" label="PTO balance" value={`${e.ptoBalanceDays}d`} sub={`${e.ptoUsedYtd} used this year`} />
        <Stat icon="peso" label="Pay rate" value={formatCentsWhole(e.payRateCents)} sub={`per ${e.payType.toLowerCase() === "monthly" ? "month" : e.payType.toLowerCase() === "daily" ? "day" : "hour"}`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Dossier */}
        <Card title="Personal dossier" icon="users">
          <Detail label="Phone" value={e.phone} />
          <Detail label="Email" value={e.email} />
          <Detail label="Address" value={e.address} />
          <div className="pt-2 mt-1 border-t border-ink/8">
            <span className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">Emergency contact</span>
            <Detail label="Name" value={e.emergencyContactName} />
            <Detail label="Phone" value={e.emergencyContactPhone} />
          </div>
        </Card>

        {/* Financial suite */}
        <Card title="Financial suite" icon="wallet">
          <Detail label="Pay basis" value={`${e.payType} · ${formatCents(e.payRateCents)}`} />
          <Detail label="PTO balance" value={`${e.ptoBalanceDays} days`} />
          <div className="pt-2 mt-1 border-t border-ink/8">
            <span className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">Direct deposit</span>
            <Detail label="Bank" value={e.bankName} />
            <Detail label="Account name" value={e.bankAccountName} />
            <Detail label="Account no." value={e.bankAccountLast4 ? `•••• ${e.bankAccountLast4}` : null} />
          </div>
        </Card>

        {/* Performance snapshot */}
        <Card title="Performance (this month)" icon="trend">
          {e.performance && e.performance.linked ? (
            <>
              <Detail label="Sales generated" value={formatCentsWhole(e.performance.salesCents)} />
              <Detail label="Sales / hour" value={e.performance.hoursWorked > 0 ? formatCents(e.performance.salesPerHourCents) : "—"} />
              <Detail label="Transactions" value={String(e.performance.txnCount)} />
              <Detail
                label="Drawer accuracy"
                value={e.performance.drawerAccuracyPct === null ? "No closed shifts" : `${e.performance.drawerAccuracyPct}%`}
              />
            </>
          ) : (
            <p className="text-[13px] text-ink-soft">
              No register data. Link this employee to a cashier login to track sales and drawer accuracy.
            </p>
          )}
        </Card>
      </div>

      {/* Attendance calendar */}
      <div className="rounded-xl2 bg-surface hairline shadow-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <h3 className="font-extrabold tracking-tight">Attendance</h3>
            <p className="text-[12.5px] text-ink-soft">Daily history · regular vs overtime built from logged hours.</p>
          </div>
          <input
            type="month"
            value={month}
            max={thisMonth()}
            onChange={(ev) => setMonth(ev.target.value)}
            className="field-input rounded-[10px] px-3 py-2 text-[14px]"
          />
        </div>
        <div className="border-t border-ink/8 p-5">
          <AttendanceCalendar month={month} days={e.attendanceMonth} />
        </div>
      </div>

      {/* Paystub archive */}
      <div className="rounded-xl2 bg-surface hairline shadow-card overflow-hidden">
        <div className="px-5 py-4">
          <h3 className="font-extrabold tracking-tight">Paystub archive</h3>
          <p className="text-[12.5px] text-ink-soft">Every payroll run this employee was part of.</p>
        </div>
        {e.payslips.length === 0 ? (
          <p className="px-5 pb-6 text-[13px] text-ink-soft border-t border-ink/8 pt-4">No payslips yet — they appear here after a payroll run includes this employee.</p>
        ) : (
          <div className="overflow-x-auto border-t border-ink/8">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="text-left text-[12px] font-semibold text-ink-faint border-b border-ink/8 bg-paper/40">
                  <th className="px-5 py-2.5">Run #</th>
                  <th className="px-3 py-2.5">Period</th>
                  <th className="px-3 py-2.5">Basis</th>
                  <th className="px-3 py-2.5 text-right">Gross</th>
                  <th className="px-5 py-2.5 text-right">·</th>
                </tr>
              </thead>
              <tbody>
                {e.payslips.map((p) => (
                  <tr key={p.runId} className="border-b border-ink/5 last:border-0 hover:bg-paper/40 transition">
                    <td className="px-5 py-3 font-bold tabular-nums">{p.reference}</td>
                    <td className="px-3 py-3 text-ink-soft tabular-nums whitespace-nowrap">
                      {formatDate(p.periodStart)} – {formatDate(p.periodEnd)}
                    </td>
                    <td className="px-3 py-3 text-ink-soft">
                      {p.payType} · {p.basisQty}
                      {p.payType === "Hourly" ? "h" : p.payType === "Daily" ? "d" : ""}
                    </td>
                    <td className="px-3 py-3 text-right font-bold tabular-nums whitespace-nowrap">{formatCents(p.grossCents)}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setPayslipRun(p.runId)}
                        className="grid place-items-center w-8 h-8 rounded-[9px] text-ink-faint hover:bg-brand-50 hover:text-brand-600 transition ml-auto"
                        aria-label="View run"
                        title="View run"
                      >
                        <Icon name="eye" className="w-[17px] h-[17px]" strokeWidth={1.7} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <EmployeeFormModal
          employee={e}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            push({ variant: "success", title: "Employee updated" });
            void load();
          }}
        />
      )}
      {payslipRun && <PayrollDetailDrawer id={payslipRun} onClose={() => setPayslipRun(null)} />}
    </div>
  );
}

// ── Small building blocks ─────────────────────────────────────────────────────

function BackLink() {
  return (
    <Link href="/dashboard/hr" className="inline-flex items-center gap-2 text-[13px] font-semibold text-ink-soft hover:text-ink transition">
      <Icon name="arrow" className="w-4 h-4 rotate-180" />
      Back to HR
    </Link>
  );
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

function Card({ title, icon, children }: { title: string; icon: IconName; children: React.ReactNode }) {
  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon name={icon} className="w-[18px] h-[18px] text-ink-faint" strokeWidth={1.7} />
        <h3 className="font-extrabold tracking-tight text-[14.5px]">{title}</h3>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[13px]">
      <span className="text-ink-soft shrink-0">{label}</span>
      <span className={"font-semibold text-right " + (value ? "" : "text-ink-faint")}>{value || "—"}</span>
    </div>
  );
}
