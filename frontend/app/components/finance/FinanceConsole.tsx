"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "../Icon";
import { useToast } from "../Toast";
import { ConfirmDialog } from "../ConfirmDialog";
import { formatCents, formatCentsWhole, formatDate } from "@/lib/format";
import {
  deleteExpense,
  getFinanceSummary,
  listExpenses,
  type Expense,
  type FinanceSummary,
} from "@/lib/finance";
import { ProfitTrendChart, ExpenseMixChart } from "./FinanceCharts";
import { ExpenseFormModal } from "./ExpenseFormModal";

/**
 * Merchant Finance console — a single-Tenant P&L. Revenue is summed live from
 * the POS `sales` ledger server-side and set against the operating `expenses`
 * the owner records here; the page derives net profit and margin and renders
 * the monthly trend, expense mix, and a full expense ledger with CRUD. Tenant
 * isolation is enforced by the API from the session, never the client.
 */
const TREND_MONTHS = 6;

const METHOD_TAG: Record<string, string> = {
  Cash: "bg-paper hairline text-ink-soft",
  GCash: "bg-brand-50 text-brand-600",
  Maya: "bg-accent-50 text-accent-600",
  "Bank Transfer": "bg-amber-50 text-amber-600",
  Card: "bg-brand-50 text-brand-600",
  Other: "bg-paper hairline text-ink-soft",
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; summary: FinanceSummary; expenses: Expense[] };

export function FinanceConsole() {
  const { push } = useToast();
  const [state, setState] = useState<State>({ status: "loading" });
  const [editing, setEditing] = useState<Expense | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<Expense | null>(null);

  async function reload() {
    const [s, e] = await Promise.all([getFinanceSummary(TREND_MONTHS), listExpenses()]);
    if (s.ok && e.ok) {
      setState({ status: "ready", summary: s.summary, expenses: e.expenses });
    } else {
      setState({
        status: "error",
        message: (!s.ok && s.error) || (!e.ok && e.error) || "Could not load your finances.",
      });
    }
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [s, e] = await Promise.all([getFinanceSummary(TREND_MONTHS), listExpenses()]);
      if (!alive) return;
      if (s.ok && e.ok) setState({ status: "ready", summary: s.summary, expenses: e.expenses });
      else
        setState({
          status: "error",
          message: (!s.ok && s.error) || (!e.ok && e.error) || "Could not load your finances.",
        });
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function onDelete() {
    if (!confirm) return;
    const target = confirm;
    setConfirm(null);
    const res = await deleteExpense(target.id);
    if (res.ok) {
      push({ variant: "success", title: "Expense deleted" });
      void reload();
    } else {
      push({ variant: "danger", title: "Couldn't delete", message: res.error });
    }
  }

  return (
    <div className="space-y-6 max-w-[1180px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[1.3rem] font-extrabold tracking-tightest">Profit &amp; loss</h2>
          <p className="text-[13.5px] text-ink-soft">
            {state.status === "ready"
              ? `Revenue from the register, set against your costs — ${state.summary.monthLabel}.`
              : "Revenue from the register, set against your recorded costs."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[14px] px-5 py-2.5 rounded-[10px] shadow-btn tracking-tight transition duration-150"
        >
          <Icon name="plus" className="w-[18px] h-[18px]" strokeWidth={2} />
          Record expense
        </button>
      </div>

      {state.status === "loading" && <Skeleton />}

      {state.status === "error" && (
        <div className="rounded-xl2 bg-surface hairline shadow-card p-8 text-center">
          <p className="text-[14px] font-semibold text-rose-600">{state.message}</p>
        </div>
      )}

      {state.status === "ready" && (
        <Ready
          summary={state.summary}
          expenses={state.expenses}
          onAdd={() => setAdding(true)}
          onEdit={setEditing}
          onAskDelete={setConfirm}
        />
      )}

      {(adding || editing) && (
        <ExpenseFormModal
          expense={editing}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onSaved={() => {
            setAdding(false);
            setEditing(null);
            void reload();
          }}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title="Delete this expense?"
          message={`${confirm.category} · ${formatCents(confirm.amountCents)} on ${formatDate(confirm.incurredOn)} will be permanently removed from your books.`}
          confirmLabel="Delete"
          icon="trash"
          danger
          onConfirm={() => void onDelete()}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

function Ready({
  summary,
  expenses,
  onAdd,
  onEdit,
  onAskDelete,
}: {
  summary: FinanceSummary;
  expenses: Expense[];
  onAdd: () => void;
  onEdit: (e: Expense) => void;
  onAskDelete: (e: Expense) => void;
}) {
  const profit = summary.netProfitCents;
  const profitPositive = profit >= 0;

  return (
    <>
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon="trend"
          label={`Net profit · ${summary.monthLabel}`}
          value={formatCentsWhole(profit)}
          tone={profitPositive ? "good" : "bad"}
          note={`${summary.marginPct}% margin`}
        />
        <Kpi icon="peso" label="Net sales (ex-VAT)" value={formatCentsWhole(summary.revenue.netCents)} />
        <Kpi icon="wallet" label="Expenses this month" value={formatCentsWhole(summary.expenseCents)} tone="bad" />
        <Kpi icon="receipt" label="Output VAT (12%)" value={formatCentsWhole(summary.revenue.vatCents)} muted />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Profit trend */}
        <div className="lg:col-span-2 rounded-xl2 bg-surface hairline shadow-card p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold tracking-tight">Profit trend</h3>
            <Legend />
          </div>
          <ProfitTrendChart points={summary.trend} />
        </div>

        {/* Expense mix */}
        <div className="rounded-xl2 bg-surface hairline shadow-card p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold tracking-tight">Where it went</h3>
            <span className="text-[12px] font-semibold text-ink-faint">this month</span>
          </div>
          <div className="mt-2">
            <ExpenseMixChart slices={summary.byCategory} />
          </div>
        </div>
      </div>

      {/* Expense ledger */}
      <div className="rounded-xl2 bg-surface hairline shadow-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <h3 className="font-extrabold tracking-tight">Expense ledger</h3>
            <p className="text-[12.5px] text-ink-soft">
              {expenses.length} {expenses.length === 1 ? "entry" : "entries"} recorded
            </p>
          </div>
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-1.5 bg-paper hairline text-ink font-semibold text-[13px] px-3.5 py-2 rounded-[9px] hover:border-brand-200 hover:text-brand-600 transition duration-150"
          >
            <Icon name="plus" className="w-4 h-4" strokeWidth={2} />
            Add
          </button>
        </div>

        {expenses.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <span className="inline-grid place-items-center w-12 h-12 rounded-[14px] bg-brand-50 text-brand-600">
              <Icon name="wallet" className="w-6 h-6" strokeWidth={1.6} />
            </span>
            <p className="mt-3 text-[14px] font-semibold">No expenses yet</p>
            <p className="mt-1 text-[13px] text-ink-soft max-w-[38ch] mx-auto">
              Record rent, payroll, utilities and supplies to see your true profit, not just sales.
            </p>
            <button
              type="button"
              onClick={onAdd}
              className="mt-4 inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[13.5px] px-4 py-2.5 rounded-[10px] shadow-btn transition duration-150"
            >
              <Icon name="plus" className="w-4 h-4" strokeWidth={2} />
              Record your first expense
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="text-left text-[12px] font-semibold text-ink-faint border-y border-ink/8 bg-paper/40">
                  <th className="px-5 py-2.5 font-semibold">Date</th>
                  <th className="px-3 py-2.5 font-semibold">Category</th>
                  <th className="px-3 py-2.5 font-semibold">Payee</th>
                  <th className="px-3 py-2.5 font-semibold">Paid via</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Amount</th>
                  <th className="px-5 py-2.5 font-semibold text-right">·</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id} className="border-b border-ink/5 last:border-0 hover:bg-paper/40 transition">
                    <td className="px-5 py-3 whitespace-nowrap text-ink-soft tabular-nums">
                      {formatDate(e.incurredOn)}
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-semibold">{e.category}</span>
                      {e.note && <span className="block text-[12px] text-ink-faint truncate max-w-[28ch]">{e.note}</span>}
                    </td>
                    <td className="px-3 py-3 text-ink-soft">{e.payee ?? "—"}</td>
                    <td className="px-3 py-3">
                      <span className={"inline-block text-[11.5px] font-bold rounded-full px-2.5 py-0.5 " + (METHOD_TAG[e.paymentMethod] ?? "bg-paper text-ink-soft")}>
                        {e.paymentMethod}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-bold tracking-tight tabular-nums whitespace-nowrap">
                      {formatCents(e.amountCents)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <RowAction icon="pencil" label="Edit" onClick={() => onEdit(e)} />
                        <RowAction icon="trash" label="Delete" danger onClick={() => onAskDelete(e)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function Legend() {
  return (
    <div className="hidden sm:flex items-center gap-3 text-[11.5px] font-semibold">
      <span className="inline-flex items-center gap-1.5 text-ink-soft">
        <span className="w-2.5 h-2.5 rounded-[3px] bg-brand-500" /> Net sales
      </span>
      <span className="inline-flex items-center gap-1.5 text-ink-soft">
        <span className="w-2.5 h-2.5 rounded-[3px] bg-rose-500" /> Expenses
      </span>
      <span className="inline-flex items-center gap-1.5 text-ink-soft">
        <span className="w-3 h-[3px] rounded-full bg-accent-500" /> Profit
      </span>
    </div>
  );
}

function RowAction({
  icon,
  label,
  danger,
  onClick,
}: {
  icon: IconName;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={
        "grid place-items-center w-8 h-8 rounded-[9px] transition duration-150 " +
        (danger
          ? "text-ink-faint hover:bg-rose-50 hover:text-rose-600"
          : "text-ink-faint hover:bg-brand-50 hover:text-brand-600")
      }
    >
      <Icon name={icon} className="w-[17px] h-[17px]" strokeWidth={1.7} />
    </button>
  );
}

function Kpi({
  icon,
  label,
  value,
  note,
  tone,
  muted,
}: {
  icon: IconName;
  label: string;
  value: string;
  note?: string;
  tone?: "good" | "bad";
  muted?: boolean;
}) {
  const iconTone =
    tone === "good"
      ? "bg-accent-50 text-accent-600"
      : tone === "bad"
        ? "bg-rose-50 text-rose-600"
        : "bg-brand-50 text-brand-600";
  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card p-5">
      <div className="flex items-center justify-between">
        <span className={"grid place-items-center w-9 h-9 rounded-[10px] " + iconTone}>
          <Icon name={icon} className="w-[18px] h-[18px]" strokeWidth={1.7} />
        </span>
        {note && (
          <span className={"text-[12px] font-bold " + (tone === "bad" ? "text-rose-600" : "text-accent-600")}>
            {note}
          </span>
        )}
      </div>
      <div className={"mt-3 text-[1.7rem] leading-none font-extrabold tracking-tightest " + (muted ? "text-ink-soft" : "")}>
        {value}
      </div>
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
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl2 bg-surface hairline shadow-card h-[300px]" />
        <div className="rounded-xl2 bg-surface hairline shadow-card h-[300px]" />
      </div>
      <div className="rounded-xl2 bg-surface hairline shadow-card h-[260px]" />
    </div>
  );
}
