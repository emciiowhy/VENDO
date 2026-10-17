"use client";

import { useState } from "react";
import { Icon } from "../Icon";
import {
  UNIT_LABEL,
  createIngredient,
  formatAmount,
  suggestRecipe,
  type Ingredient,
  type RecipeSuggestion,
  type SuggestionBasis,
} from "@/lib/manufacturing";

/**
 * Recipe assistant for the recipe form. The owner names a product and a batch
 * size; the server finds the closest recipe in the VENDOPOS recipe library and
 * scales it with baker's percentages (free, no AI call), matching each
 * ingredient to what the store stocks. An optional AI fallback covers products
 * outside the library when the server has a key. Either way it's a draft: "Use
 * this recipe" creates any missing ingredients (at 0 on hand) and fills the
 * form, where the owner edits amounts before saving.
 */
export interface AppliedSuggestion {
  piecesPerBatch: number;
  lines: { ingredientId: string; qty: number }[];
  note: string;
  /** Ingredients created while applying, for the form's picker. */
  created: Ingredient[];
}

export function RecipeAssistantPanel({
  defaultProduct,
  defaultPieces,
  ingredients,
  libraryRecipes,
  onApply,
  onClose,
}: {
  defaultProduct: string;
  defaultPieces: string;
  ingredients: Ingredient[];
  /** Names in the recipe library, offered as quick picks. */
  libraryRecipes: string[];
  onApply: (applied: AppliedSuggestion) => void;
  onClose: () => void;
}) {
  const [product, setProduct] = useState(defaultProduct);
  const [pieces, setPieces] = useState(defaultPieces || "20");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<"suggest" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<RecipeSuggestion | null>(null);
  // Library recipes to offer after a miss ("not in the library — try one of these").
  const [missed, setMissed] = useState(false);

  async function ask(productOverride?: string) {
    const name = (productOverride ?? product).trim();
    const n = Number(pieces);
    if (name.length < 2) return setError("Name the product, e.g. Pandesal.");
    if (!Number.isInteger(n) || n <= 0) return setError("Enter how many pieces one batch makes.");
    if (productOverride) setProduct(productOverride);
    setBusy("suggest");
    setError(null);
    setMissed(false);
    const res = await suggestRecipe({ product: name, piecesPerBatch: n, notes });
    setBusy(null);
    if (res.ok) {
      setDraft(res.suggestion);
      if (res.suggestion.ingredients.length === 0)
        setError(res.suggestion.tips[0] ?? "The assistant didn't suggest any ingredients for that.");
      return;
    }
    if (res.code === "NO_MATCH") setMissed(true);
    setError(res.error ?? (res.errors ? Object.values(res.errors)[0] : "Could not get a suggestion."));
  }

  async function apply() {
    if (!draft) return;
    setBusy("apply");
    setError(null);
    // Reuse a stocked ingredient with the same name (the assistant may not have
    // matched it) before creating a new one at 0 on hand.
    const byName = new Map(ingredients.map((i) => [i.name.trim().toLowerCase(), i]));
    const created: Ingredient[] = [];
    const lines: AppliedSuggestion["lines"] = [];
    for (const s of draft.ingredients) {
      let id = s.existingIngredientId;
      const sameName = byName.get(s.name.trim().toLowerCase());
      if (!id && sameName && sameName.unit === s.unit) id = sameName.id;
      if (!id) {
        const res = await createIngredient({ name: s.name, unit: s.unit, stock: "0", lowStockThreshold: "0" });
        if (!res.ok) {
          setBusy(null);
          setError(
            `Couldn't add ${s.name}: ${res.error ?? (res.errors ? Object.values(res.errors)[0] : "unknown error")}`,
          );
          return;
        }
        created.push(res.ingredient);
        byName.set(res.ingredient.name.toLowerCase(), res.ingredient);
        id = res.ingredient.id;
      }
      if (!lines.some((l) => l.ingredientId === id)) lines.push({ ingredientId: id, qty: s.qty });
    }
    const note = [
      draft.steps.length ? draft.steps.map((s, i) => `${i + 1}. ${s}`).join("\n") : "",
      draft.tips.length ? `Tips: ${draft.tips.join(" ")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 500);
    onApply({ piecesPerBatch: draft.piecesPerBatch, lines, note, created });
  }

  const newCount = draft
    ? draft.ingredients.filter(
        (s) => !s.existingIngredientId && !ingredients.some((i) => i.name.trim().toLowerCase() === s.name.trim().toLowerCase() && i.unit === s.unit),
      ).length
    : 0;

  return (
    <div className="rounded-[12px] bg-brand-50/50 hairline p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-bold flex items-center gap-1.5 text-brand-700">
          <Icon name="bolt" className="w-4 h-4" strokeWidth={1.9} />
          Recipe assistant
        </span>
        <button type="button" onClick={onClose} aria-label="Close assistant" className="text-ink-faint hover:text-ink transition p-0.5">
          <Icon name="x" className="w-4 h-4" strokeWidth={1.8} />
        </button>
      </div>

      {!draft ? (
        <>
          <p className="text-[12.5px] text-ink-soft">
            Type what you&apos;re making. It finds the recipe in the VENDOPOS recipe library and works out the exact grams,
            kilos and liters for your batch size — matched to what you already stock.
          </p>
          <div className="grid grid-cols-[1fr_110px] gap-2">
            <input
              value={product}
              onChange={(e) => {
                setProduct(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void ask();
                }
              }}
              autoFocus
              maxLength={120}
              placeholder="e.g. Pandesal"
              aria-label="Product"
              className="field-input w-full rounded-[9px] px-2.5 py-2 text-[13px]"
            />
            <input
              inputMode="numeric"
              value={pieces}
              onChange={(e) => setPieces(e.target.value.replace(/[^\d]/g, ""))}
              aria-label="Pieces per batch"
              placeholder="Pieces"
              className="field-input w-full rounded-[9px] px-2.5 py-2 text-[13px] text-center tabular-nums"
            />
          </div>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={300}
            placeholder="Anything to consider? (optional) e.g. soft and sweet, use margarine"
            aria-label="Notes for the assistant"
            className="field-input w-full rounded-[9px] px-2.5 py-2 text-[13px]"
          />
          {error && <p className="text-[12px] font-semibold text-rose-600">{error}</p>}
          {libraryRecipes.length > 0 && (
            <div>
              <p className="text-[11.5px] font-semibold text-ink-faint mb-1.5">
                {missed ? "Recipes in the library:" : "Quick picks:"}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {libraryRecipes.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => void ask(name)}
                    disabled={busy !== null}
                    className="rounded-full hairline bg-surface px-2.5 py-1 text-[12px] font-semibold text-ink-soft hover:text-brand-600 hover:border-brand-200 transition disabled:opacity-60"
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void ask()}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[13px] px-3.5 py-2 rounded-[9px] shadow-btn transition duration-150 disabled:opacity-60"
            >
              <Icon name="bolt" className="w-4 h-4" strokeWidth={1.9} />
              {busy === "suggest" ? "Finding recipe…" : "Suggest ingredients"}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12.5px] font-semibold">
              {draft.recipeName} · 1 batch makes {draft.piecesPerBatch}{" "}
              {draft.basis.pieceLabel}
              {draft.piecesPerBatch === 1 ? "" : "s"}
            </p>
            <span className="text-[10.5px] font-bold rounded-full px-2 py-0.5 bg-accent-50 text-accent-600">
              Recipe library · {Math.round(draft.basis.matchScore * 100)}% match
            </span>
          </div>
          {draft.alternatives.length > 0 && (
            <p className="text-[11.5px] text-ink-faint">
              Not it? Also similar:{" "}
              {draft.alternatives.map((name, i) => (
                <span key={name}>
                  {i > 0 && ", "}
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(null);
                      void ask(name);
                    }}
                    className="font-semibold text-brand-600 hover:text-brand-700"
                  >
                    {name}
                  </button>
                </span>
              ))}
            </p>
          )}
          <div className="rounded-[10px] bg-surface hairline divide-y divide-ink/5">
            {draft.ingredients.map((s, i) => {
              const stocked =
                !!s.existingIngredientId ||
                ingredients.some((x) => x.name.trim().toLowerCase() === s.name.trim().toLowerCase() && x.unit === s.unit);
              return (
                <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-3 items-baseline px-3 py-2 text-[13px]">
                  <span className="min-w-0">
                    <span className="font-semibold">{s.name}</span>
                    {s.note && <span className="block text-[11.5px] text-ink-faint">{s.note}</span>}
                  </span>
                  <span className="tabular-nums font-bold text-right whitespace-nowrap">
                    {formatAmount(s.qty)} <span className="font-normal text-ink-soft">{UNIT_LABEL[s.unit] ?? s.unit}</span>
                  </span>
                  <span
                    className={
                      "text-[10.5px] font-bold rounded-full px-2 py-0.5 " +
                      (stocked ? "bg-accent-50 text-accent-600" : "bg-paper hairline text-ink-faint")
                    }
                  >
                    {stocked ? "In stock" : "New"}
                  </span>
                </div>
              );
            })}
          </div>
          {draft.steps.length > 0 && (
            <details className="text-[12.5px] text-ink-soft">
              <summary className="cursor-pointer font-semibold text-ink">Method ({draft.steps.length} steps)</summary>
              <ol className="mt-1.5 ml-4 list-decimal space-y-1">
                {draft.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </details>
          )}
          {draft.tips.length > 0 && (
            <ul className="text-[12px] text-ink-soft space-y-0.5">
              {draft.tips.map((t, i) => (
                <li key={i}>• {t}</li>
              ))}
            </ul>
          )}
          <HowComputed basis={draft.basis} pieces={draft.piecesPerBatch} />
          <p className="text-[11.5px] text-ink-faint">
            A standard formula scaled to your batch — adjust it to how you actually make it.
            {newCount > 0 && ` ${newCount} new ingredient${newCount === 1 ? "" : "s"} will be added with 0 on hand.`}
          </p>
          {error && <p className="text-[12px] font-semibold text-rose-600">{error}</p>}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setDraft(null);
                setError(null);
              }}
              disabled={busy !== null}
              className="px-3 py-2 rounded-[9px] text-[13px] font-semibold text-ink-soft hover:bg-surface transition duration-150"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => void apply()}
              disabled={busy !== null || draft.ingredients.length === 0}
              className="inline-flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[13px] px-3.5 py-2 rounded-[9px] shadow-btn transition duration-150 disabled:opacity-60"
            >
              <Icon name="check" className="w-4 h-4" strokeWidth={2} />
              {busy === "apply" ? "Adding…" : "Use this recipe"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * "How we got these amounts" — the baker's-percentage arithmetic behind a
 * library answer, so an owner (or anyone reviewing the system) can check every
 * number: dough = pieces × piece weight, flour = dough ÷ Σ%, ingredient = flour × %.
 */
function HowComputed({ basis, pieces }: { basis: SuggestionBasis; pieces: number }) {
  const g = (n: number) => `${formatAmount(Math.round(n * 10) / 10)} g`;
  return (
    <details className="text-[12px] text-ink-soft">
      <summary className="cursor-pointer font-semibold text-ink">How we got these amounts</summary>
      <div className="mt-2 space-y-2">
        <ol className="ml-4 list-decimal space-y-0.5">
          <li>
            Total dough = {pieces} {basis.pieceLabel}
            {pieces === 1 ? "" : "s"} × {g(basis.pieceWeightG)} = <span className="font-semibold text-ink">{g(basis.doughGrams)}</span>
          </li>
          <li>
            Flour = {g(basis.doughGrams)} ÷ ({formatAmount(basis.doughPctTotal)}% ÷ 100) ={" "}
            <span className="font-semibold text-ink">{g(basis.flourGrams)}</span>
          </li>
          <li>Each ingredient = flour × its baker&apos;s percentage</li>
        </ol>
        <div className="rounded-[8px] bg-surface hairline overflow-hidden">
          <table className="w-full text-[11.5px]">
            <thead>
              <tr className="text-left text-ink-faint border-b border-ink/8">
                <th className="px-2.5 py-1.5 font-semibold">Ingredient</th>
                <th className="px-2.5 py-1.5 font-semibold text-right">Baker&apos;s %</th>
                <th className="px-2.5 py-1.5 font-semibold text-right">Weight</th>
              </tr>
            </thead>
            <tbody>
              {basis.formula.map((f) => (
                <tr key={f.name} className="border-b border-ink/5 last:border-0">
                  <td className="px-2.5 py-1">
                    {f.name}
                    {!f.inDough && <span className="text-ink-faint"> · not in dough</span>}
                  </td>
                  <td className="px-2.5 py-1 text-right tabular-nums">{formatAmount(f.pct)}%</td>
                  <td className="px-2.5 py-1 text-right tabular-nums">{g(f.grams)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-ink-faint">
          Liquids are shown in mL (≈ 1 g per mL) and eggs in pieces (≈ 50 g each). Fillings and toppings are scaled from
          the flour but don&apos;t count toward the dough weight.
        </p>
      </div>
    </details>
  );
}
