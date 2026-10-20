"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "../Icon";
import { useToast } from "../Toast";
import { ConfirmDialog } from "../ConfirmDialog";
import { HrOverview } from "./HrOverview";
import { PerformanceMatrix } from "./PerformanceMatrix";
import { LaborAnalytics } from "./LaborAnalytics";
import { formatCents, formatCentsWhole, formatDate } from "@/lib/format";
import {
  deleteEmployee,
  getTeamAttendance,
  getHrSummary,
  listEmployees,
  listPayrollRuns,
  type TeamAttendanceRow,
  type Employee,
  type HrSummary,
  type PayrollRunSummary,
} from "@/lib/hr";
import { EmployeeFormModal } from "./EmployeeFormModal";
import { PayrollRunModal } from "./PayrollRunModal";
import { PayrollDetailDrawer } from "./PayrollDetailDrawer";
import { ShiftDiscrepancyMatrix } from "./ShiftDiscrepancyMatrix";

/**
 * Merchant HR console — employees, attendance and payroll over one tenant-scoped
 * dataset. Attendance is marked per day; payroll derives gross pay from rates +
 * that attendance. Builds on the same staff the cashier/shift ledger uses.
 */
type Tab = "overview" | "employees" | "attendance" | "payroll" | "performance" | "labor" | "reconciliation";

const PAY_TAG: Record<string, string> = {
  Monthly: "bg-brand-50 text-brand-600",
  Daily: "bg-accent-50 text-accent-600",
  Hourly: "bg-amber-50 text-amber-600",
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; summary: HrSummary; employees: Employee[]; runs: PayrollRunSummary[] };

export function HrConsole() {
  const { push } = useToast();
  const [state, setState] = useState<State>({ status: "loading" });
  const [tab, setTab] = useState<Tab>("overview");
  const [form, setForm] = useState<{ employee: Employee | null } | null>(null);
  const [confirm, setConfirm] = useState<Employee | null>(null);
  const [payrollModal, setPayrollModal] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  async function load() {
    const [s, e, r] = await Promise.all([getHrSummary(), listEmployees(), listPayrollRuns()]);
    if (s.ok && e.ok && r.ok) {
      setState({ status: "ready", summary: s.summary, employees: e.employees, runs: r.runs });
    } else {
      setState({ status: "error", message: (!s.ok && s.error) || (!e.ok && e.error) || (!r.ok && r.error) || "Could not load HR." });
    }
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [s, e, r] = await Promise.all([getHrSummary(), listEmployees(), listPayrollRuns()]);
      if (!alive) return;
      if (s.ok && e.ok && r.ok) setState({ status: "ready", summary: s.summary, employees: e.employees, runs: r.runs });
      else setState({ status: "error", message: (!s.ok && s.error) || (!e.ok && e.error) || (!r.ok && r.error) || "Could not load HR." });
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function onDelete() {
    if (!confirm) return;
    const target = confirm;
    setConfirm(null);
    const res = await deleteEmployee(target.id);
    if (res.ok) {
      push({ variant: "success", title: "Employee removed" });
      void load();
    } else {
      push({ variant: "danger", title: "Couldn't remove", message: res.error });
    }
  }

  return (
    <div className="space-y-6 max-w-[1180px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[1.3rem] font-extrabold tracking-tightest">People &amp; payroll</h2>
          <p className="text-[13.5px] text-ink-soft">Your team, their attendance, and gross pay per period.</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button type="button" onClick={() => setPayrollModal(true)} className="inline-flex items-center gap-2 bg-paper hairline text-ink font-semibold text-[14px] px-4 py-2.5 rounded-[10px] hover:border-brand-200 hover:text-brand-600 transition duration-150">
            <Icon name="peso" className="w-[18px] h-[18px]" strokeWidth={1.7} />
            Start payroll
          </button>
          <button type="button" onClick={() => setForm({ employee: null })} className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[14px] px-5 py-2.5 rounded-[10px] shadow-btn tracking-tight transition duration-150">
            <Icon name="plus" className="w-[18px] h-[18px]" strokeWidth={2} />
            Add employee
          </button>
        </div>
      </div>

      {state.status === "loading" && <Skeleton />}
      {state.status === "error" && (
        <div className="rounded-xl2 bg-surface hairline shadow-card p-8 text-center">
          <p className="text-[14px] font-semibold text-rose-600">{state.message}</p>
        </div>
      )}

      {state.status === "ready" && (
        <>
          {/* No "Present today" / on-duty KPI here: who's on the clock is a POS
              concern, not the owner's — the owner isn't a cashier. */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Kpi icon="users" label="Employees" value={String(state.summary.headcount)} />
            <Kpi icon="refresh" label="Payroll runs this month" value={String(state.summary.payrollRunsThisMonth)} />
            <Kpi icon="peso" label="Last payroll (gross)" value={formatCentsWhole(state.summary.lastPayrollGrossCents)} />
          </div>

          <div className="flex items-center gap-1 border-b border-ink/8 overflow-x-auto overflow-y-hidden scrollbar-none">
            <TabButton active={tab === "overview"} onClick={() => setTab("overview")} label="Overview" />
            <TabButton active={tab === "employees"} onClick={() => setTab("employees")} label={`Employees (${state.employees.length})`} />
            <TabButton active={tab === "attendance"} onClick={() => setTab("attendance")} label="Attendance" />
            <TabButton active={tab === "payroll"} onClick={() => setTab("payroll")} label={`Payroll (${state.runs.length})`} />
            <TabButton active={tab === "performance"} onClick={() => setTab("performance")} label="Performance" />
            <TabButton active={tab === "labor"} onClick={() => setTab("labor")} label="Labor analytics" />
            <TabButton active={tab === "reconciliation"} onClick={() => setTab("reconciliation")} label="Drawer audit" />
          </div>

          {tab === "overview" && <HrOverview />}
          {tab === "employees" && (
            <EmployeesTable
              employees={state.employees}
              onEdit={(e) => setForm({ employee: e })}
              onAskDelete={setConfirm}
              onNew={() => setForm({ employee: null })}
            />
          )}
          {tab === "attendance" && <AttendanceTab hasEmployees={state.employees.some((e) => e.isActive)} />}
          {tab === "payroll" && (
            <PayrollTable runs={state.runs} onOpen={setDetailId} onRun={() => setPayrollModal(true)} />
          )}
          {tab === "performance" && <PerformanceMatrix />}
          {tab === "labor" && <LaborAnalytics />}
          {tab === "reconciliation" && <ShiftDiscrepancyMatrix />}
        </>
      )}

      {form && (
        <EmployeeFormModal
          employee={form.employee}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            void load();
          }}
        />
      )}
      {payrollModal && (
        <PayrollRunModal
          onClose={() => setPayrollModal(false)}
          onRan={(runId) => {
            setPayrollModal(false);
            setDetailId(runId);
            void load();
          }}
        />
      )}
      {detailId && <PayrollDetailDrawer id={detailId} onClose={() => setDetailId(null)} onChanged={() => void load()} />}
      {confirm && (
        <ConfirmDialog
          title={`Remove ${confirm.name}?`}
          message="The employee and their attendance will be removed. Past payroll runs keep their snapshot."
          confirmLabel="Remove"
          icon="trash"
          danger
          onConfirm={() => void onDelete()}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

// ── Employees tab ─────────────────────────────────────────────────────────────

function EmployeesTable({
  employees,
  onEdit,
  onAskDelete,
  onNew,
}: {
  employees: Employee[];
  onEdit: (e: Employee) => void;
  onAskDelete: (e: Employee) => void;
  onNew: () => void;
}) {
  if (employees.length === 0) {
    return (
      <EmptyState
        icon="users"
        title="No employees yet"
        body="Add your team — baristas, cashiers, managers. Pay rates and attendance build on these records."
        cta="Add your first employee"
        onCta={onNew}
      />
    );
  }
  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="text-left text-[12px] font-semibold text-ink-faint border-b border-ink/8 bg-paper/40">
              <th className="px-5 py-2.5 font-semibold">Name</th>
              <th className="px-3 py-2.5 font-semibold">Position</th>
              <th className="px-3 py-2.5 font-semibold">Pay</th>
              <th className="px-3 py-2.5 font-semibold text-right">Rate</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-5 py-2.5 font-semibold text-right">·</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id} className="border-b border-ink/5 last:border-0 hover:bg-paper/40 transition">
                <td className="px-5 py-3">
                  <Link href={`/dashboard/hr/employees/${e.id}`} className="font-semibold hover:text-brand-600 transition">
                    {e.name}
                  </Link>
                  <span className="block text-[11.5px] text-ink-faint">{e.employmentType}</span>
                </td>
                <td className="px-3 py-3 text-ink-soft">{e.position ?? "—"}</td>
                <td className="px-3 py-3">
                  <span className={"inline-block text-[11px] font-bold rounded-full px-2.5 py-0.5 " + (PAY_TAG[e.payType] ?? "bg-paper text-ink-soft")}>{e.payType}</span>
                </td>
                <td className="px-3 py-3 text-right font-bold tabular-nums whitespace-nowrap">{formatCents(e.payRateCents)}</td>
                <td className="px-3 py-3">
                  <span className={"inline-block text-[11px] font-bold rounded-full px-2.5 py-0.5 " + (e.isActive ? "bg-accent-50 text-accent-600" : "bg-paper hairline text-ink-faint")}>
                    {e.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/dashboard/hr/employees/${e.id}`}
                      aria-label="Open profile"
                      title="Open profile"
                      className="grid place-items-center w-8 h-8 rounded-[9px] text-ink-faint hover:bg-brand-50 hover:text-brand-600 transition duration-150"
                    >
                      <Icon name="eye" className="w-[17px] h-[17px]" strokeWidth={1.7} />
                    </Link>
                    <RowAction icon="pencil" label="Edit" onClick={() => onEdit(e)} />
                    <RowAction icon="trash" label="Remove" danger onClick={() => onAskDelete(e)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Attendance tab ─────────────────────────────────────────────────────────────

function thisMonthManila(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

/**
 * The whole team's month at a glance. Every figure is derived on the server from
 * each employee's schedule + Shift In / Shift Out (timecards) + any manual
 * entries — nothing is typed in here. Open an employee to see their calendar,
 * fix a missing Shift Out, or mark a day by hand.
 */
function AttendanceTab({ hasEmployees }: { hasEmployees: boolean }) {
  const [month, setMonth] = useState(thisMonthManila());
  const [state, setState] = useState<
    { status: "loading"; for: string } | { status: "error"; message: string; for: string } | { status: "ready"; rows: TeamAttendanceRow[]; for: string }
  >({ status: "loading", for: "" });

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getTeamAttendance(month);
      if (!alive) return;
      if (res.ok) setState({ status: "ready", rows: res.rows, for: month });
      else setState({ status: "error", message: res.error ?? "Could not load attendance.", for: month });
    })();
    return () => {
      alive = false;
    };
  }, [month]);

  if (!hasEmployees) {
    return (
      <EmptyState
        icon="users"
        title="No active employees"
        body="Add employees and give them till access. Their Shift In / Shift Out then becomes their Time In / Time Out."
        cta=""
        onCta={() => {}}
        hideCta
      />
    );
  }

  const loading = state.for !== month || state.status === "loading";
  const reviewTotal = state.status === "ready" ? state.rows.reduce((s, r) => s + r.summary.needsReviewDays, 0) : 0;

  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div>
          <h3 className="font-extrabold tracking-tight">Attendance</h3>
          <p className="text-[12.5px] text-ink-soft">
            From Shift In / Shift Out and each person&rsquo;s work schedule, after unpaid breaks. Open someone to see their
            calendar.
          </p>
        </div>
        <input
          type="month"
          value={month}
          max={thisMonthManila()}
          onChange={(e) => setMonth(e.target.value)}
          className="field-input rounded-[10px] px-3 py-2 text-[14px]"
        />
      </div>

      {reviewTotal > 0 && (
        <div className="mx-6 mb-4 flex items-center gap-2.5 rounded-[10px] bg-amber-50 px-4 py-2.5 text-[13px] text-amber-700">
          <Icon name="warning" className="w-4 h-4 shrink-0" strokeWidth={1.9} />
          {reviewTotal} day{reviewTotal === 1 ? "" : "s"} with a missing Shift Out. They count as 0 hours, and payroll for this
          period can&rsquo;t be approved until they&rsquo;re fixed.
        </div>
      )}

      {loading ? (
        <div className="px-6 pb-6 space-y-2 animate-pulse">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 rounded-[10px] bg-paper" />
          ))}
        </div>
      ) : state.status === "error" ? (
        <p className="px-6 pb-6 text-[13px] font-semibold text-rose-600">{state.message}</p>
      ) : state.status === "ready" ? (
        <div className="overflow-x-auto border-t border-ink/8">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="text-left text-[12px] font-semibold text-ink-faint border-b border-ink/8 bg-paper/40">
                <th className="px-6 py-2.5">Employee</th>
                <th className="px-3 py-2.5 text-center">Present</th>
                <th className="px-3 py-2.5 text-center">Absent</th>
                <th className="px-3 py-2.5 text-center">Half-day</th>
                <th className="px-3 py-2.5 text-center">Leave</th>
                <th className="px-3 py-2.5 text-right">Hours worked</th>
                <th className="px-6 py-2.5 text-right">·</th>
              </tr>
            </thead>
            <tbody>
              {state.rows.map((r) => (
                <tr key={r.employeeId} className="border-b border-ink/5 last:border-0 hover:bg-paper/40 transition">
                  <td className="px-6 py-3">
                    <Link href={`/dashboard/hr/employees/${r.employeeId}`} className="font-semibold hover:text-brand-600 transition">
                      {r.name}
                    </Link>
                    <span className="block text-[11.5px] text-ink-faint">
                      {r.position ?? "—"}
                      {!r.hasTillAccess && " · no till login (manual days only)"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center tabular-nums font-bold text-accent-600">{r.summary.presentDays}</td>
                  <td className="px-3 py-3 text-center tabular-nums font-bold text-rose-600">{r.summary.absentDays}</td>
                  <td className="px-3 py-3 text-center tabular-nums font-bold text-amber-600">{r.summary.halfDays}</td>
                  <td className="px-3 py-3 text-center tabular-nums font-bold text-brand-600">{r.summary.leaveDays}</td>
                  <td className="px-3 py-3 text-right tabular-nums font-bold">
                    {Math.round((r.summary.workedMinutes / 60) * 10) / 10}h
                  </td>
                  <td className="px-6 py-3 text-right">
                    {r.summary.needsReviewDays > 0 ? (
                      <Link
                        href={`/dashboard/hr/employees/${r.employeeId}`}
                        className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11.5px] font-bold text-amber-700"
                      >
                        <Icon name="warning" className="w-3.5 h-3.5" strokeWidth={1.9} />
                        Fix {r.summary.needsReviewDays}
                      </Link>
                    ) : (
                      <Link
                        href={`/dashboard/hr/employees/${r.employeeId}`}
                        className="text-[12.5px] font-semibold text-brand-600 hover:text-brand-700"
                      >
                        Calendar →
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

// ── Payroll tab ─────────────────────────────────────────────────────────────

function PayrollTable({
  runs,
  onOpen,
  onRun,
}: {
  runs: PayrollRunSummary[];
  onOpen: (id: string) => void;
  onRun: () => void;
}) {
  if (runs.length === 0) {
    return (
      <EmptyState
        icon="peso"
        title="No payroll runs yet"
        body="Start a payroll run for a period. Base pay comes from each employee's daily rate and their Shift In / Shift Out hours; you review and approve it."
        cta="Start payroll"
        onCta={onRun}
      />
    );
  }
  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="text-left text-[12px] font-semibold text-ink-faint border-b border-ink/8 bg-paper/40">
              <th className="px-5 py-2.5 font-semibold">Run #</th>
              <th className="px-3 py-2.5 font-semibold">Period</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 font-semibold text-center">Employees</th>
              <th className="px-3 py-2.5 font-semibold text-right">Final payable</th>
              <th className="px-5 py-2.5 font-semibold text-right">·</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id} onClick={() => onOpen(run.id)} className="border-b border-ink/5 last:border-0 hover:bg-paper/40 transition cursor-pointer">
                <td className="px-5 py-3 font-bold tabular-nums">{run.reference}</td>
                <td className="px-3 py-3 text-ink-soft tabular-nums whitespace-nowrap">
                  {formatDate(run.periodStart)} – {formatDate(run.periodEnd)}
                </td>
                <td className="px-3 py-3">
                  {run.status === "approved" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent-50 px-2.5 py-0.5 text-[11.5px] font-bold text-accent-700">
                      <Icon name="lock" className="w-3.5 h-3.5" strokeWidth={1.9} />
                      Approved
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-0.5 text-[11.5px] font-bold text-amber-700">Draft — review</span>
                  )}
                </td>
                <td className="px-3 py-3 text-center tabular-nums">{run.headcount}</td>
                <td className="px-3 py-3 text-right font-bold tracking-tight tabular-nums whitespace-nowrap">{formatCents(run.totalPayableCents)}</td>
                <td className="px-5 py-3" onClick={(ev) => ev.stopPropagation()}>
                  <div className="flex items-center justify-end">
                    <RowAction icon="eye" label="View" onClick={() => onOpen(run.id)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Shared bits ───────────────────────────────────────────────────────────────

function EmptyState({
  icon,
  title,
  body,
  cta,
  onCta,
  hideCta,
}: {
  icon: IconName;
  title: string;
  body: string;
  cta: string;
  onCta: () => void;
  hideCta?: boolean;
}) {
  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card px-5 py-14 text-center">
      <span className="inline-grid place-items-center w-12 h-12 rounded-[14px] bg-brand-50 text-brand-600">
        <Icon name={icon} className="w-6 h-6" strokeWidth={1.6} />
      </span>
      <p className="mt-3 text-[14px] font-semibold">{title}</p>
      <p className="mt-1 text-[13px] text-ink-soft max-w-[44ch] mx-auto">{body}</p>
      {!hideCta && (
        <button type="button" onClick={onCta} className="mt-4 inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[13.5px] px-4 py-2.5 rounded-[10px] shadow-btn transition duration-150">
          <Icon name="plus" className="w-4 h-4" strokeWidth={2} />
          {cta}
        </button>
      )}
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  // Transparent background with an animating bottom active border that rides the
  // shared track. `shrink-0 whitespace-nowrap` keeps every tab on one line so the
  // row scrolls horizontally instead of wrapping or forcing a vertical scrollbar.
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "shrink-0 whitespace-nowrap bg-transparent px-4 py-2.5 text-[13.5px] font-semibold border-b-2 -mb-px transition-colors duration-200 " +
        (active ? "border-brand-500 text-brand-600" : "border-transparent text-ink-soft hover:text-ink hover:border-ink/15")
      }
    >
      {label}
    </button>
  );
}

function RowAction({ icon, label, danger, onClick }: { icon: IconName; label: string; danger?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={
        "grid place-items-center w-8 h-8 rounded-[9px] transition duration-150 " +
        (danger ? "text-ink-faint hover:bg-rose-50 hover:text-rose-600" : "text-ink-faint hover:bg-brand-50 hover:text-brand-600")
      }
    >
      <Icon name={icon} className="w-[17px] h-[17px]" strokeWidth={1.7} />
    </button>
  );
}

function Kpi({ icon, label, value, tone }: { icon: IconName; label: string; value: string; tone?: "good" }) {
  // Premium KPI tile: an uppercase, letter-spaced top label paired with its icon,
  // then a tight, oversized figure. Built on theme tokens so it reads crisp on the
  // ivory canvas in light mode and as a floating charcoal card in dark mode, with
  // the border firming up on hover.
  return (
    <div className="group rounded-xl2 bg-surface hairline shadow-card p-5 transition duration-200 hover:hairline-strong hover:shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <span className="text-cap font-semibold uppercase tracking-wider text-ink-faint">{label}</span>
        <span className={"grid place-items-center w-8 h-8 rounded-[10px] transition-colors " + (tone === "good" ? "bg-accent-50 text-accent-600" : "bg-brand-50 text-brand-600")}>
          <Icon name={icon} className="w-[17px] h-[17px]" strokeWidth={1.8} />
        </span>
      </div>
      <div className="mt-3.5 text-stat font-extrabold tracking-tightest tabular-nums text-ink">{value}</div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl2 bg-surface hairline shadow-card h-[120px]" />
        ))}
      </div>
      <div className="rounded-xl2 bg-surface hairline shadow-card h-[320px]" />
    </div>
  );
}
