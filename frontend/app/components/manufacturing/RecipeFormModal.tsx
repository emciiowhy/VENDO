"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { useToast } from "../Toast";
import { createProduct, listProducts, type Product } from "@/lib/inventory";
import {
  INGREDIENT_UNITS,
  UNIT_LABEL,
  createIngredient,
  createRecipe,
  formatAmount,
  getAssistantStatus,
  listIngredients,
  updateRecipe,
  type ComponentDraft,
  type Ingredient,
  type Recipe,
  type RecipeFields,
} from "@/lib/manufacturing";
import { RecipeAssistantPanel, type AppliedSuggestion } from "./RecipeAssistantPanel";

/**
 * Add / edit a recipe: the finished Inventory product it makes, how many pieces
 * one batch yields, and the ingredients one batch uses (quantity + unit, like a
 * cookbook card). Ingredients are Manufacturing's own raw materials — they never
 * appear in Inventory. Both pickers can create a new entry inline, so an owner
 * can write a whole recipe from an empty store without leaving this form.
 *
 * A legacy line (an Inventory product used as a component, saved before
 * ingredients existed) is kept as-is and shown with an "Inventory item" tag;
 * the owner can remove it and pick an ingredient instead.
 */
interface LineDraft {
  key: number;
  ingredientId: string;
  /** Set only on a kept legacy line. */
  legacyProductId: string | null;
  legacyName: string;
  qty: string;
}

let lineKey = 1;
function blankLine(): LineDraft {
  return { key: lineKey++, ingredientId: "", legacyProductId: null, legacyName: "", qty: "" };
}

/** Sentinel <select> value that opens an inline "create new" form. */
const NEW_ITEM = "__new__";

/** Accept "1,500", "7.5" — digits, one dot, commas stripped. */
function cleanAmount(v: string): string {
  const s = v.replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  return dot === -1 ? s : s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "");
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
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [productId, setProductId] = useState(() => recipe?.productId ?? "");
  const [outputQty, setOutputQty] = useState(() => String(recipe?.outputQty ?? 1));
  const [note, setNote] = useState(() => recipe?.note ?? "");
  const [isActive, setIsActive] = useState(() => recipe?.isActive ?? true);
  const [lines, setLines] = useState<LineDraft[]>(() =>
    recipe && recipe.components.length
      ? recipe.components.map((c) => ({
          key: lineKey++,
          ingredientId: c.ingredientId ?? "",
          legacyProductId: c.ingredientId ? null : c.productId,
          legacyName: c.ingredientId ? "" : c.name,
          qty: String(c.qty),
        }))
      : [blankLine()],
  );
  // Which picker the inline "create new" form is filling.
  const [creating, setCreating] = useState<{ kind: "product" } | { kind: "ingredient"; key: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Recipe assistant (free recipe library). The library names come from the
  // server so the panel can offer them as quick picks.
  const [libraryRecipes, setLibraryRecipes] = useState<string[]>([]);
  const [assistantOpen, setAssistantOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [p, i, a] = await Promise.all([listProducts(), listIngredients(), getAssistantStatus()]);
      if (!alive) return;
      if (p.ok) setProducts(p.products);
      if (i.ok) setIngredients(i.ingredients);
      if (a.ok) setLibraryRecipes(a.libraryRecipes);
      setLoaded(true);
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

  const byId = new Map(ingredients.map((i) => [i.id, i]));

  /** Fill the form from a recipe-library suggestion: replaces the ingredient lines, keeps a typed note. */
  function applySuggestion(applied: AppliedSuggestion) {
    if (applied.created.length)
      setIngredients((prev) => [...prev, ...applied.created].sort((a, b) => a.name.localeCompare(b.name)));
    setOutputQty(String(applied.piecesPerBatch));
    setLines(
      applied.lines.map((l) => ({
        key: lineKey++,
        ingredientId: l.ingredientId,
        legacyProductId: null,
        legacyName: "",
        qty: String(l.qty),
      })),
    );
    if (!note.trim()) setNote(applied.note);
    setAssistantOpen(false);
    setError(null);
  }

  const selectedProductName = products.find((p) => p.id === productId)?.name ?? "";

  async function submit() {
    if (!productId) return setError("Choose the finished product this recipe makes.");
    const out = Number(outputQty);
    if (!Number.isInteger(out) || out <= 0) return setError("Enter how many pieces one batch makes.");
    const filled = lines.filter((l) => l.ingredientId || l.legacyProductId);
    if (filled.length === 0) return setError("Add at least one ingredient.");
    const components: ComponentDraft[] = [];
    for (const l of filled) {
      const qty = Number(l.qty);
      if (!Number.isFinite(qty) || qty <= 0) return setError("Each ingredient needs a quantity greater than 0.");
      components.push(l.legacyProductId ? { productId: l.legacyProductId, qty } : { ingredientId: l.ingredientId, qty });
    }
    const ids = filled.map((l) => l.ingredientId || l.legacyProductId);
    if (new Set(ids).size !== ids.length) return setError("An ingredient is listed twice — combine the quantities.");

    setBusy(true);
    setError(null);
    const fields: RecipeFields = { productId, outputQty: out, note, isActive, components };
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
      <div className="relative w-full max-w-[600px] rounded-xl2 bg-surface hairline shadow-soft p-6 max-h-[92vh] overflow-y-auto overlay-card">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center w-10 h-10 rounded-[11px] bg-brand-50 text-brand-600 shrink-0">
              <Icon name="factory" className="w-5 h-5" strokeWidth={1.8} />
            </span>
            <div>
              <h3 className="text-[1.1rem] font-extrabold tracking-tight">{editing ? "Edit recipe" : "New recipe"}</h3>
              <p className="text-[12.5px] text-ink-soft">What it makes, and the ingredients for one batch.</p>
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
          <div className="grid sm:grid-cols-[1fr_150px] gap-3">
            <label className="block">
              <span className="text-[12px] font-semibold text-ink-soft">Finished product (sold in Inventory)</span>
              <select
                value={productId}
                onChange={(e) => {
                  setError(null);
                  if (e.target.value === NEW_ITEM) setCreating({ kind: "product" });
                  else setProductId(e.target.value);
                }}
                className="field-input w-full rounded-[10px] px-3 py-2.5 text-[14px] mt-1.5"
              >
                <option value="">Choose a product…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                <option value={NEW_ITEM}>+ New product…</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold text-ink-soft">Pieces per batch</span>
              <input
                inputMode="numeric"
                value={outputQty}
                onChange={(e) => setOutputQty(e.target.value.replace(/[^\d]/g, ""))}
                className="field-input w-full rounded-[10px] px-3 py-2.5 text-[14px] mt-1.5 text-center tabular-nums"
              />
            </label>
          </div>

          {creating?.kind === "product" && (
            <NewProductForm
              onCancel={() => setCreating(null)}
              onCreated={(p) => {
                setProducts((prev) => [...prev, p].sort((a, b) => a.name.localeCompare(b.name)));
                setProductId(p.id);
                setCreating(null);
              }}
            />
          )}

          {/* Ingredients for one batch */}
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-[13px] font-bold">
                Ingredients for 1 batch{Number(outputQty) > 0 ? ` (${outputQty} piece${outputQty === "1" ? "" : "s"})` : ""}
              </span>
              {!assistantOpen ? (
                <button
                  type="button"
                  onClick={() => setAssistantOpen(true)}
                  className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-600 hover:text-brand-700 transition"
                >
                  <Icon name="bolt" className="w-3.5 h-3.5" strokeWidth={1.9} />
                  Suggest ingredients
                </button>
              ) : (
                <span className="text-[12px] text-ink-faint">
                  {lines.length} ingredient{lines.length === 1 ? "" : "s"}
                </span>
              )}
            </div>

            {assistantOpen && (
              <div className="mb-3">
                <RecipeAssistantPanel
                  defaultProduct={selectedProductName}
                  defaultPieces={outputQty}
                  ingredients={ingredients}
                  libraryRecipes={libraryRecipes}
                  onApply={applySuggestion}
                  onClose={() => setAssistantOpen(false)}
                />
              </div>
            )}

            {loaded && ingredients.length === 0 && !lines.some((l) => l.legacyProductId) && (
              <p className="mb-2 rounded-[10px] bg-paper hairline px-3.5 py-2.5 text-[12.5px] text-ink-soft">
                No ingredients yet. Pick <span className="font-semibold text-ink">+ New ingredient…</span> below to add
                flour, sugar and the rest — they stay in Manufacturing, not in Inventory.
              </p>
            )}

            <div className="hidden sm:grid grid-cols-[1fr_96px_84px_32px] gap-2 px-0.5 pb-1.5 text-[11.5px] font-semibold text-ink-faint">
              <span>Ingredient</span>
              <span className="text-right">Quantity</span>
              <span>Unit</span>
              <span />
            </div>
            <div className="space-y-2">
              {lines.map((l) => {
                const ing = l.ingredientId ? byId.get(l.ingredientId) : undefined;
                const unit = l.legacyProductId ? "pcs" : ing?.unit ?? "";
                return (
                  <div key={l.key}>
                    <div className="grid grid-cols-[1fr_84px_56px_32px] sm:grid-cols-[1fr_96px_84px_32px] gap-2 items-center">
                      {l.legacyProductId ? (
                        <div className="min-w-0 flex items-center gap-2 rounded-[9px] hairline px-2.5 py-2 text-[13px]">
                          <span className="truncate">{l.legacyName}</span>
                          <span className="shrink-0 text-[10.5px] font-bold rounded-full px-2 py-0.5 bg-amber-50 text-amber-600">
                            Inventory item
                          </span>
                        </div>
                      ) : (
                        <select
                          value={l.ingredientId}
                          onChange={(e) => {
                            if (e.target.value === NEW_ITEM) setCreating({ kind: "ingredient", key: l.key });
                            else patchLine(l.key, { ingredientId: e.target.value });
                          }}
                          className="field-input rounded-[9px] px-2.5 py-2 text-[13px] min-w-0"
                        >
                          <option value="">Choose an ingredient…</option>
                          {ingredients.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.name} ({formatAmount(i.stock)} {i.unit} on hand)
                            </option>
                          ))}
                          <option value={NEW_ITEM}>+ New ingredient…</option>
                        </select>
                      )}
                      <input
                        inputMode="decimal"
                        value={l.qty}
                        onChange={(e) => patchLine(l.key, { qty: cleanAmount(e.target.value) })}
                        placeholder="0"
                        aria-label="Quantity"
                        className="field-input rounded-[9px] px-2.5 py-2 text-[13px] text-right tabular-nums"
                      />
                      <span className="text-[13px] text-ink-soft truncate" title={UNIT_LABEL[unit] ?? unit}>
                        {unit ? UNIT_LABEL[unit] ?? unit : "—"}
                      </span>
                      {lines.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                          aria-label="Remove ingredient"
                          className="grid place-items-center w-8 h-8 rounded-[8px] text-ink-faint hover:bg-rose-50 hover:text-rose-600 transition"
                        >
                          <Icon name="trash" className="w-[16px] h-[16px]" strokeWidth={1.7} />
                        </button>
                      ) : (
                        <span />
                      )}
                    </div>
                    {creating?.kind === "ingredient" && creating.key === l.key && (
                      <div className="mt-2">
                        <NewIngredientForm
                          onCancel={() => setCreating(null)}
                          onCreated={(i) => {
                            setIngredients((prev) => [...prev, i].sort((a, b) => a.name.localeCompare(b.name)));
                            patchLine(l.key, { ingredientId: i.id });
                            setCreating(null);
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setLines((prev) => [...prev, blankLine()])}
              className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-600 hover:text-brand-700 transition"
            >
              <Icon name="plus" className="w-4 h-4" strokeWidth={2} />
              Add ingredient
            </button>
          </div>

          <label className="block">
            <span className="text-[12px] font-semibold text-ink-soft">Note (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Prep steps, baking time, yield notes…"
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

/** Enter inside an inline panel creates the item instead of submitting the recipe. */
function enterTo(fn: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      fn();
    }
  };
}

/**
 * Inline "new ingredient" panel. A plain <div>, not a nested <form>, so Enter
 * here adds the ingredient rather than submitting the recipe.
 */
function NewIngredientForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (ingredient: Ingredient) => void;
}) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<string>("g");
  const [stock, setStock] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!name.trim()) return setError("Name the ingredient.");
    setBusy(true);
    setError(null);
    const res = await createIngredient({ name: name.trim(), unit, stock: stock || "0", lowStockThreshold: "0" });
    if (res.ok) return onCreated(res.ingredient);
    setBusy(false);
    setError(res.error ?? (res.errors ? Object.values(res.errors)[0] : "Could not add the ingredient."));
  }

  return (
    <InlinePanel
      title="New ingredient"
      hint="Saved to Manufacturing → Ingredients"
      busy={busy}
      error={error}
      actionLabel="Add ingredient"
      onCancel={onCancel}
      onCreate={() => void create()}
    >
      <input
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
        onKeyDown={enterTo(() => void create())}
        autoFocus
        maxLength={120}
        placeholder="e.g. All-purpose flour"
        className="field-input w-full rounded-[9px] px-2.5 py-2 text-[13px]"
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[11.5px] font-semibold text-ink-soft">On hand now</span>
          <input
            inputMode="decimal"
            value={stock}
            onChange={(e) => setStock(cleanAmount(e.target.value))}
            onKeyDown={enterTo(() => void create())}
            placeholder="0"
            className="field-input w-full rounded-[9px] px-2.5 py-2 text-[13px] mt-1 tabular-nums"
          />
        </label>
        <label className="block">
          <span className="text-[11.5px] font-semibold text-ink-soft">Unit</span>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="field-input w-full rounded-[9px] px-2.5 py-2 text-[13px] mt-1"
          >
            {INGREDIENT_UNITS.map((u) => (
              <option key={u} value={u}>
                {UNIT_LABEL[u]}
              </option>
            ))}
          </select>
        </label>
      </div>
    </InlinePanel>
  );
}

/**
 * Inline "new finished product" panel — creates a sellable Inventory product
 * (stock starts at 0; producing fills it). SKU, category and photo are left for
 * the Inventory screen.
 */
function NewProductForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (product: Product) => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!name.trim()) return setError("Name the product.");
    setBusy(true);
    setError(null);
    const res = await createProduct(
      {
        name: name.trim(),
        sku: "",
        categoryId: "",
        price: price.trim() || "0",
        stock: "0",
        lowStockThreshold: "0",
        isActive: true,
        vatClass: "VATABLE",
        scPwdEligible: true,
      },
      null,
    );
    if (res.ok) return onCreated(res.product);
    setBusy(false);
    setError(res.error ?? (res.errors ? Object.values(res.errors)[0] : "Could not create the product."));
  }

  return (
    <InlinePanel
      title="New finished product"
      hint="Saved to Inventory"
      busy={busy}
      error={error}
      actionLabel="Add product"
      onCancel={onCancel}
      onCreate={() => void create()}
    >
      <div className="grid grid-cols-[1fr_120px] gap-2">
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          onKeyDown={enterTo(() => void create())}
          autoFocus
          maxLength={160}
          placeholder="e.g. Pandesal"
          className="field-input w-full rounded-[9px] px-2.5 py-2 text-[13px]"
        />
        <input
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onKeyDown={enterTo(() => void create())}
          placeholder="Price ₱"
          aria-label="Selling price"
          className="field-input w-full rounded-[9px] px-2.5 py-2 text-[13px] tabular-nums"
        />
      </div>
    </InlinePanel>
  );
}

function InlinePanel({
  title,
  hint,
  busy,
  error,
  actionLabel,
  onCancel,
  onCreate,
  children,
}: {
  title: string;
  hint: string;
  busy: boolean;
  error: string | null;
  actionLabel: string;
  onCancel: () => void;
  onCreate: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[12px] bg-paper hairline p-3.5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-bold flex items-center gap-1.5">
          <Icon name="box" className="w-[15px] h-[15px] text-brand-600" strokeWidth={1.8} />
          {title}
        </span>
        <span className="text-[11.5px] text-ink-faint">{hint}</span>
      </div>
      {children}
      {error && <p className="text-[12px] font-semibold text-rose-600">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-2 rounded-[9px] text-[13px] font-semibold text-ink-soft hover:bg-surface transition duration-150"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onCreate}
          disabled={busy}
          className="inline-flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[13px] px-3.5 py-2 rounded-[9px] shadow-btn transition duration-150 disabled:opacity-60"
        >
          <Icon name="plus" className="w-4 h-4" strokeWidth={2} />
          {busy ? "Adding…" : actionLabel}
        </button>
      </div>
    </div>
  );
}
