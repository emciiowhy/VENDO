"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "../Icon";
import { useToast } from "../Toast";
import { ConfirmDialog } from "../ConfirmDialog";
import { formatCount, formatDate } from "@/lib/format";
import {
  deleteRecipe,
  formatAmount,
  getManufacturingSummary,
  listIngredients,
  listProductionRuns,
  listRecipes,
  type Ingredient,
  type ManufacturingSummary,
  type ProductionRunSummary,
  type Recipe,
} from "@/lib/manufacturing";
import { RecipeFormModal } from "./RecipeFormModal";
import { ProduceModal } from "./ProduceModal";
import { IngredientsTab } from "./IngredientsTab";

/**
 * Merchant Manufacturing console — recipes, ingredients + production history.
 * Ingredients are raw materials kept out of Inventory with their own stock.
 * Each recipe shows how many batches that stock allows; producing uses the
 * ingredients and restocks the finished good in Inventory (server-side, atomic).
 */
type Tab = "recipes" | "ingredients" | "history";

type Loaded = {
  summary: ManufacturingSummary;
  recipes: Recipe[];
  ingredients: Ingredient[];
  runs: ProductionRunSummary[];
};

type State = { status: "loading" } | { status: "error"; message: string } | ({ status: "ready" } & Loaded);

async function fetchAll(): Promise<State> {
  const [s, r, i, runs] = await Promise.all([
    getManufacturingSummary(),
    listRecipes(),
    listIngredients(),
    listProductionRuns(),
  ]);
  if (s.ok && r.ok && i.ok && runs.ok)
    return { status: "ready", summary: s.summary, recipes: r.recipes, ingredients: i.ingredients, runs: runs.runs };
  return {
    status: "error",
    message:
      (!s.ok && s.error) || (!r.ok && r.error) || (!i.ok && i.error) || (!runs.ok && runs.error) || "Could not load manufacturing.",
  };
}

export function ManufacturingConsole() {
  const { push } = useToast();
  const [state, setState] = useState<State>({ status: "loading" });
  const [tab, setTab] = useState<Tab>("recipes");
  const [form, setForm] = useState<{ recipe: Recipe | null } | null>(null);
  const [producing, setProducing] = useState<Recipe | null>(null);
  const [confirm, setConfirm] = useState<Recipe | null>(null);

  async function load() {
    setState(await fetchAll());
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      const next = await fetchAll();
      if (alive) setState(next);
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function onDelete() {
    if (!confirm) return;
    const target = confirm;
    setConfirm(null);
    const res = await deleteRecipe(target.id);
    if (res.ok) {
      push({ variant: "success", title: "Recipe deleted" });
      void load();
    } else {
      push({ variant: "danger", title: "Couldn't delete", message: res.error });
    }
  }

  return (
    <div className="space-y-6 max-w-[1180px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[1.3rem] font-extrabold tracking-tightest">Manufacturing</h2>
          <p className="text-[13.5px] text-ink-soft">Recipes turn ingredients into finished products — producing updates the stock for you.</p>
        </div>
        <button
          type="button"
          onClick={() => setForm({ recipe: null })}
          className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[14px] px-5 py-2.5 rounded-[10px] shadow-btn tracking-tight transition duration-150"
        >
          <Icon name="plus" className="w-[18px] h-[18px]" strokeWidth={2} />
          New recipe
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <Kpi icon="factory" label="Active recipes" value={String(state.summary.recipeCount)} />
            <Kpi icon="check" label="Buildable now" value={String(state.summary.buildableNow)} tone="good" />
            <Kpi
              icon="box"
              label="Ingredients running low"
              value={String(state.summary.lowIngredients)}
              tone={state.summary.lowIngredients > 0 ? "warn" : undefined}
            />
            <Kpi icon="refresh" label="Runs this month" value={String(state.summary.runsThisMonth)} />
            <Kpi icon="box" label="Units made this month" value={formatCount(state.summary.unitsThisMonth)} />
          </div>

          <div className="flex items-center gap-1 border-b border-ink/8 overflow-x-auto">
            <TabButton active={tab === "recipes"} onClick={() => setTab("recipes")} label={`Recipes (${state.recipes.length})`} />
            <TabButton
              active={tab === "ingredients"}
              onClick={() => setTab("ingredients")}
              label={`Ingredients (${state.ingredients.length})`}
            />
            <TabButton active={tab === "history"} onClick={() => setTab("history")} label={`Production history (${state.runs.length})`} />
          </div>

          {tab === "ingredients" ? (
            <IngredientsTab ingredients={state.ingredients} onChanged={() => void load()} />
          ) : tab === "recipes" ? (
            state.recipes.length === 0 ? (
              <EmptyState onNew={() => setForm({ recipe: null })} />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {state.recipes.map((r) => (
                  <RecipeCard
                    key={r.id}
                    recipe={r}
                    onProduce={() => setProducing(r)}
                    onEdit={() => setForm({ recipe: r })}
                    onDelete={() => setConfirm(r)}
                  />
                ))}
              </div>
            )
          ) : (
            <HistoryTable runs={state.runs} />
          )}
        </>
      )}

      {form && (
        <RecipeFormModal
          recipe={form.recipe}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            void load();
          }}
        />
      )}
      {producing && (
        <ProduceModal
          recipe={producing}
          onClose={() => setProducing(null)}
          onProduced={() => {
            setProducing(null);
            void load();
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={`Delete this recipe?`}
          message={`The recipe for ${confirm.productName} will be removed. Past production runs stay in your history.`}
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

function RecipeCard({
  recipe,
  onProduce,
  onEdit,
  onDelete,
}: {
  recipe: Recipe;
  onProduce: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const buildable = recipe.maxBatches >= 1;
  return (
    <div className={"rounded-xl2 bg-surface hairline shadow-card p-5 flex flex-col " + (recipe.isActive ? "" : "opacity-70")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-extrabold tracking-tight truncate">{recipe.productName}</h3>
          <p className="text-[12.5px] text-ink-soft">
            Makes {recipe.outputQty} piece{recipe.outputQty === 1 ? "" : "s"} / batch
            {!recipe.isActive && " · archived"}
          </p>
        </div>
        <span
          className={
            "shrink-0 text-[11px] font-bold rounded-full px-2.5 py-0.5 " +
            (buildable ? "bg-accent-50 text-accent-600" : "bg-amber-50 text-amber-600")
          }
        >
          {buildable ? `${recipe.maxBatches} batch${recipe.maxBatches === 1 ? "" : "es"} possible` : "Not enough ingredients"}
        </span>
      </div>

      <div className="mt-3 space-y-1.5 flex-1">
        {recipe.components.map((c) => {
          const short = !c.available || c.stock < c.qty;
          return (
            <div key={c.id} className="flex items-center justify-between text-[13px]">
              <span className="truncate pr-2 text-ink-soft">{c.name}</span>
              <span className="tabular-nums shrink-0">
                <span className="font-semibold">
                  {formatAmount(c.qty)} {c.unit}
                </span>
                <span className={"text-[11.5px] ml-1.5 " + (short ? "text-rose-600 font-semibold" : "text-ink-faint")}>
                  ({c.available ? `${formatAmount(c.stock)} on hand` : "deleted"})
                </span>
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onProduce}
          disabled={!recipe.isActive}
          className="flex-1 inline-flex items-center justify-center gap-2 bg-accent-500 hover:bg-accent-600 text-white font-semibold text-[13.5px] py-2.5 rounded-[10px] shadow-btn transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Icon name="factory" className="w-[16px] h-[16px]" strokeWidth={1.8} />
          Produce
        </button>
        <button type="button" onClick={onEdit} aria-label="Edit" title="Edit" className="grid place-items-center w-9 h-9 rounded-[10px] text-ink-faint hairline hover:bg-brand-50 hover:text-brand-600 transition">
          <Icon name="pencil" className="w-[17px] h-[17px]" strokeWidth={1.7} />
        </button>
        <button type="button" onClick={onDelete} aria-label="Delete" title="Delete" className="grid place-items-center w-9 h-9 rounded-[10px] text-ink-faint hairline hover:bg-rose-50 hover:text-rose-600 transition">
          <Icon name="trash" className="w-[17px] h-[17px]" strokeWidth={1.7} />
        </button>
      </div>
    </div>
  );
}

function HistoryTable({ runs }: { runs: ProductionRunSummary[] }) {
  if (runs.length === 0) {
    return (
      <div className="rounded-xl2 bg-surface hairline shadow-card px-5 py-14 text-center">
        <span className="inline-grid place-items-center w-12 h-12 rounded-[14px] bg-brand-50 text-brand-600">
          <Icon name="refresh" className="w-6 h-6" strokeWidth={1.6} />
        </span>
        <p className="mt-3 text-[14px] font-semibold">No production yet</p>
        <p className="mt-1 text-[13px] text-ink-soft">Produce a recipe and each run is logged here.</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="text-left text-[12px] font-semibold text-ink-faint border-b border-ink/8 bg-paper/40">
              <th className="px-5 py-2.5 font-semibold">Run #</th>
              <th className="px-3 py-2.5 font-semibold">Product</th>
              <th className="px-3 py-2.5 font-semibold text-center">Batches</th>
              <th className="px-3 py-2.5 font-semibold text-right">Units made</th>
              <th className="px-5 py-2.5 font-semibold text-right">When</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id} className="border-b border-ink/5 last:border-0 hover:bg-paper/40 transition">
                <td className="px-5 py-3 font-bold tabular-nums">{run.reference}</td>
                <td className="px-3 py-3">{run.productName}</td>
                <td className="px-3 py-3 text-center tabular-nums">{run.batches}</td>
                <td className="px-3 py-3 text-right font-bold tabular-nums text-accent-600">+{run.outputQty}</td>
                <td className="px-5 py-3 text-right text-ink-soft tabular-nums whitespace-nowrap">{formatDate(run.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card px-5 py-14 text-center">
      <span className="inline-grid place-items-center w-12 h-12 rounded-[14px] bg-brand-50 text-brand-600">
        <Icon name="factory" className="w-6 h-6" strokeWidth={1.6} />
      </span>
      <p className="mt-3 text-[14px] font-semibold">No recipes yet</p>
      <p className="mt-1 text-[13px] text-ink-soft max-w-[44ch] mx-auto">
        List the ingredients for one batch — 500 g flour, 60 g sugar… Producing a batch uses them up
        and adds the finished product to Inventory.
      </p>
      <button
        type="button"
        onClick={onNew}
        className="mt-4 inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[13.5px] px-4 py-2.5 rounded-[10px] shadow-btn transition duration-150"
      >
        <Icon name="plus" className="w-4 h-4" strokeWidth={2} />
        Create your first recipe
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

const KPI_TONE = {
  good: "bg-accent-50 text-accent-600",
  warn: "bg-amber-50 text-amber-600",
  default: "bg-brand-50 text-brand-600",
};

function Kpi({ icon, label, value, tone }: { icon: IconName; label: string; value: string; tone?: "good" | "warn" }) {
  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card p-5">
      <span className={"grid place-items-center w-9 h-9 rounded-[10px] " + KPI_TONE[tone ?? "default"]}>
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
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-xl2 bg-surface hairline shadow-card h-[220px]" />
        ))}
      </div>
    </div>
  );
}
