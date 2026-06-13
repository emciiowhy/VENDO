"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { useToast } from "../Toast";
import { formatCents } from "@/lib/format";
import {
  createPurchaseOrder,
  getReorderSuggestions,
  type PoCreateFields,
  type ReorderSuggestion,
} from "@/lib/procurement";

/**
 * Low-stock → draft PO. Lists every active product at or below its reorder floor
 * with a suggested quantity (and its last known cost), lets the owner tick which
 * to include and tweak quantities, then rolls the selection into ONE draft
 * purchase order they can assign a supplier to and send. Purely additive: it
 * reuses the existing PO-create path; nothing about receiving/stock changes.
 *
 * setState only runs after `await` in the effect (alive-guarded); the row edits
 * and submit are event handlers, so the set-state-in-effect rule holds.
 */
function today(): string {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

interface Row {
  suggestion: ReorderSuggestion;
  selected: boolean;
  qty: string;
}

export function ReorderModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { push } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getReorderSuggestions();
      if (!alive) return;
      if (res.ok) {
        setRows(
          res.suggestions.map((s) => ({ suggestion: s, selected: true, qty: String(s.suggestedQty) })),
        );
        setError(null);
      } else {
        setError(res.error ?? "Could not load reorder suggestions.");
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function patch(productId: string, p: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.suggestion.productId === productId ? { ...r, ...p } : r)));
  }

  const chosen = rows.filter((r) => r.selected && (Number(r.qty) || 0) > 0);
  const estTotalCents = chosen.reduce(
    (s, r) => s + r.suggestion.lastUnitCostCents * (Number(r.qty) || 0),
    0,
  );

  async function submit() {
    if (chosen.length === 0) {
      setError("Select at least one item to reorder.");
      return;
    }
    setBusy(true);
    setError(null);
    const fields: PoCreateFields = {
      supplierId: "",
      status: "draft",
      orderDate: today(),
      expectedDate: "",
      note: "Drafted from low-stock reorder suggestions.",
      items: chosen.map((r) => ({
        productId: r.suggestion.productId,
        name: r.suggestion.name,
        qty: Number(r.qty),
        unitCost: (r.suggestion.lastUnitCostCents / 100).toFixed(2),
      })),
    };
    const res = await createPurchaseOrder(fields);
    if (res.ok) {
      push({
        variant: "success",
        title: `Draft ${res.po.reference} created`,
        message: "Assign a supplier and send it to order stock.",
      });
      onCreated();
      return;
    }
    setBusy(false);
    setError(res.error ?? (res.errors ? Object.values(res.errors)[0] : "Could not create the draft order."));
  }

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center px-5" role="dialog" aria-modal="true" aria-label="Reorder low stock">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/45 backdrop-blur-sm" />
      <div className="relative w-full max-w-[640px] rounded-xl2 bg-surface hairline shadow-soft p-6 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center w-10 h-10 rounded-[11px] bg-brand-50 text-brand-600 shrink-0">
              <Icon name="cart" className="w-5 h-5" strokeWidth={1.8} />
            </span>
            <div>
              <h3 className="text-[1.1rem] font-extrabold tracking-tight">Reorder low stock</h3>
              <p className="text-[12.5px] text-ink-soft">
                Bundle the items below into one draft purchase order.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-ink-faint hover:text-ink transition -mt-1 -mr-1 p-1">
            <Icon name="x" className="w-5 h-5" strokeWidth={1.8} />
          </button>
        </div>

        <div className="mt-5">
          {loading ? (
            <p className="py-12 text-center text-[13.5px] text-ink-soft">Scanning your inventory…</p>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center">
              <span className="inline-grid place-items-center w-12 h-12 rounded-[14px] bg-accent-50 text-accent-600">
                <Icon name="box" className="w-6 h-6" strokeWidth={1.6} />
              </span>
              <p className="mt-3 text-[14px] font-semibold">Everything&apos;s well stocked</p>
              <p className="mt-1 text-[13px] text-ink-soft max-w-[40ch] mx-auto">
                No active products are at or below their low-stock threshold right now.
              </p>
            </div>
          ) : (
            <div className="rounded-xl2 hairline overflow-hidden">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[11.5px] font-semibold text-ink-faint bg-paper/50 hairline-b">
                    <th className="px-3 py-2.5 w-9"></th>
                    <th className="px-2 py-2.5 font-semibold">Product</th>
                    <th className="px-2 py-2.5 font-semibold text-center">On hand</th>
                    <th className="px-2 py-2.5 font-semibold text-center">Order qty</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Est. cost</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const s = r.suggestion;
                    const qty = Number(r.qty) || 0;
                    return (
                      <tr key={s.productId} className="hairline-b last:border-0">
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={r.selected}
                            onChange={(e) => patch(s.productId, { selected: e.target.checked })}
                            className="w-4 h-4 accent-brand-500"
                            aria-label={`Include ${s.name}`}
                          />
                        </td>
                        <td className="px-2 py-2.5">
                          <span className="font-semibold">{s.name}</span>
                          <span className="block text-[11.5px] text-ink-faint">
                            {s.sku ? `${s.sku} · ` : ""}
                            floor {s.threshold}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <span
                            className={
                              "inline-block tabular-nums font-bold " +
                              (s.stock === 0 ? "text-rose-600" : "text-amber-600")
                            }
                          >
                            {s.stock}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <input
                            type="number"
                            min={1}
                            value={r.qty}
                            disabled={!r.selected}
                            onChange={(e) => patch(s.productId, { qty: e.target.value })}
                            className="field-input w-[68px] rounded-[8px] px-2 py-1.5 text-[13px] text-center disabled:opacity-40"
                          />
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-ink-soft">
                          {s.lastUnitCostCents > 0 ? formatCents(s.lastUnitCostCents * qty) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {error && <p className="mt-3 text-[13px] font-semibold text-rose-600">{error}</p>}

        {rows.length > 0 && (
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-[13px] text-ink-soft">
              <span className="font-bold text-ink tabular-nums">{chosen.length}</span> item
              {chosen.length === 1 ? "" : "s"} ·{" "}
              <span className="font-bold text-ink tabular-nums">{formatCents(estTotalCents)}</span> est.
              <span className="block text-[11.5px] text-ink-faint">
                Items never purchased before have no known cost — set it on the draft.
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-[10px] bg-paper hairline text-ink-soft font-semibold text-[14px] hover:text-ink transition duration-150"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy || chosen.length === 0}
                className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[14px] px-5 py-2.5 rounded-[10px] shadow-btn tracking-tight transition duration-150 disabled:opacity-50"
              >
                <Icon name="plus" className="w-[18px] h-[18px]" strokeWidth={2} />
                {busy ? "Creating…" : "Create draft PO"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
