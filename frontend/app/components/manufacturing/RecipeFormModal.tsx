"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { useToast } from "../Toast";
import { listProducts, type Product } from "@/lib/inventory";
import { createRecipe, updateRecipe, type Recipe, type RecipeFields } from "@/lib/manufacturing";

/**
 * Add / edit a recipe (BOM): a finished catalogue product, how many units one
 * batch yields, and the component products consumed per batch. Components must
 * be catalogue products so producing can move their stock.
 */
interface CompDraft {
  key: number;
  productId: string;
  qty: string;
}

let compKey = 1;
function blankComp(): CompDraft {
  return { key: compKey++, productId: "", qty: "1" };
}

export function RecipeFormModal({
  recipe,
  onClose,
  onSaved,
}: {
  recipe: Recipe | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { push } = useToast();
  const editing = recipe !== null;

  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState(() => recipe?.productId ?? "");
  const [outputQty, setOutputQty] = useState(() => String(recipe?.outputQty ?? 1));
  const [note, setNote] = useState(() => recipe?.note ?? "");
  const [isActive, setIsActive] = useState(() => recipe?.isActive ?? true);
  const [comps, setComps] = useState<CompDraft[]>(() =>
    recipe && recipe.components.length
      ? recipe.components.map((c) => ({ key: compKey++, productId: c.productId ?? "", qty: String(c.qty) }))
      : [blankComp()],
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

  function patchComp(key: number, patch: Partial<CompDraft>) {
    setComps((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));
    setError(null);
  }

  async function submit() {
    if (!productId) return setError("Choose the finished product this recipe makes.");
    const out = Number(outputQty);
    if (!Number.isInteger(out) || out <= 0) return setError("Enter how many units one batch yields.");
    const cleaned = comps
      .filter((c) => c.productId)
      .map((c) => ({ productId: c.productId, qty: Number(c.qty) }));
    if (cleaned.length === 0) return setError("Add at least one component.");
    for (const c of cleaned) {
      if (!Number.isInteger(c.qty) || c.qty <= 0) return setError("Each component needs a quantity of 1 or more.");
    }
    if (new Set(cleaned.map((c) => c.productId)).size !== cleaned.length)
      return setError("A component is listed twice — combine the quantities.");

    setBusy(true);
    setError(null);
    const fields: RecipeFields = { productId, outputQty: out, note, isActive, components: cleaned };
    const res = editing ? await updateRecipe(recipe.id, fields) : await createRecipe(fields);
    if (res.ok) {
      push({ variant: "success", title: editing ? "Recipe updated" : "Recipe created" });
      onSaved();
      return;
    }
    setBusy(false);
    setError(res.error ?? (res.errors ? Object.values(res.errors)[0] : "Could not save the recipe."));
  }

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center px-5" role="dialog" aria-modal="true" aria-label={editing ? "Edit recipe" : "New recipe"}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/45 backdrop-blur-sm overlay-backdrop" />
      <div className="relative w-full max-w-[560px] rounded-xl2 bg-surface hairline shadow-soft p-6 max-h-[92vh] overflow-y-auto overlay-card">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center w-10 h-10 rounded-[11px] bg-brand-50 text-brand-600 shrink-0">
              <Icon name="factory" className="w-5 h-5" strokeWidth={1.8} />
            </span>
            <div>
              <h3 className="text-[1.1rem] font-extrabold tracking-tight">{editing ? "Edit recipe" : "New recipe"}</h3>
              <p className="text-[12.5px] text-ink-soft">What it makes, and what it consumes per batch.</p>
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
          <div className="grid sm:grid-cols-[1fr_140px] gap-3">
            <label className="block">
              <span className="text-[12px] font-semibold text-ink-soft">Finished product</span>
              <select
                value={productId}
                onChange={(e) => {
                  setProductId(e.target.value);
                  setError(null);
                }}
                className="field-input w-full rounded-[10px] px-3 py-2.5 text-[14px] mt-1.5"
              >
                <option value="">Choose a product…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold text-ink-soft">Yields / batch</span>
              <input
                inputMode="numeric"
                value={outputQty}
                onChange={(e) => setOutputQty(e.target.value.replace(/[^\d]/g, ""))}
                className="field-input w-full rounded-[10px] px-3 py-2.5 text-[14px] mt-1.5 text-center tabular-nums"
              />
            </label>
          </div>

          {/* Components */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-semibold text-ink-soft">Consumes per batch</span>
              <span className="text-[12px] text-ink-faint">{comps.length} component{comps.length === 1 ? "" : "s"}</span>
            </div>
            <div className="space-y-2">
              {comps.map((c) => (
                <div key={c.key} className="flex items-center gap-2">
                  <select
                    value={c.productId}
                    onChange={(e) => patchComp(c.key, { productId: e.target.value })}
                    className="field-input rounded-[9px] px-2.5 py-2 text-[13px] flex-1 min-w-0"
                  >
                    <option value="">Choose a component…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.stock} in stock)
                      </option>
                    ))}
                  </select>
                  <input
                    inputMode="numeric"
                    value={c.qty}
                    onChange={(e) => patchComp(c.key, { qty: e.target.value.replace(/[^\d]/g, "") })}
                    placeholder="Qty"
                    className="field-input rounded-[9px] px-2.5 py-2 text-[13px] w-[72px] text-center tabular-nums"
                  />
                  {comps.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setComps((prev) => prev.filter((x) => x.key !== c.key))}
                      aria-label="Remove component"
                      className="grid place-items-center w-8 h-8 rounded-[8px] text-ink-faint hover:bg-rose-50 hover:text-rose-600 transition shrink-0"
                    >
                      <Icon name="trash" className="w-[16px] h-[16px]" strokeWidth={1.7} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setComps((prev) => [...prev, blankComp()])}
              className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-600 hover:text-brand-700 transition"
            >
              <Icon name="plus" className="w-4 h-4" strokeWidth={2} />
              Add component
            </button>
          </div>

          <label className="block">
            <span className="text-[12px] font-semibold text-ink-soft">Note (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Prep steps, yield notes…"
              className="field-input w-full rounded-[10px] px-3 py-2.5 text-[14px] mt-1.5 resize-none"
            />
          </label>

          {editing && (
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-4 h-4 accent-[var(--color-brand-500)]" />
              <span className="text-[13px] font-semibold">Active recipe</span>
            </label>
          )}

          {error && <p className="text-[12.5px] font-semibold text-rose-600">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-[10px] text-[14px] font-semibold text-ink-soft hover:bg-paper transition duration-150">
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[14px] px-5 py-2.5 rounded-[10px] shadow-btn tracking-tight transition duration-150 disabled:opacity-60"
            >
              {busy ? "Saving…" : editing ? "Save changes" : "Create recipe"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
