"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "../Icon";
import { useToast } from "../Toast";
import { ConfirmDialog } from "../ConfirmDialog";
import { formatCentsWhole, formatCount, formatDate } from "@/lib/format";
import {
  deleteCustomer,
  getCrmSummary,
  listCustomers,
  type CrmSummary,
  type Customer,
} from "@/lib/crm";
import { CustomerFormModal } from "./CustomerFormModal";
import { CustomerDetailDrawer } from "./CustomerDetailDrawer";

/**
 * Merchant CRM console — the customer book. Lifetime spend, order counts and
 * loyalty derive from POS sales (customers attached at checkout). Tenant-scoped.
 */
type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; summary: CrmSummary; customers: Customer[] };

export function CrmConsole() {
  const { push } = useToast();
  const [state, setState] = useState<State>({ status: "loading" });
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<{ customer: Customer | null } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Customer | null>(null);

  async function load() {
    const [s, c] = await Promise.all([getCrmSummary(), listCustomers()]);
    if (s.ok && c.ok) setState({ status: "ready", summary: s.summary, customers: c.customers });
    else setState({ status: "error", message: (!s.ok && s.error) || (!c.ok && c.error) || "Could not load CRM." });
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [s, c] = await Promise.all([getCrmSummary(), listCustomers()]);
      if (!alive) return;
      if (s.ok && c.ok) setState({ status: "ready", summary: s.summary, customers: c.customers });
      else setState({ status: "error", message: (!s.ok && s.error) || (!c.ok && c.error) || "Could not load CRM." });
    })();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    if (state.status !== "ready") return [];
    const q = search.trim().toLowerCase();
    if (!q) return state.customers;
    return state.customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [state, search]);

  async function onDelete() {
    if (!confirm) return;
    const target = confirm;
    setConfirm(null);
    const res = await deleteCustomer(target.id);
    if (res.ok) {
      push({ variant: "success", title: "Customer removed" });
      void load();
    } else {
      push({ variant: "danger", title: "Couldn't remove", message: res.error });
    }
  }

  return (
    <div className="space-y-6 max-w-[1180px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[1.3rem] font-extrabold tracking-tightest">Customers</h2>
          <p className="text-[13.5px] text-ink-soft">Your customer book — spend, visits and loyalty from real sales.</p>
        </div>
        <button type="button" onClick={() => setForm({ customer: null })} className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[14px] px-5 py-2.5 rounded-[10px] shadow-btn tracking-tight transition duration-150">
          <Icon name="plus" className="w-[18px] h-[18px]" strokeWidth={2} />
          Add customer
        </button>
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
            <Kpi icon="users" label="Customers" value={String(state.summary.totalCustomers)} />
            <Kpi icon="heart" label="New this month" value={String(state.summary.newThisMonth)} tone="good" />
            <Kpi icon="refresh" label="Repeat customers" value={String(state.summary.repeatCustomers)} />
            <Kpi icon="tag" label="Loyalty points out" value={formatCount(state.summary.loyaltyPointsOutstanding)} />
          </div>

          {state.customers.length === 0 ? (
            <EmptyState onNew={() => setForm({ customer: null })} />
          ) : (
            <div className="rounded-xl2 bg-surface hairline shadow-card overflow-hidden">
              <div className="px-5 py-4 flex items-center justify-between gap-3">
                <div className="relative flex-1 max-w-[320px]">
                  <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-[16px] h-[16px] text-ink-faint" strokeWidth={1.7} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name, phone or tag…"
                    className="field-input w-full rounded-[10px] pl-9 pr-3 py-2 text-[13.5px]"
                  />
                </div>
                <span className="text-[12.5px] text-ink-faint">{filtered.length} shown</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-[13.5px]">
                  <thead>
                    <tr className="text-left text-[12px] font-semibold text-ink-faint border-y border-ink/8 bg-paper/40">
                      <th className="px-5 py-2.5 font-semibold">Customer</th>
                      <th className="px-3 py-2.5 font-semibold">Phone</th>
                      <th className="px-3 py-2.5 font-semibold text-center">Orders</th>
                      <th className="px-3 py-2.5 font-semibold text-right">Spent</th>
                      <th className="px-3 py-2.5 font-semibold text-right">Points</th>
                      <th className="px-3 py-2.5 font-semibold">Last visit</th>
                      <th className="px-5 py-2.5 font-semibold text-right">·</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c) => (
                      <tr key={c.id} onClick={() => setDetailId(c.id)} className="border-b border-ink/5 last:border-0 hover:bg-paper/40 transition cursor-pointer">
                        <td className="px-5 py-3">
                          <span className="font-semibold">{c.name}</span>
                          {!c.isActive && <span className="ml-2 text-[11px] text-ink-faint">(inactive)</span>}
                          {c.tags.length > 0 && (
                            <span className="ml-2 inline-flex gap-1">
                              {c.tags.slice(0, 2).map((t) => (
                                <span key={t} className="text-[10.5px] font-bold rounded-full px-1.5 py-0.5 bg-brand-50 text-brand-600">{t}</span>
                              ))}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-ink-soft tabular-nums">{c.phone ?? "—"}</td>
                        <td className="px-3 py-3 text-center tabular-nums">{c.orderCount}</td>
                        <td className="px-3 py-3 text-right font-bold tabular-nums whitespace-nowrap">{formatCentsWhole(c.totalSpentCents)}</td>
                        <td className="px-3 py-3 text-right font-bold tabular-nums text-brand-600">{c.loyaltyPoints}</td>
                        <td className="px-3 py-3 text-ink-soft tabular-nums whitespace-nowrap">{c.lastOrderAt ? formatDate(c.lastOrderAt) : "—"}</td>
                        <td className="px-5 py-3" onClick={(ev) => ev.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <RowAction icon="eye" label="View" onClick={() => setDetailId(c.id)} />
                            <RowAction icon="pencil" label="Edit" onClick={() => setForm({ customer: c })} />
                            <RowAction icon="trash" label="Remove" danger onClick={() => setConfirm(c)} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {form && (
        <CustomerFormModal
          customer={form.customer}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            void load();
          }}
        />
      )}
      {detailId && (
        <CustomerDetailDrawer
          id={detailId}
          onClose={() => setDetailId(null)}
          onEdit={(c) => {
            setDetailId(null);
            setForm({ customer: c });
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={`Remove ${confirm.name}?`}
          message="The customer will be removed. Their past sales stay in your records but lose the customer link."
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

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card px-5 py-14 text-center">
      <span className="inline-grid place-items-center w-12 h-12 rounded-[14px] bg-brand-50 text-brand-600">
        <Icon name="heart" className="w-6 h-6" strokeWidth={1.6} />
      </span>
      <p className="mt-3 text-[14px] font-semibold">No customers yet</p>
      <p className="mt-1 text-[13px] text-ink-soft max-w-[44ch] mx-auto">
        Add customers here, then attach them at POS checkout — their spend, visits and loyalty points
        build up automatically.
      </p>
      <button type="button" onClick={onNew} className="mt-4 inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[13.5px] px-4 py-2.5 rounded-[10px] shadow-btn transition duration-150">
        <Icon name="plus" className="w-4 h-4" strokeWidth={2} />
        Add your first customer
      </button>
    </div>
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
