"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { useToast } from "../Toast";
import { formatAmount, produce, type Recipe } from "@/lib/manufacturing";

/**
 * Produce N batches of a recipe. Shows exactly what ingredients will be used and
 * what will be made at the chosen batch count, flagging any ingredient that
 * would fall short before the request is sent (the server re-checks under row
 * locks). Ingredient stock lives in Manufacturing; the finished good lands in
 * Inventory.
 */

/** Rounded to 3 decimals so 7.5 g × 3 reads 22.5, not 22.499999. */
function times(qty: number, n: number): number {
  return Math.round(qty * n * 1000) / 1000;
}
export function ProduceModal({
  recipe,
  onClose,
  onProduced,
}: {
  recipe: Recipe;
  onClose: () => void;
  onProduced: () => void;
}) {
  const { push } = useToast();
  const [batches, setBatches] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const n = Number(batches) || 0;
  const shortNames = recipe.components
    .filter((c) => !c.available || c.stock < times(c.qty, n))
    .map((c) => c.name);
  const canProduce = n >= 1 && shortNames.length === 0;

  async function submit() {
    if (n < 1) return setError("Enter how many batches to produce.");
    setBusy(true);
    setError(null);
    const res = await produce(recipe.id, n);
    if (res.ok) {
      push({
        variant: "success",
        title: `Produced ${res.run.outputQty} × ${recipe.productName}`,
        message: `${res.run.reference} · ingredients used, Inventory restocked.`,
      });
      onProduced();
      return;
    }
    setBusy(false);
    setError(res.error ?? "Could not produce this recipe.");
  }

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center px-5" role="dialog" aria-modal="true" aria-label="Produce">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/45 backdrop-blur-sm overlay-backdrop" />
      <div className="relative w-full max-w-[440px] rounded-xl2 bg-surface hairline shadow-soft p-6 max-h-[92vh] overflow-y-auto overlay-card">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center w-10 h-10 rounded-[11px] bg-accent-50 text-accent-600 shrink-0">
              <Icon name="factory" className="w-5 h-5" strokeWidth={1.8} />
            </span>
            <div>
              <h3 className="text-[1.1rem] font-extrabold tracking-tight">Produce {recipe.productName}</h3>
              <p className="text-[12.5px] text-ink-soft">{recipe.outputQty} unit{recipe.outputQty === 1 ? "" : "s"} per batch · up to {recipe.maxBatches} buildable now</p>
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
          <label className="block">
            <span className="text-[12px] font-semibold text-ink-soft">Batches</span>
            <input
              inputMode="numeric"
              value={batches}
              onChange={(e) => {
                setBatches(e.target.value.replace(/[^\d]/g, ""));
                setError(null);
              }}
              className="field-input w-full rounded-[10px] px-3 py-2.5 text-[14px] mt-1.5 tabular-nums"
            />
          </label>

          {/* Consumption preview */}
          <div className="rounded-[12px] bg-paper hairline p-3">
            <div className="text-[12px] font-semibold text-ink-soft mb-2">Will use</div>
            <div className="space-y-1.5">
              {recipe.components.map((c) => {
                const need = times(c.qty, n);
                const short = !c.available || c.stock < need;
                return (
                  <div key={c.id} className="flex items-center justify-between text-[13px]">
                    <span className="truncate pr-2">{c.name}</span>
                    <span className={"tabular-nums font-semibold whitespace-nowrap " + (short ? "text-rose-600" : "text-ink-soft")}>
                      {formatAmount(need)} {c.unit}{" "}
                      <span className="text-ink-faint font-normal">
                        / {c.available ? formatAmount(c.stock) : 0} {c.unit} on hand
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="hairline-t mt-2.5 pt-2.5 flex items-center justify-between text-[13px]">
              <span className="font-semibold">Will make</span>
              <span className="font-extrabold tabular-nums text-accent-600">
                +{recipe.outputQty * n} {recipe.productName}
              </span>
            </div>
          </div>

          {!canProduce && shortNames.length > 0 && (
            <p className="text-[12.5px] font-semibold text-rose-600">
              Not enough for {n} batch{n === 1 ? "" : "es"}: {shortNames.join(", ")}. Restock it under the
              Ingredients tab.
            </p>
          )}
          {error && <p className="text-[12.5px] font-semibold text-rose-600">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-[10px] text-[14px] font-semibold text-ink-soft hover:bg-paper transition duration-150">
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !canProduce}
              className="bg-accent-500 hover:bg-accent-600 text-white font-semibold text-[14px] px-5 py-2.5 rounded-[10px] shadow-btn tracking-tight transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? "Producing…" : "Produce"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
