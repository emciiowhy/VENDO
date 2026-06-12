"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "../Icon";
import { useToast } from "../Toast";
import { ConfirmDialog } from "../ConfirmDialog";
import { formatCents, formatCentsWhole, formatDate } from "@/lib/format";
import {
  ATTENDANCE_STATUSES,
  deleteEmployee,
  getAttendance,
  getHrSummary,
  listEmployees,
  listPayrollRuns,
  saveAttendance,
  type AttendanceRow,
  type Employee,
  type HrSummary,
  type PayrollRunSummary,
} from "@/lib/hr";
import { EmployeeFormModal } from "./EmployeeFormModal";
import { PayrollRunModal } from "./PayrollRunModal";
import { PayrollDetailDrawer } from "./PayrollDetailDrawer";

/**
 * Merchant HR console — employees, attendance and payroll over one tenant-scoped
 * dataset. Attendance is marked per day; payroll derives gross pay from rates +
 * that attendance. Builds on the same staff the cashier/shift ledger uses.
 */
type Tab = "employees" | "attendance" | "payroll";

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
  const [tab, setTab] = useState<Tab>("employees");
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
            Run payroll
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
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi icon="users" label="Employees" value={String(state.summary.headcount)} />
            <Kpi icon="check" label="Present today" value={String(state.summary.presentToday)} tone="good" />
            <Kpi icon="refresh" label="Payroll runs this month" value={String(state.summary.payrollRunsThisMonth)} />
            <Kpi icon="peso" label="Last payroll (gross)" value={formatCentsWhole(state.summary.lastPayrollGrossCents)} />
          </div>

          <div className="flex items-center gap-1 border-b border-ink/8">
            <TabButton active={tab === "employees"} onClick={() => setTab("employees")} label={`Employees (${state.employees.length})`} />
            <TabButton active={tab === "attendance"} onClick={() => setTab("attendance")} label="Attendance" />
            <TabButton active={tab === "payroll"} onClick={() => setTab("payroll")} label={`Payroll (${state.runs.length})`} />
          </div>

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
      {detailId && <PayrollDetailDrawer id={detailId} onClose={() => setDetailId(null)} />}
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
                  <span className="font-semibold">{e.name}</span>
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

function isoToday(): string {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

function AttendanceTab({ hasEmployees }: { hasEmployees: boolean }) {
  const { push } = useToast();
  const [date, setDate] = useState(isoToday());
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getAttendance(date);
      if (!alive) return;
      if (res.ok) {
        setRows(res.attendance);
        setError(null);
      } else {
        setError(res.error ?? "Could not load attendance.");
      }
      setLoadedFor(date);
    })();
    return () => {
      alive = false;
    };
  }, [date]);

  // Skeleton until the rows for the *current* date have loaded (no synchronous
  // reset in the effect body, which the set-state-in-effect lint forbids).
  const loading = loadedFor !== date;

  async function save(row: AttendanceRow, patch: Partial<AttendanceRow>) {
    const next = { ...row, ...patch };
    setRows((prev) => prev.map((r) => (r.employeeId === row.employeeId ? next : r)));
    setSavingId(row.employeeId);
    const res = await saveAttendance({
      employeeId: row.employeeId,
      workDate: date,
      status: next.status ?? "Present",
      hours: next.hours,
    });
    setSavingId(null);
    if (!res.ok) push({ variant: "danger", title: "Couldn't save", message: res.error });
  }

  if (!hasEmployees) {
    return <EmptyState icon="users" title="No active employees" body="Add employees first, then mark their attendance here." cta="" onCta={() => {}} hideCta />;
  }

  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h3 className="font-extrabold tracking-tight">Daily attendance</h3>
          <p className="text-[12.5px] text-ink-soft">Mark who worked, for payroll to use.</p>
        </div>
        <label className="flex items-center gap-2 text-[13px] font-semibold text-ink-soft">
          Date
          <input type="date" value={date} max={isoToday()} onChange={(e) => setDate(e.target.value)} className="field-input rounded-[10px] px-3 py-2 text-[14px]" />
        </label>
      </div>

      {loading ? (
        <div className="px-5 pb-6 space-y-2 animate-pulse">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 rounded-[10px] bg-paper" />
          ))}
        </div>
      ) : error ? (
        <p className="px-5 pb-6 text-[13px] font-semibold text-rose-600">{error}</p>
      ) : (
        <div className="border-t border-ink/8">
          {rows.map((r) => (
            <div key={r.employeeId} className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-ink/5 last:border-0">
              <div className="min-w-[160px] flex-1">
                <span className="font-semibold text-[14px]">{r.name}</span>
                <span className="block text-[11.5px] text-ink-faint">{r.position ?? r.payType}</span>
              </div>
              <select
                value={r.status ?? ""}
                onChange={(e) => void save(r, { status: e.target.value as AttendanceRow["status"] })}
                className="field-input rounded-[10px] px-3 py-2 text-[13.5px] w-[130px]"
              >
                <option value="" disabled>
                  Unmarked
                </option>
                {ATTENDANCE_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              {r.payType === "Hourly" && (
                <label className="flex items-center gap-1.5 text-[12.5px] text-ink-soft">
                  <input
                    inputMode="decimal"
                    value={r.hours || ""}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((x) => (x.employeeId === r.employeeId ? { ...x, hours: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 } : x)),
                      )
                    }
                    onBlur={() => void save(r, {})}
                    placeholder="0"
                    className="field-input rounded-[9px] px-2.5 py-2 text-[13px] w-[64px] text-center tabular-nums"
                  />
                  hrs
                </label>
              )}
              <span className="w-[52px] text-right text-[11.5px] font-semibold">
                {savingId === r.employeeId ? <span className="text-ink-faint">saving…</span> : r.status ? <span className="text-accent-600">✓</span> : null}
              </span>
            </div>
          ))}
        </div>
      )}
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
        body="Run payroll for a period and we'll compute each employee's gross from their rate and attendance."
        cta="Run payroll"
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
              <th className="px-3 py-2.5 font-semibold text-center">Employees</th>
              <th className="px-3 py-2.5 font-semibold text-right">Gross total</th>
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
                <td className="px-3 py-3 text-center tabular-nums">{run.headcount}</td>
                <td className="px-3 py-3 text-right font-bold tracking-tight tabular-nums whitespace-nowrap">{formatCents(run.totalGrossCents)}</td>
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
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "px-4 py-2.5 text-[13.5px] font-semibold border-b-2 -mb-px transition duration-150 " +
        (active ? "border-brand-500 text-brand-600" : "border-transparent text-ink-soft hover:text-ink")
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
  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card p-5">
      <span className={"grid place-items-center w-9 h-9 rounded-[10px] " + (tone === "good" ? "bg-accent-50 text-accent-600" : "bg-brand-50 text-brand-600")}>
        <Icon name={icon} className="w-[18px] h-[18px]" strokeWidth={1.7} />
      </span>
      <div className="mt-3 text-[1.7rem] leading-none font-extrabold tracking-tightest">{value}</div>
      <div className="mt-1.5 text-[12.5px] text-ink-soft">{label}</div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl2 bg-surface hairline shadow-card h-[120px]" />
        ))}
      </div>
      <div className="rounded-xl2 bg-surface hairline shadow-card h-[320px]" />
    </div>
  );
}
