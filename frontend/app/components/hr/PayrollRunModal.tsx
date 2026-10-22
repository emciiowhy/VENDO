"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { useToast } from "../Toast";
import { runPayroll } from "@/lib/hr";

/**
 * Start a payroll run for a period. The server creates a DRAFT: each line's
 * base pay = daily rate ÷ standard hours × regular hours from Shift In / Shift
 * Out. The owner/manager then reviews and approves it. A period can't overlap
 * an existing run, so the same day is never paid twice.
 */
function firstOfMonth(): string {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), "01"].join("-");
}
/** Semi-monthly cut-offs for the current month: 1–15 and 16–end. */
function cutoff(which: 1 | 2): { start: string; end: string } {
  const d = new Date();
  const ym = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0")].join("-");
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return which === 1 ? { start: `${ym}-01`, end: `${ym}-15` } : { start: `${ym}-16`, end: `${ym}-${last}` };
}
function today(): string {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

export function PayrollRunModal({
  onClose,
  onRan,
}: {
  onClose: () => void;
  onRan: (runId: string) => void;
}) {
  const { push } = useToast();
  const [periodStart, setPeriodStart] = useState(firstOfMonth());
  const [periodEnd, setPeriodEnd] = useState(today());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit() {
    if (periodStart > periodEnd) return setError("The end date must be on or after the start.");
    setBusy(true);
    setError(null);
    const res = await runPayroll({ periodStart, periodEnd, note });
    if (res.ok) {
      push({ variant: "success", title: `Draft ${res.run.reference} ready`, message: "Review the lines, then approve." });
      onRan(res.run.id);
      return;
    }
    setBusy(false);
    setError(res.error ?? (res.errors ? Object.values(res.errors)[0] : "Could not run payroll."));
  }

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center px-5" role="dialog" aria-modal="true" aria-label="Run payroll">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/45 backdrop-blur-sm overlay-backdrop" />
      <div className="relative w-full max-w-[420px] rounded-xl2 bg-surface hairline shadow-soft p-6 overlay-card">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center w-10 h-10 rounded-[11px] bg-brand-50 text-brand-600 shrink-0">
              <Icon name="peso" className="w-5 h-5" strokeWidth={1.8} />
            </span>
            <div>
              <h3 className="text-[1.1rem] font-extrabold tracking-tight">Start payroll</h3>
              <p className="text-[12.5px] text-ink-soft">Creates a draft from daily rates &amp; attendance.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-ink-faint hover:text-ink transition -mt-1 -mr-1 p-1">
            <Icon name="x" className="w-5 h-5" strokeWidth={1.8} />
          </button>
        </div>

        <form
          className="mt-5 space-y-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="flex gap-2">
            {([1, 2] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => {
                  const c = cutoff(w);
                  setPeriodStart(c.start);
                  setPeriodEnd(c.end);
                  setError(null);
                }}
                className="rounded-[9px] bg-paper hairline px-3 py-1.5 text-[12.5px] font-semibold text-ink-soft hover:text-brand-600 hover:border-brand-200"
              >
                {w === 1 ? "1–15 this month" : "16–end this month"}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[12px] font-semibold text-ink-soft">Period start</span>
              <input type="date" value={periodStart} onChange={(e) => { setPeriodStart(e.target.value); setError(null); }} className="field-input w-full rounded-[10px] px-3 py-2.5 text-[14px] mt-1.5" />
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold text-ink-soft">Period end</span>
              <input type="date" value={periodEnd} min={periodStart} onChange={(e) => { setPeriodEnd(e.target.value); setError(null); }} className="field-input w-full rounded-[10px] px-3 py-2.5 text-[14px] mt-1.5" />
            </label>
          </div>
          <label className="block">
            <span className="text-[12px] font-semibold text-ink-soft">Note (optional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 1st cut-off, June" className="field-input w-full rounded-[10px] px-3 py-2.5 text-[14px] mt-1.5" />
          </label>

          <p className="text-[11.5px] text-ink-faint leading-relaxed">
            Overtime and paid leave are suggested for you to approve. SSS, PhilHealth, Pag-IBIG and tax are handled by
            the employer outside VendoPOS.
          </p>

          {error && <p className="text-[12.5px] font-semibold text-rose-600">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-[10px] text-[14px] font-semibold text-ink-soft hover:bg-paper transition duration-150">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[14px] px-5 py-2.5 rounded-[10px] shadow-btn tracking-tight transition duration-150 disabled:opacity-60">
              {busy ? "Creating…" : "Create draft"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
