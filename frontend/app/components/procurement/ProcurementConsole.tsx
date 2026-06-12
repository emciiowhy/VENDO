"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "../Icon";
import { useToast } from "../Toast";
import { ConfirmDialog } from "../ConfirmDialog";
import { formatCents, formatCentsWhole, formatDate } from "@/lib/format";
import {
  deletePurchaseOrder,
  deleteSupplier,
  getProcurementSummary,
  listPurchaseOrders,
  listSuppliers,
  type ProcurementSummary,
  type PurchaseOrderSummary,
  type Supplier,
} from "@/lib/procurement";
import { STATUS_STYLE } from "./statusStyle";
import { SupplierFormModal } from "./SupplierFormModal";
import { PoFormModal } from "./PoFormModal";
import { PoDetailDrawer } from "./PoDetailDrawer";

/**
 * Merchant Procurement console — suppliers + purchase orders, with receiving a
 * PO restocking Inventory. Two tabs over one tenant-scoped dataset: the order
 * pipeline and the supplier book. All mutations re-derive from the server.
 */
type Tab = "orders" | "suppliers";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; summary: ProcurementSummary; orders: PurchaseOrderSummary[]; suppliers: Supplier[] };

export function ProcurementConsole() {
  const { push } = useToast();
  const [state, setState] = useState<State>({ status: "loading" });
  const [tab, setTab] = useState<Tab>("orders");

  const [poForm, setPoForm] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [supplierForm, setSupplierForm] = useState<{ supplier: Supplier | null } | null>(null);
  const [confirmPo, setConfirmPo] = useState<PurchaseOrderSummary | null>(null);
  const [confirmSupplier, setConfirmSupplier] = useState<Supplier | null>(null);

  async function load() {
    const [s, o, sup] = await Promise.all([getProcurementSummary(), listPurchaseOrders(), listSuppliers()]);
    if (s.ok && o.ok && sup.ok) {
      setState({ status: "ready", summary: s.summary, orders: o.purchaseOrders, suppliers: sup.suppliers });
    } else {
      setState({
        status: "error",
        message: (!s.ok && s.error) || (!o.ok && o.error) || (!sup.ok && sup.error) || "Could not load procurement.",
      });
    }
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [s, o, sup] = await Promise.all([getProcurementSummary(), listPurchaseOrders(), listSuppliers()]);
      if (!alive) return;
      if (s.ok && o.ok && sup.ok)
        setState({ status: "ready", summary: s.summary, orders: o.purchaseOrders, suppliers: sup.suppliers });
      else
        setState({
          status: "error",
          message: (!s.ok && s.error) || (!o.ok && o.error) || (!sup.ok && sup.error) || "Could not load procurement.",
        });
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function onDeletePo() {
    if (!confirmPo) return;
    const target = confirmPo;
    setConfirmPo(null);
    const res = await deletePurchaseOrder(target.id);
    if (res.ok) {
      push({ variant: "success", title: `${target.reference} deleted` });
      void load();
    } else {
      push({ variant: "danger", title: "Couldn't delete", message: res.error });
    }
  }

  async function onDeleteSupplier() {
    if (!confirmSupplier) return;
    const target = confirmSupplier;
    setConfirmSupplier(null);
    const res = await deleteSupplier(target.id);
    if (res.ok) {
      push({ variant: "success", title: "Supplier deleted" });
      void load();
    } else {
      push({ variant: "danger", title: "Couldn't delete", message: res.error });
    }
  }

  return (
    <div className="space-y-6 max-w-[1180px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[1.3rem] font-extrabold tracking-tightest">Procurement</h2>
          <p className="text-[13.5px] text-ink-soft">Order stock from suppliers — receiving a PO restocks your inventory.</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setSupplierForm({ supplier: null })}
            className="inline-flex items-center gap-2 bg-paper hairline text-ink font-semibold text-[14px] px-4 py-2.5 rounded-[10px] hover:border-brand-200 hover:text-brand-600 transition duration-150"
          >
            <Icon name="truck" className="w-[18px] h-[18px]" strokeWidth={1.7} />
            Add supplier
          </button>
          <button
            type="button"
            onClick={() => setPoForm(true)}
            className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[14px] px-5 py-2.5 rounded-[10px] shadow-btn tracking-tight transition duration-150"
          >
            <Icon name="plus" className="w-[18px] h-[18px]" strokeWidth={2} />
            New purchase order
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
          {/* KPIs */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi icon="cart" label="Open orders" value={String(state.summary.openOrders)} />
            <Kpi icon="peso" label="Value on order" value={formatCentsWhole(state.summary.onOrderValueCents)} />
            <Kpi icon="box" label="Received this month" value={formatCentsWhole(state.summary.receivedThisMonthCents)} tone="good" />
            <Kpi icon="truck" label="Active suppliers" value={String(state.summary.supplierCount)} />
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-ink/8">
            <TabButton active={tab === "orders"} onClick={() => setTab("orders")} label={`Purchase orders (${state.orders.length})`} />
            <TabButton active={tab === "suppliers"} onClick={() => setTab("suppliers")} label={`Suppliers (${state.suppliers.length})`} />
          </div>

          {tab === "orders" ? (
            <OrdersTable
              orders={state.orders}
              onOpen={setDetailId}
              onAskDelete={setConfirmPo}
              onNew={() => setPoForm(true)}
            />
          ) : (
            <SuppliersTable
              suppliers={state.suppliers}
              onEdit={(s) => setSupplierForm({ supplier: s })}
              onAskDelete={setConfirmSupplier}
              onNew={() => setSupplierForm({ supplier: null })}
            />
          )}
        </>
      )}

      {/* Modals & drawers */}
      {poForm && state.status === "ready" && (
        <PoFormModal
          suppliers={state.suppliers}
          onClose={() => setPoForm(false)}
          onSaved={() => {
            setPoForm(false);
            void load();
          }}
        />
      )}
      {supplierForm && (
        <SupplierFormModal
          supplier={supplierForm.supplier}
          onClose={() => setSupplierForm(null)}
          onSaved={() => {
            setSupplierForm(null);
            void load();
          }}
        />
      )}
      {detailId && (
        <PoDetailDrawer id={detailId} onClose={() => setDetailId(null)} onChanged={() => void load()} />
      )}
      {confirmPo && (
        <ConfirmDialog
          title={`Delete ${confirmPo.reference}?`}
          message="This purchase order will be permanently removed. (Received orders are kept as stock-in records and can't be deleted.)"
          confirmLabel="Delete"
          icon="trash"
          danger
          onConfirm={() => void onDeletePo()}
          onCancel={() => setConfirmPo(null)}
        />
      )}
      {confirmSupplier && (
        <ConfirmDialog
          title={`Delete ${confirmSupplier.name}?`}
          message="The supplier will be removed. Past purchase orders stay, but lose their link to this supplier."
          confirmLabel="Delete"
          icon="trash"
          danger
          onConfirm={() => void onDeleteSupplier()}
          onCancel={() => setConfirmSupplier(null)}
        />
      )}
    </div>
  );
}

function OrdersTable({
  orders,
  onOpen,
  onAskDelete,
  onNew,
}: {
  orders: PurchaseOrderSummary[];
  onOpen: (id: string) => void;
  onAskDelete: (po: PurchaseOrderSummary) => void;
  onNew: () => void;
}) {
  if (orders.length === 0) {
    return (
      <EmptyState
        icon="cart"
        title="No purchase orders yet"
        body="Raise a PO to order stock from a supplier. When it arrives, receiving it restocks your inventory automatically."
        cta="Create your first PO"
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
              <th className="px-5 py-2.5 font-semibold">PO #</th>
              <th className="px-3 py-2.5 font-semibold">Supplier</th>
              <th className="px-3 py-2.5 font-semibold">Ordered</th>
              <th className="px-3 py-2.5 font-semibold text-center">Items</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 font-semibold text-right">Total</th>
              <th className="px-5 py-2.5 font-semibold text-right">·</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((po) => {
              const s = STATUS_STYLE[po.status] ?? STATUS_STYLE.draft;
              return (
                <tr
                  key={po.id}
                  onClick={() => onOpen(po.id)}
                  className="border-b border-ink/5 last:border-0 hover:bg-paper/40 transition cursor-pointer"
                >
                  <td className="px-5 py-3 font-bold tabular-nums">{po.reference}</td>
                  <td className="px-3 py-3">{po.supplierName ?? <span className="text-ink-faint">—</span>}</td>
                  <td className="px-3 py-3 text-ink-soft tabular-nums whitespace-nowrap">{formatDate(po.orderDate)}</td>
                  <td className="px-3 py-3 text-center tabular-nums">{po.itemCount}</td>
                  <td className="px-3 py-3">
                    <span className={"inline-block text-[11px] font-bold rounded-full px-2.5 py-0.5 " + s.chip}>{s.label}</span>
                  </td>
                  <td className="px-3 py-3 text-right font-bold tracking-tight tabular-nums whitespace-nowrap">{formatCents(po.totalCents)}</td>
                  <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <RowAction icon="eye" label="View" onClick={() => onOpen(po.id)} />
                      {po.status !== "received" && (
                        <RowAction icon="trash" label="Delete" danger onClick={() => onAskDelete(po)} />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SuppliersTable({
  suppliers,
  onEdit,
  onAskDelete,
  onNew,
}: {
  suppliers: Supplier[];
  onEdit: (s: Supplier) => void;
  onAskDelete: (s: Supplier) => void;
  onNew: () => void;
}) {
  if (suppliers.length === 0) {
    return (
      <EmptyState
        icon="truck"
        title="No suppliers yet"
        body="Add the vendors you buy stock from. You'll pick them when raising a purchase order."
        cta="Add your first supplier"
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
              <th className="px-5 py-2.5 font-semibold">Supplier</th>
              <th className="px-3 py-2.5 font-semibold">Contact</th>
              <th className="px-3 py-2.5 font-semibold">Phone</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-5 py-2.5 font-semibold text-right">·</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id} className="border-b border-ink/5 last:border-0 hover:bg-paper/40 transition">
                <td className="px-5 py-3">
                  <span className="font-semibold">{s.name}</span>
                  {s.email && <span className="block text-[12px] text-ink-faint">{s.email}</span>}
                </td>
                <td className="px-3 py-3 text-ink-soft">{s.contactName ?? "—"}</td>
                <td className="px-3 py-3 text-ink-soft tabular-nums">{s.phone ?? "—"}</td>
                <td className="px-3 py-3">
                  <span
                    className={
                      "inline-block text-[11px] font-bold rounded-full px-2.5 py-0.5 " +
                      (s.isActive ? "bg-accent-50 text-accent-600" : "bg-paper hairline text-ink-faint")
                    }
                  >
                    {s.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <RowAction icon="pencil" label="Edit" onClick={() => onEdit(s)} />
                    <RowAction icon="trash" label="Delete" danger onClick={() => onAskDelete(s)} />
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

function EmptyState({
  icon,
  title,
  body,
  cta,
  onCta,
}: {
  icon: IconName;
  title: string;
  body: string;
  cta: string;
  onCta: () => void;
}) {
  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card px-5 py-14 text-center">
      <span className="inline-grid place-items-center w-12 h-12 rounded-[14px] bg-brand-50 text-brand-600">
        <Icon name={icon} className="w-6 h-6" strokeWidth={1.6} />
      </span>
      <p className="mt-3 text-[14px] font-semibold">{title}</p>
      <p className="mt-1 text-[13px] text-ink-soft max-w-[42ch] mx-auto">{body}</p>
      <button
        type="button"
        onClick={onCta}
        className="mt-4 inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[13.5px] px-4 py-2.5 rounded-[10px] shadow-btn transition duration-150"
      >
        <Icon name="plus" className="w-4 h-4" strokeWidth={2} />
        {cta}
      </button>
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
        (danger ? "text-ink-faint hover:bg-rose-50 hover:text-rose-600" : "text-ink-faint hover:bg-brand-50 hover:text-brand-600")
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
  tone,
}: {
  icon: IconName;
  label: string;
  value: string;
  tone?: "good";
}) {
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
