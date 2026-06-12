"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { useToast } from "../Toast";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_METHODS,
  createExpense,
  updateExpense,
  type Expense,
  type ExpenseFields,
} from "@/lib/finance";

/**
 * Add / edit an operating expense. Amount is keyed in pesos and the backend
 * stores integer centavos. On success it hands the saved row back to the parent
 * so the ledger + P&L can re-derive without a full refetch round-trip.
 */
function today(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

export function ExpenseFormModal({
  expense,
  onClose,
  onSaved,
}: {
  expense: Expense | null;
  onClose: () => void;
  onSaved: (expense: Expense) => void;
}) {
  const { push } = useToast();
  const editing = expense !== null;

  const [incurredOn, setIncurredOn] = useState(() => expense?.incurredOn ?? today());
  const [category, setCategory] = useState(() => expense?.category ?? EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState(() => (expense ? String(expense.amount) : ""));
  const [paymentMethod, setPaymentMethod] = useState(() => expense?.paymentMethod ?? "Cash");
  const [payee, setPayee] = useState(() => expense?.payee ?? "");
  const [note, setNote] = useState(() => expense?.note ?? "");
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
    const amt = Number(amount.replace(/[₱,\s]/g, ""));
    if (!Number.isFinite(amt) || amt <= 0) return setError("Enter a valid amount.");
    setBusy(true);
    setError(null);
    const fields: ExpenseFields = { incurredOn, category, payee, amount, paymentMethod, note };
    const res = editing ? await updateExpense(expense.id, fields) : await createExpense(fields);
    if (res.ok) {
      push({ variant: "success", title: editing ? "Expense updated" : "Expense recorded" });
      onSaved(res.expense);
      return;
    }
    setBusy(false);
    setError(res.error ?? (res.errors ? Object.values(res.errors)[0] : "Could not save the expense."));
  }

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center px-5" role="dialog" aria-modal="true" aria-label={editing ? "Edit expense" : "Record expense"}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/45 backdrop-blur-sm" />
      <div className="relative w-full max-w-[440px] rounded-xl2 bg-surface hairline shadow-soft p-6 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center w-10 h-10 rounded-[11px] bg-brand-50 text-brand-600 shrink-0">
              <Icon name="peso" className="w-5 h-5" strokeWidth={1.8} />
            </span>
            <div>
              <h3 className="text-[1.1rem] font-extrabold tracking-tight">
                {editing ? "Edit expense" : "Record an expense"}
              </h3>
              <p className="text-[12.5px] text-ink-soft">A cost against your store&apos;s books.</p>
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
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[12px] font-semibold text-ink-soft">Date</span>
              <input
                type="date"
                value={incurredOn}
                max={today()}
                onChange={(e) => {
                  setIncurredOn(e.target.value);
                  setError(null);
                }}
                className="field-input w-full rounded-[10px] px-3 py-2.5 text-[14px] mt-1.5"
              />
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold text-ink-soft">Amount (₱)</span>
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setError(null);
                }}
                placeholder="0.00"
                className="field-input w-full rounded-[10px] px-3 py-2.5 text-[14px] mt-1.5 tabular-nums"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-[12px] font-semibold text-ink-soft">Category</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="field-input w-full rounded-[10px] px-3 py-2.5 text-[14px] mt-1.5"
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[12px] font-semibold text-ink-soft">Paid via</span>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="field-input w-full rounded-[10px] px-3 py-2.5 text-[14px] mt-1.5"
              >
                {EXPENSE_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold text-ink-soft">Payee (optional)</span>
              <input
                value={payee}
                onChange={(e) => setPayee(e.target.value)}
                placeholder="e.g. Meralco"
                className="field-input w-full rounded-[10px] px-3 py-2.5 text-[14px] mt-1.5"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-[12px] font-semibold text-ink-soft">Note (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="What was this for?"
              className="field-input w-full rounded-[10px] px-3 py-2.5 text-[14px] mt-1.5 resize-none"
            />
          </label>

          {error && <p className="text-[12.5px] font-semibold text-rose-600">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-[10px] text-[14px] font-semibold text-ink-soft hover:bg-paper transition duration-150"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[14px] px-5 py-2.5 rounded-[10px] shadow-btn tracking-tight transition duration-150 disabled:opacity-60"
            >
              {busy ? "Saving…" : editing ? "Save changes" : "Record expense"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
