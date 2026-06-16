"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { useToast } from "../Toast";
import { formatPesoExact } from "@/lib/format";
import { listProducts, type Product } from "@/lib/inventory";
import { createPurchaseOrder, type PoCreateFields, type Supplier } from "@/lib/procurement";

/**
 * Raise a purchase order. Each line can be tied to a catalogue product (so
 * receiving the PO restocks it) or kept as a free-text/non-catalogue buy. The
 * order total is shown live but recomputed authoritatively server-side.
 */
function today(): string {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

interface LineDraft {
  key: number;
  productId: string;
  name: string;
  qty: string;
  unitCost: string;
}

let lineKey = 1;
function blankLine(): LineDraft {
  return { key: lineKey++, productId: "", name: "", qty: "1", unitCost: "" };
}

/** Optional seed for a one-click "Quick Draft PO" (supplier + a single line). */
export interface PoFormSeed {
  supplierId?: string;
  status?: "draft" | "ordered";
  line?: { productId: string; name: string; qty: number; unitCost: string };
}

export function PoFormModal({
  suppliers,
  initial,
  onClose,
  onSaved,
}: {
  suppliers: Supplier[];
  initial?: PoFormSeed;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { push } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [supplierId, setSupplierId] = useState(initial?.supplierId ?? "");
  const [status, setStatus] = useState<"draft" | "ordered">(initial?.status ?? "ordered");
  const [orderDate, setOrderDate] = useState(today());
  const [expectedDate, setExpectedDate] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<LineDraft[]>(() =>
    initial?.line
      ? [
          {
            key: lineKey++,
            productId: initial.line.productId,
            name: initial.line.name,
            qty: String(initial.line.qty),
            unitCost: initial.line.unitCost,
          },
        ]
      : [blankLine()],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await listProducts();
      if (alive && res.ok) setProducts(res.products);
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

  function patchLine(key: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    setError(null);
  }

  function onPickProduct(key: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    patchLine(key, { productId, ...(product ? { name: product.name } : {}) });
  }

  const totalCents = lines.reduce((sum, l) => {
    const qty = Number(l.qty) || 0;
    const cost = Number(l.unitCost.replace(/[₱,\s]/g, "")) || 0;
    return sum + Math.round(cost * 100) * qty;
  }, 0);

  async function submit() {
    const cleaned = lines
      .map((l) => ({
        productId: l.productId,
        name: l.name.trim(),
        qty: Number(l.qty),
        unitCost: l.unitCost.trim(),
      }))
      .filter((l) => l.name || l.productId);

    if (cleaned.length === 0) return setError("Add at least one item to the order.");
    for (const l of cleaned) {
      if (!l.name) return setError("Every line needs an item name.");
      if (!Number.isInteger(l.qty) || l.qty <= 0) return setError(`Enter a quantity for "${l.name}".`);
      const cost = Number(l.unitCost.replace(/[₱,\s]/g, ""));
      if (!Number.isFinite(cost) || cost < 0) return setError(`Enter a unit cost for "${l.name}".`);
    }

    setBusy(true);
    setError(null);
    const fields: PoCreateFields = {
      supplierId,
      status,
      orderDate,
      expectedDate,
      note,
      items: cleaned,
    };
    const res = await createPurchaseOrder(fields);
    if (res.ok) {
      push({ variant: "success", title: `Purchase order ${res.po.reference} created` });
      onSaved();
      return;
    }
    setBusy(false);
    setError(res.error ?? (res.errors ? Object.values(res.errors)[0] : "Could not create the order."));
  }

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center px-5" role="dialog" aria-modal="true" aria-label="New purchase order">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/45 backdrop-blur-sm" />
      <div className="relative w-full max-w-[620px] rounded-xl2 bg-surface hairline shadow-soft p-6 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center w-10 h-10 rounded-[11px] bg-brand-50 text-brand-600 shrink-0">
              <Icon name="cart" className="w-5 h-5" strokeWidth={1.8} />
            </span>
            <div>
              <h3 className="text-[1.1rem] font-extrabold tracking-tight">New purchase order</h3>
              <p className="text-[12.5px] text-ink-soft">Order stock from a supplier. Receiving it restocks inventory.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-ink-faint hover:text-ink transition -mt-1 -mr-1 p-1">
            <Icon name="x" className="w-5 h-5" strokeWidth={1.8} />
          </button>
        </div>

        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[12px] font-semibold text-ink-soft">Supplier</span>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="field-input w-full rounded-[10px] px-3 py-2.5 text-[14px] mt-1.5"
              >
                <option value="">— No supplier —</option>
                {suppliers
                  .filter((s) => s.isActive || s.id === supplierId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold text-ink-soft">Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as "draft" | "ordered")}
                className="field-input w-full rounded-[10px] px-3 py-2.5 text-[14px] mt-1.5"
              >
                <option value="ordered">Ordered</option>
                <option value="draft">Draft</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold text-ink-soft">Order date</span>
              <input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="field-input w-full rounded-[10px] px-3 py-2.5 text-[14px] mt-1.5"
              />
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold text-ink-soft">Expected (optional)</span>
              <input
                type="date"
                value={expectedDate}
                min={orderDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                className="field-input w-full rounded-[10px] px-3 py-2.5 text-[14px] mt-1.5"
              />
            </label>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-semibold text-ink-soft">Items</span>
              <span className="text-[12px] text-ink-faint">{lines.length} line{lines.length === 1 ? "" : "s"}</span>
            </div>
            <div className="space-y-2">
              {lines.map((l) => (
                <div key={l.key} className="rounded-[12px] bg-paper hairline p-3">
                  <div className="flex items-center gap-2">
                    <select
                      value={l.productId}
                      onChange={(e) => onPickProduct(l.key, e.target.value)}
                      className="field-input rounded-[9px] px-2.5 py-2 text-[13px] flex-1 min-w-0"
                    >
                      <option value="">Custom item…</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.stock} in stock)
                        </option>
                      ))}
                    </select>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                        aria-label="Remove line"
                        className="grid place-items-center w-8 h-8 rounded-[8px] text-ink-faint hover:bg-rose-50 hover:text-rose-600 transition shrink-0"
                      >
                        <Icon name="trash" className="w-[16px] h-[16px]" strokeWidth={1.7} />
                      </button>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-[1fr_72px_110px] gap-2">
                    <input
                      value={l.name}
                      onChange={(e) => patchLine(l.key, { name: e.target.value })}
                      placeholder="Item name"
                      className="field-input rounded-[9px] px-2.5 py-2 text-[13px] min-w-0"
                    />
                    <input
                      inputMode="numeric"
                      value={l.qty}
                      onChange={(e) => patchLine(l.key, { qty: e.target.value.replace(/[^\d]/g, "") })}
                      placeholder="Qty"
                      className="field-input rounded-[9px] px-2.5 py-2 text-[13px] text-center tabular-nums"
                    />
                    <input
                      inputMode="decimal"
                      value={l.unitCost}
                      onChange={(e) => patchLine(l.key, { unitCost: e.target.value })}
                      placeholder="₱ unit cost"
                      className="field-input rounded-[9px] px-2.5 py-2 text-[13px] text-right tabular-nums"
                    />
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setLines((prev) => [...prev, blankLine()])}
              className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-600 hover:text-brand-700 transition"
            >
              <Icon name="plus" className="w-4 h-4" strokeWidth={2} />
              Add line
            </button>
          </div>

          <label className="block">
            <span className="text-[12px] font-semibold text-ink-soft">Note (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Delivery instructions, PO terms…"
              className="field-input w-full rounded-[10px] px-3 py-2.5 text-[14px] mt-1.5 resize-none"
            />
          </label>

          {error && <p className="text-[12.5px] font-semibold text-rose-600">{error}</p>}

          <div className="flex items-center justify-between gap-3 pt-1 hairline-t">
            <div className="pt-3">
              <div className="text-[12px] text-ink-soft">Order total</div>
              <div className="text-[1.3rem] font-extrabold tracking-tightest tabular-nums">{formatPesoExact(totalCents / 100)}</div>
            </div>
            <div className="flex items-center gap-3 pt-3">
              <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-[10px] text-[14px] font-semibold text-ink-soft hover:bg-paper transition duration-150">
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[14px] px-5 py-2.5 rounded-[10px] shadow-btn tracking-tight transition duration-150 disabled:opacity-60"
              >
                {busy ? "Creating…" : "Create order"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
