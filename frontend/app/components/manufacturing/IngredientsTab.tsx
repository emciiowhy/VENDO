"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { useToast } from "../Toast";
import { ConfirmDialog } from "../ConfirmDialog";
import {
  INGREDIENT_UNITS,
  UNIT_LABEL,
  createIngredient,
  deleteIngredient,
  formatAmount,
  restockIngredient,
  updateIngredient,
  type Ingredient,
} from "@/lib/manufacturing";

/**
 * The Manufacturing "Ingredients" tab — raw materials (flour, sugar, yeast…)
 * with their own stock in a measuring unit, kept out of Inventory so the
 * catalogue only lists what's sold. Producing a recipe draws these down;
 * "Restock" adds a delivery on top of what's on hand.
 */
export function IngredientsTab({
  ingredients,
  onChanged,
}: {
  ingredients: Ingredient[];
  onChanged: () => void;
}) {
  const { push } = useToast();
  const [form, setForm] = useState<{ ingredient: Ingredient | null } | null>(null);
  const [restocking, setRestocking] = useState<Ingredient | null>(null);
  const [confirm, setConfirm] = useState<Ingredient | null>(null);

  async function onDelete() {
    if (!confirm) return;
    const target = confirm;
    setConfirm(null);
    const res = await deleteIngredient(target.id);
    if (res.ok) {
      push({ variant: "success", title: "Ingredient deleted" });
      onChanged();
    } else {
      push({ variant: "danger", title: "Couldn't delete", message: res.error });
    }
  }

  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h3 className="font-extrabold tracking-tight">Ingredients</h3>
          <p className="text-[12.5px] text-ink-soft">Raw materials for your recipes. They don&apos;t show in Inventory.</p>
        </div>
        <button
          type="button"
          onClick={() => setForm({ ingredient: null })}
          className="inline-flex items-center gap-1.5 rounded-[10px] hairline bg-surface px-3.5 py-2 text-[13px] font-semibold hover:text-brand-600 hover:border-brand-200 transition"
        >
          <Icon name="plus" className="w-4 h-4" strokeWidth={2} />
          Add ingredient
        </button>
      </div>

      {ingredients.length === 0 ? (
        <div className="px-5 py-12 text-center border-t border-ink/8">
          <span className="inline-grid place-items-center w-12 h-12 rounded-[14px] bg-brand-50 text-brand-600">
            <Icon name="box" className="w-6 h-6" strokeWidth={1.6} />
          </span>
          <p className="mt-3 text-[14px] font-semibold">No ingredients yet</p>
          <p className="mt-1 text-[13px] text-ink-soft max-w-[44ch] mx-auto">
            Add what you have on hand — e.g. 25 kg of flour — and producing a recipe will use it up automatically.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border-t border-ink/8">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="text-left text-[12px] font-semibold text-ink-faint border-b border-ink/8 bg-paper/40">
                <th className="px-5 py-2.5 font-semibold">Ingredient</th>
                <th className="px-3 py-2.5 font-semibold text-right">On hand</th>
                <th className="px-3 py-2.5 font-semibold">Unit</th>
                <th className="px-3 py-2.5 font-semibold text-center">Used in</th>
                <th className="px-5 py-2.5 font-semibold text-right">·</th>
              </tr>
            </thead>
            <tbody>
              {ingredients.map((i) => (
                <tr key={i.id} className="border-b border-ink/5 last:border-0 hover:bg-paper/40 transition">
                  <td className="px-5 py-3">
                    <span className="font-semibold">{i.name}</span>
                    {i.lowStock && (
                      <span className="ml-2 inline-block text-[10.5px] font-bold rounded-full px-2 py-0.5 bg-amber-50 text-amber-600">
                        Low
                      </span>
                    )}
                  </td>
                  <td className={"px-3 py-3 text-right font-bold tabular-nums " + (i.lowStock ? "text-amber-600" : "")}>
                    {formatAmount(i.stock)}
                  </td>
                  <td className="px-3 py-3 text-ink-soft">{UNIT_LABEL[i.unit] ?? i.unit}</td>
                  <td className="px-3 py-3 text-center text-ink-soft tabular-nums">
                    {i.recipeCount} recipe{i.recipeCount === 1 ? "" : "s"}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setRestocking(i)}
                        className="inline-flex items-center gap-1 rounded-[8px] px-2.5 py-1.5 text-[12.5px] font-semibold text-accent-600 hover:bg-accent-50 transition"
                      >
                        <Icon name="plus" className="w-3.5 h-3.5" strokeWidth={2} />
                        Restock
                      </button>
                      <IconButton icon="pencil" label="Edit" onClick={() => setForm({ ingredient: i })} />
                      <IconButton icon="trash" label="Delete" danger onClick={() => setConfirm(i)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <IngredientFormModal
          ingredient={form.ingredient}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            onChanged();
          }}
        />
      )}
      {restocking && (
        <RestockModal
          ingredient={restocking}
          onClose={() => setRestocking(null)}
          onSaved={() => {
            setRestocking(null);
            onChanged();
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title="Delete this ingredient?"
          message={
            confirm.recipeCount > 0
              ? `${confirm.name} is used in ${confirm.recipeCount} recipe${confirm.recipeCount === 1 ? "" : "s"}. Those recipes can't be produced until you pick a replacement.`
              : `${confirm.name} and its stock will be removed.`
          }
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

function IconButton({
  icon,
  label,
  danger,
  onClick,
}: {
  icon: "pencil" | "trash";
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
        "grid place-items-center w-8 h-8 rounded-[8px] text-ink-faint transition " +
        (danger ? "hover:bg-rose-50 hover:text-rose-600" : "hover:bg-brand-50 hover:text-brand-600")
      }
    >
      <Icon name={icon} className="w-[16px] h-[16px]" strokeWidth={1.7} />
    </button>
  );
}

/** Accept "1,500", "7.5" — digits, one dot, commas stripped. */
function cleanAmount(v: string): string {
  const s = v.replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  return dot === -1 ? s : s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "");
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}

function Modal({
  label,
  title,
  subtitle,
  onClose,
  children,
}: {
  label: string;
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center px-5" role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/45 backdrop-blur-sm overlay-backdrop" />
      <div className="relative w-full max-w-[420px] rounded-xl2 bg-surface hairline shadow-soft p-6 max-h-[92vh] overflow-y-auto overlay-card">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center w-10 h-10 rounded-[11px] bg-brand-50 text-brand-600 shrink-0">
              <Icon name="box" className="w-5 h-5" strokeWidth={1.8} />
            </span>
            <div>
              <h3 className="text-[1.1rem] font-extrabold tracking-tight">{title}</h3>
              <p className="text-[12.5px] text-ink-soft">{subtitle}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-ink-faint hover:text-ink transition -mt-1 -mr-1 p-1">
            <Icon name="x" className="w-5 h-5" strokeWidth={1.8} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Actions({ busy, label, onClose }: { busy: boolean; label: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-end gap-3 pt-1">
      <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-[10px] text-[14px] font-semibold text-ink-soft hover:bg-paper transition duration-150">
        Cancel
      </button>
      <button
        type="submit"
        disabled={busy}
        className="bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[14px] px-5 py-2.5 rounded-[10px] shadow-btn tracking-tight transition duration-150 disabled:opacity-60"
      >
        {busy ? "Saving…" : label}
      </button>
    </div>
  );
}

function IngredientFormModal({
  ingredient,
  onClose,
  onSaved,
}: {
  ingredient: Ingredient | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { push } = useToast();
  const editing = ingredient !== null;
  const [name, setName] = useState(() => ingredient?.name ?? "");
  const [unit, setUnit] = useState(() => ingredient?.unit ?? "g");
  const [stock, setStock] = useState(() => (ingredient ? String(ingredient.stock) : ""));
  const [low, setLow] = useState(() => (ingredient && ingredient.lowStockThreshold > 0 ? String(ingredient.lowStockThreshold) : ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEscape(onClose);

  async function submit() {
    if (!name.trim()) return setError("Name the ingredient.");
    setBusy(true);
    setError(null);
    const fields = { name: name.trim(), unit, stock: stock || "0", lowStockThreshold: low || "0" };
    const res = editing ? await updateIngredient(ingredient.id, fields) : await createIngredient(fields);
    if (res.ok) {
      push({ variant: "success", title: editing ? "Ingredient updated" : "Ingredient added" });
      onSaved();
      return;
    }
    setBusy(false);
    setError(res.error ?? (res.errors ? Object.values(res.errors)[0] : "Could not save the ingredient."));
  }

  return (
    <Modal
      label={editing ? "Edit ingredient" : "Add ingredient"}
      title={editing ? "Edit ingredient" : "Add an ingredient"}
      subtitle="A raw material your recipes use."
      onClose={onClose}
    >
      <form
        className="mt-5 space-y-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="block">
          <span className="text-[12px] font-semibold text-ink-soft">Name</span>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            autoFocus
            maxLength={120}
            placeholder="e.g. All-purpose flour"
            className="field-input w-full rounded-[10px] px-3 py-2.5 text-[14px] mt-1.5"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[12px] font-semibold text-ink-soft">On hand</span>
            <input
              inputMode="decimal"
              value={stock}
              onChange={(e) => setStock(cleanAmount(e.target.value))}
              placeholder="0"
              className="field-input w-full rounded-[10px] px-3 py-2.5 text-[14px] mt-1.5 tabular-nums"
            />
          </label>
          <label className="block">
            <span className="text-[12px] font-semibold text-ink-soft">Unit</span>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="field-input w-full rounded-[10px] px-3 py-2.5 text-[14px] mt-1.5"
            >
              {INGREDIENT_UNITS.map((u) => (
                <option key={u} value={u}>
                  {UNIT_LABEL[u]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="text-[12px] font-semibold text-ink-soft">Warn me when it drops to (optional)</span>
          <input
            inputMode="decimal"
            value={low}
            onChange={(e) => setLow(cleanAmount(e.target.value))}
            placeholder={`e.g. 1000 ${unit}`}
            className="field-input w-full rounded-[10px] px-3 py-2.5 text-[14px] mt-1.5 tabular-nums"
          />
        </label>
        {editing && ingredient.recipeCount > 0 && unit !== ingredient.unit && (
          <p className="text-[12px] text-amber-600 font-semibold">
            Recipes using this ingredient keep their numbers — check their quantities still make sense in {UNIT_LABEL[unit]}.
          </p>
        )}
        {error && <p className="text-[12.5px] font-semibold text-rose-600">{error}</p>}
        <Actions busy={busy} label={editing ? "Save changes" : "Add ingredient"} onClose={onClose} />
      </form>
    </Modal>
  );
}

function RestockModal({
  ingredient,
  onClose,
  onSaved,
}: {
  ingredient: Ingredient;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { push } = useToast();
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEscape(onClose);

  const add = Number(qty) || 0;

  async function submit() {
    if (add <= 0) return setError("Enter how much you're adding.");
    setBusy(true);
    setError(null);
    const res = await restockIngredient(ingredient.id, qty);
    if (res.ok) {
      push({
        variant: "success",
        title: `${ingredient.name} restocked`,
        message: `Now ${formatAmount(res.ingredient.stock)} ${ingredient.unit} on hand.`,
      });
      onSaved();
      return;
    }
    setBusy(false);
    setError(res.error ?? (res.errors ? Object.values(res.errors)[0] : "Could not restock."));
  }

  return (
    <Modal label="Restock ingredient" title={`Restock ${ingredient.name}`} subtitle="Add a delivery or market run." onClose={onClose}>
      <form
        className="mt-5 space-y-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="block">
          <span className="text-[12px] font-semibold text-ink-soft">Amount to add ({UNIT_LABEL[ingredient.unit] ?? ingredient.unit})</span>
          <input
            inputMode="decimal"
            value={qty}
            onChange={(e) => {
              setQty(cleanAmount(e.target.value));
              setError(null);
            }}
            autoFocus
            placeholder="0"
            className="field-input w-full rounded-[10px] px-3 py-2.5 text-[14px] mt-1.5 tabular-nums"
          />
        </label>
        <div className="flex items-center justify-between rounded-[10px] bg-paper hairline px-4 py-2.5 text-[13px]">
          <span className="font-semibold text-ink-soft">After restock</span>
          <span className="font-bold tabular-nums">
            {formatAmount(Math.round((ingredient.stock + add) * 1000) / 1000)} {ingredient.unit}
          </span>
        </div>
        {error && <p className="text-[12.5px] font-semibold text-rose-600">{error}</p>}
        <Actions busy={busy} label="Add to stock" onClose={onClose} />
      </form>
    </Modal>
  );
}
