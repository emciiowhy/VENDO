"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { ConfirmDialog } from "../ConfirmDialog";
import { useToast } from "../Toast";
import { formatCents, formatDate } from "@/lib/format";
import {
  addPayrollAdjustment,
  approvePayroll,
  deletePayrollAdjustment,
  deletePayrollRun,
  getPayrollRun,
  payrollCsvUrl,
  recalculatePayroll,
  setPayrollAdjustmentApproved,
  setPayrollRate,
  type PayrollLine,
  type PayrollRunDetail,
} from "@/lib/hr";

/**
 * Payroll review. A DRAFT run is where the owner/manager confirms each daily
 * rate, ticks the overtime / paid-leave suggestions they authorise, adds manual
 * adjustments, then approves. An APPROVED run is the locked record (read-only,
 * CSV download). Every peso is computed and re-checked on the server:
 *   Hourly rate = Daily rate ÷ Standard hours
 *   Base        = Hourly rate × Eligible regular hours
 *   Payable     = Base + approved adjustments
 */

const hrs = (m: number) => `${Math.round((m / 60) * 10) / 10}h`;

type Res = { ok: true; run: PayrollRunDetail } | { ok: false; error?: string; errors?: Record<string, string> };

export function PayrollDetailDrawer({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  /** Called after any change, so a list behind the drawer can refresh. */
  onChanged?: () => void;
}) {
  const { push } = useToast();
  const [run, setRun] = useState<PayrollRunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"approve" | "discard" | null>(null);

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
      if (e.key === "Escape" && !confirm) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, confirm]);

  /** Run a change; the server answers with the fresh run. */
  async function act(fn: () => Promise<Res>, success?: string) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res.ok) {
      setRun(res.run);
      onChanged?.();
      if (success) push({ variant: "success", title: success });
    } else {
      push({ variant: "danger", title: "Couldn't save", message: res.error ?? (res.errors ? Object.values(res.errors)[0] : undefined) });
    }
  }

  async function discard() {
    setConfirm(null);
    setBusy(true);
    const res = await deletePayrollRun(id);
    setBusy(false);
    if (res.ok) {
      push({ variant: "success", title: "Draft discarded" });
      onChanged?.();
      onClose();
    } else push({ variant: "danger", title: "Couldn't discard", message: res.error });
  }

  const draft = run?.status === "draft";

  return (
    <div className="fixed inset-0 z-[120] flex justify-end" role="dialog" aria-modal="true" aria-label="Payroll review">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/45 backdrop-blur-sm overlay-backdrop" />
      <div className="slide-over relative w-full max-w-[760px] h-full bg-surface hairline shadow-soft overflow-y-auto">
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
            <div className="sticky top-0 z-10 bg-surface hairline-b px-6 py-4 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2.5">
                  <h3 className="text-[1.2rem] font-extrabold tracking-tight tabular-nums">{run.reference}</h3>
                  <StatusBadge status={run.status} />
                </div>
                <p className="mt-0.5 text-[13px] text-ink-soft">
                  {formatDate(run.periodStart)} – {formatDate(run.periodEnd)} · {run.headcount} employee
                  {run.headcount === 1 ? "" : "s"}
                  {run.status === "approved" && run.approvedAt && (
                    <> · approved {formatDate(run.approvedAt)}{run.approvedByName ? ` by ${run.approvedByName}` : ""}</>
                  )}
                </p>
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="text-ink-faint hover:text-ink transition p-1">
                <Icon name="x" className="w-5 h-5" strokeWidth={1.8} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <Total label="Base earnings" value={formatCents(run.totalBaseCents)} />
                <Total label="Final payable" value={formatCents(run.totalPayableCents)} strong />
              </div>

              {draft && run.blockers.length > 0 && (
                <div className="rounded-[12px] bg-amber-50 px-4 py-3 text-[13px] text-amber-800 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <Icon name="warning" className="w-4 h-4" strokeWidth={1.9} />
                    Before you can approve
                  </div>
                  {run.blockers.map((b) => (
                    <div key={b}>• {b}</div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2.5">
                {draft ? (
                  <>
                    <button
                      type="button"
                      disabled={busy || run.blockers.length > 0}
                      onClick={() => setConfirm("approve")}
                      className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[14px] px-5 py-2.5 rounded-[10px] shadow-btn disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Icon name="check" className="w-[17px] h-[17px]" strokeWidth={2} />
                      Approve payroll
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void act(() => recalculatePayroll(id), "Recalculated from attendance")}
                      className="inline-flex items-center gap-2 bg-paper hairline font-semibold text-[14px] px-4 py-2.5 rounded-[10px] hover:border-brand-200 hover:text-brand-600 disabled:opacity-50"
                    >
                      <Icon name="refresh" className="w-[17px] h-[17px]" strokeWidth={1.8} />
                      Recalculate
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirm("discard")}
                      className="ml-auto inline-flex items-center gap-2 font-semibold text-[14px] px-4 py-2.5 rounded-[10px] text-ink-soft hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                    >
                      Discard draft
                    </button>
                  </>
                ) : (
                  <a
                    href={payrollCsvUrl(run.id)}
                    download
                    className="inline-flex items-center gap-2 bg-paper hairline font-semibold text-[14px] px-4 py-2.5 rounded-[10px] hover:border-brand-200 hover:text-brand-600"
                  >
                    <Icon name="download" className="w-[17px] h-[17px]" strokeWidth={1.8} />
                    Download CSV
                  </a>
                )}
              </div>

              <p className="text-[12px] text-ink-faint">
                Base = daily rate ÷ standard hours × regular hours worked (capped at the standard day). Overtime and paid leave
                count only when approved. SSS, PhilHealth, Pag-IBIG and tax are handled by the employer outside VendoPOS.
              </p>

              <div className="space-y-3">
                {run.lines.map((l) => (
                  <LineCard key={l.id} line={l} draft={draft} busy={busy} runId={run.id} act={act} />
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {confirm === "approve" && run && (
        <ConfirmDialog
          title={`Approve ${run.reference}?`}
          message={`This locks the run at ${formatCents(run.totalPayableCents)} for ${run.headcount} employee${run.headcount === 1 ? "" : "s"}. An approved run can't be edited or deleted — corrections go in the next period.`}
          confirmLabel="Approve and lock"
          icon="check"
          onConfirm={() => {
            setConfirm(null);
            void act(() => approvePayroll(id) as Promise<Res>, "Payroll approved");
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === "discard" && (
        <ConfirmDialog
          title="Discard this draft?"
          message="The draft and its adjustments are deleted. Attendance and employee records are not affected."
          confirmLabel="Discard draft"
          icon="trash"
          danger
          onConfirm={() => void discard()}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

function LineCard({
  line: l,
  draft,
  busy,
  runId,
  act,
}: {
  line: PayrollLine;
  draft: boolean;
  busy: boolean;
  runId: string;
  act: (fn: () => Promise<Res>, success?: string) => Promise<void>;
}) {
  const [rate, setRate] = useState(String(l.dailyRateCents / 100));
  const [adjLabel, setAdjLabel] = useState("");
  const [adjAmount, setAdjAmount] = useState("");
  const [adjSign, setAdjSign] = useState<1 | -1>(1);
  const hourlyCents = l.standardDailyHours > 0 ? l.dailyRateCents / l.standardDailyHours : 0;

  function saveRate() {
    const cents = Math.round((Number(rate) || 0) * 100);
    void act(() => setPayrollRate(runId, l.id, cents), "Daily rate saved");
  }

  function addAdj() {
    const cents = Math.round((Number(adjAmount) || 0) * 100) * adjSign;
    if (!adjLabel.trim() || cents === 0) return;
    void act(() => addPayrollAdjustment(runId, l.id, adjLabel.trim(), cents)).then(() => {
      setAdjLabel("");
      setAdjAmount("");
    });
  }

  return (
    <div className="rounded-[14px] bg-paper hairline p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-extrabold tracking-tight">{l.name}</div>
          {l.legacy ? (
            <div className="text-[12px] text-ink-faint">Recorded before attendance-based payroll.</div>
          ) : (
            <div className="mt-1 flex flex-wrap gap-1.5 text-[11.5px]">
              <Pill tone="bg-accent-50 text-accent-700">{l.presentDays} present</Pill>
              <Pill tone="bg-rose-50 text-rose-600">{l.absentDays} absent</Pill>
              <Pill tone="bg-amber-50 text-amber-700">{l.halfDays} half-day</Pill>
              <Pill tone="bg-brand-50 text-brand-700">{l.leaveDays} leave</Pill>
              <Pill tone="bg-surface hairline text-ink-soft">{hrs(l.workedMinutes)} worked</Pill>
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-[11px] text-ink-faint">Final payable</div>
          <div className="text-[1.15rem] font-extrabold tabular-nums">{formatCents(l.payableCents)}</div>
        </div>
      </div>

      {!l.legacy && (
        <div className="rounded-[10px] bg-surface hairline px-3.5 py-3 space-y-2">
          <div className="flex flex-wrap items-end gap-2.5">
            <label className="space-y-1">
              <span className="block text-[11.5px] font-semibold text-ink-soft">Daily rate (₱)</span>
              <input
                value={rate}
                onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ""))}
                disabled={!draft || busy}
                inputMode="decimal"
                className="field-input w-[120px] rounded-[9px] px-2.5 py-1.5 text-[14px] tabular-nums disabled:opacity-70"
              />
            </label>
            {draft && (
              <button
                type="button"
                onClick={saveRate}
                disabled={busy}
                className={
                  "rounded-[9px] px-3 py-1.5 text-[12.5px] font-bold disabled:opacity-50 " +
                  (l.rateConfirmed ? "bg-paper hairline text-ink-soft hover:text-brand-600" : "bg-brand-500 text-white hover:bg-brand-600 shadow-btn")
                }
              >
                {l.rateConfirmed ? "Update rate" : "Confirm rate"}
              </button>
            )}
            {!l.rateConfirmed && (
              <span className="pb-1.5 text-[12px] font-semibold text-amber-700">Suggested from old pay settings — confirm it</span>
            )}
          </div>
          <div className="text-[12.5px] text-ink-soft tabular-nums">
            {formatCents(l.dailyRateCents)} ÷ {l.standardDailyHours}h = {formatCents(Math.round(hourlyCents))}/h ×{" "}
            {hrs(l.regularMinutes)} regular = <b className="text-ink">{formatCents(l.baseCents)}</b> base
          </div>
        </div>
      )}

      {(l.adjustments.length > 0 || draft) && !l.legacy && (
        <div className="space-y-1.5">
          {l.adjustments.map((a) => (
            <div key={a.id} className="flex items-center gap-2.5 text-[13px]">
              <input
                type="checkbox"
                checked={a.approved}
                disabled={!draft || busy}
                onChange={(e) => void act(() => setPayrollAdjustmentApproved(runId, a.id, e.target.checked))}
                aria-label={`Approve ${a.label}`}
                className="h-4 w-4 accent-brand-500"
              />
              <span className={a.approved ? "text-ink" : "text-ink-faint"}>
                {a.label}
                {a.kind !== "manual" && !a.approved && <span className="ml-1.5 text-[11.5px]">(suggested — tick to pay)</span>}
              </span>
              <span className={"ml-auto tabular-nums font-semibold " + (a.amountCents < 0 ? "text-rose-600" : "")}>
                {a.amountCents < 0 ? "−" : "+"}
                {formatCents(Math.abs(a.amountCents))}
              </span>
              {draft && a.kind === "manual" && (
                <button
                  type="button"
                  onClick={() => void act(() => deletePayrollAdjustment(runId, a.id))}
                  disabled={busy}
                  aria-label={`Remove ${a.label}`}
                  className="grid place-items-center w-7 h-7 rounded-[8px] text-ink-faint hover:bg-rose-50 hover:text-rose-600"
                >
                  <Icon name="trash" className="w-[15px] h-[15px]" strokeWidth={1.7} />
                </button>
              )}
            </div>
          ))}

          {draft && (
            <div className="flex flex-wrap items-center gap-2 pt-1.5">
              <input
                value={adjLabel}
                onChange={(e) => setAdjLabel(e.target.value)}
                placeholder="Adjustment, e.g. Holiday pay"
                maxLength={80}
                className="field-input flex-1 min-w-[160px] rounded-[9px] px-2.5 py-1.5 text-[13px]"
              />
              <div className="flex rounded-[9px] bg-surface hairline p-0.5">
                {([1, -1] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setAdjSign(s)}
                    aria-pressed={adjSign === s}
                    className={"px-2.5 py-1 rounded-[7px] text-[12.5px] font-bold " + (adjSign === s ? "bg-brand-50 text-brand-700" : "text-ink-soft")}
                  >
                    {s === 1 ? "+ Add" : "− Deduct"}
                  </button>
                ))}
              </div>
              <input
                value={adjAmount}
                onChange={(e) => setAdjAmount(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder="₱0.00"
                inputMode="decimal"
                className="field-input w-[100px] rounded-[9px] px-2.5 py-1.5 text-[13px] tabular-nums"
              />
              <button
                type="button"
                onClick={addAdj}
                disabled={busy || !adjLabel.trim() || !(Number(adjAmount) > 0)}
                className="rounded-[9px] bg-paper hairline px-3 py-1.5 text-[12.5px] font-bold text-ink-soft hover:text-brand-600 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: "draft" | "approved" }) {
  return status === "approved" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent-50 px-2.5 py-0.5 text-[11.5px] font-bold text-accent-700">
      <Icon name="lock" className="w-3.5 h-3.5" strokeWidth={1.9} />
      Approved
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-[11.5px] font-bold text-amber-700">Draft</span>
  );
}

function Total({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-[12px] bg-paper hairline px-4 py-3">
      <div className="text-[11.5px] text-ink-faint">{label}</div>
      <div className={"tabular-nums tracking-tight " + (strong ? "text-[1.4rem] font-extrabold" : "text-[1.15rem] font-bold")}>{value}</div>
    </div>
  );
}

function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={"rounded-full px-2 py-0.5 font-semibold " + tone}>{children}</span>;
}
