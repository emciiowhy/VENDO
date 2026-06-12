"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { useToast } from "../Toast";
import { formatCents, formatDate } from "@/lib/format";
import {
  getPurchaseOrder,
  receivePurchaseOrder,
  setPurchaseOrderStatus,
  type PurchaseOrderDetail,
} from "@/lib/procurement";
import { STATUS_STYLE } from "./statusStyle";

/**
 * Right-side drawer showing a purchase order's lines and lifecycle actions.
 * Receiving restocks every catalogue-linked line (server-side, in one
 * transaction); a received PO becomes an immutable stock-in record.
 */
export function PoDetailDrawer({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { push } = useToast();
  const [po, setPo] = useState<PurchaseOrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getPurchaseOrder(id);
      if (!alive) return;
      if (res.ok) setPo(res.po);
      else setError(res.error ?? "Could not load the order.");
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function receive() {
    if (!po) return;
    setBusy(true);
    const restockCount = po.items.filter((i) => i.productId).length;
    const res = await receivePurchaseOrder(po.id);
    setBusy(false);
    if (res.ok) {
      setPo(res.po);
      push({
        variant: "success",
        title: `${po.reference} received`,
        message: restockCount > 0 ? `Restocked ${restockCount} catalogue item${restockCount === 1 ? "" : "s"}.` : "Marked as received.",
      });
      onChanged();
    } else {
      push({ variant: "danger", title: "Couldn't receive", message: res.error });
    }
  }

  async function cancel() {
    if (!po) return;
    setBusy(true);
    const res = await setPurchaseOrderStatus(po.id, "cancelled");
    setBusy(false);
    if (res.ok) {
      setPo(res.po);
      push({ variant: "info", title: `${po.reference} cancelled` });
      onChanged();
    } else {
      push({ variant: "danger", title: "Couldn't cancel", message: res.error });
    }
  }

  const open = po && (po.status === "draft" || po.status === "ordered");

  return (
    <div className="fixed inset-0 z-[120] flex justify-end" role="dialog" aria-modal="true" aria-label="Purchase order detail">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/45 backdrop-blur-sm" />
      <div className="relative w-full max-w-[480px] h-full bg-surface hairline shadow-soft overflow-y-auto">
        {!po ? (
          <div className="p-6">
            {error ? (
              <p className="text-[14px] font-semibold text-rose-600">{error}</p>
            ) : (
              <div className="space-y-3 animate-pulse">
                <div className="h-8 w-40 rounded-lg bg-paper" />
                <div className="h-24 rounded-xl2 bg-paper" />
                <div className="h-40 rounded-xl2 bg-paper" />
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="sticky top-0 bg-surface hairline-b px-6 py-4 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2.5">
                  <h3 className="text-[1.2rem] font-extrabold tracking-tight tabular-nums">{po.reference}</h3>
                  <StatusPill status={po.status} />
                </div>
                <p className="mt-0.5 text-[13px] text-ink-soft">
                  {po.supplierName ?? "No supplier"} · ordered {formatDate(po.orderDate)}
                </p>
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="text-ink-faint hover:text-ink transition p-1">
                <Icon name="x" className="w-5 h-5" strokeWidth={1.8} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-3 text-[13px]">
                <Meta label="Expected" value={po.expectedDate ? formatDate(po.expectedDate) : "—"} />
                <Meta label="Received" value={po.receivedAt ? formatDate(po.receivedAt) : "—"} />
              </div>

              <div className="rounded-xl2 hairline overflow-hidden">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left text-[11.5px] font-semibold text-ink-faint bg-paper/50">
                      <th className="px-3 py-2 font-semibold">Item</th>
                      <th className="px-2 py-2 font-semibold text-center">Qty</th>
                      <th className="px-2 py-2 font-semibold text-right">Unit</th>
                      <th className="px-3 py-2 font-semibold text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {po.items.map((it) => (
                      <tr key={it.id} className="border-t border-ink/5">
                        <td className="px-3 py-2.5">
                          <span className="font-semibold">{it.name}</span>
                          {!it.productId && <span className="block text-[11px] text-ink-faint">non-catalogue</span>}
                        </td>
                        <td className="px-2 py-2.5 text-center tabular-nums">{it.qty}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-ink-soft">{formatCents(it.unitCostCents)}</td>
                        <td className="px-3 py-2.5 text-right font-bold tabular-nums">{formatCents(it.lineTotalCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-ink/10 bg-paper/40">
                      <td className="px-3 py-2.5 font-bold" colSpan={3}>
                        Order total
                      </td>
                      <td className="px-3 py-2.5 text-right font-extrabold tracking-tight tabular-nums">
                        {formatCents(po.totalCents)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {po.note && (
                <div className="rounded-[10px] bg-paper hairline p-3 text-[13px] text-ink-soft">
                  <span className="font-semibold text-ink">Note:</span> {po.note}
                </div>
              )}

              {po.status === "received" && (
                <div className="rounded-[10px] bg-accent-50 p-3 flex items-start gap-2.5">
                  <Icon name="check" className="w-[18px] h-[18px] text-accent-600 shrink-0 mt-0.5" strokeWidth={2} />
                  <p className="text-[12.5px] text-accent-600 font-medium">
                    Received — catalogue stock was updated. This order is now a locked stock-in record.
                  </p>
                </div>
              )}

              {open && (
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => void receive()}
                    disabled={busy}
                    className="flex-1 inline-flex items-center justify-center gap-2 bg-accent-500 hover:bg-accent-600 text-white font-semibold text-[14px] py-3 rounded-[10px] shadow-btn transition duration-150 disabled:opacity-60"
                  >
                    <Icon name="box" className="w-[18px] h-[18px]" strokeWidth={1.8} />
                    {busy ? "Receiving…" : "Receive & restock"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void cancel()}
                    disabled={busy}
                    className="px-4 py-3 rounded-[10px] text-[14px] font-semibold text-ink-soft hairline hover:border-rose-200 hover:text-rose-600 transition duration-150 disabled:opacity-60"
                  >
                    Cancel PO
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.draft;
  return <span className={"text-[11px] font-bold rounded-full px-2.5 py-0.5 " + s.chip}>{s.label}</span>;
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] bg-paper hairline px-3 py-2.5">
      <div className="text-[11px] font-semibold text-ink-faint">{label}</div>
      <div className="mt-0.5 font-semibold tabular-nums">{value}</div>
    </div>
  );
}
