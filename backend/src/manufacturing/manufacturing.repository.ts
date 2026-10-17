import type { PoolClient } from "pg";
import { pool, query } from "../db.js";
import { moveStock } from "../inventory/stockLedger.js";
import type {
  Ingredient,
  IngredientCreateInput,
  IngredientUpdateInput,
  ProduceInput,
  ProductionRunDetail,
  ProductionRunItem,
  ProductionRunSummary,
  Recipe,
  RecipeComponent,
  RecipeComponentInput,
  RecipeCreateInput,
  RecipeUpdateInput,
} from "./manufacturing.schema.js";

/**
 * Data access for Manufacturing. EVERY query is scoped by `tenantId` (read from
 * the verified JWT session, never the request body).
 *
 * Inventory (`products`) holds only finished goods. Raw materials are
 * `ingredients`, with their own stock in a measuring unit. Producing a batch runs
 * in one transaction that decrements each ingredient's stock and increments the
 * finished good's catalogue stock through the stock ledger. A legacy recipe line
 * that points at a catalogue product (saved before ingredients existed) still
 * consumes that product's stock through the ledger, as it always did.
 */
const MNL = "Asia/Manila";

/** pg returns NUMERIC as a string; amounts are kept to 3 decimals. */
function num(v: string | number | null): number {
  return v === null ? 0 : Math.round(Number(v) * 1000) / 1000;
}

// ── Ingredients ───────────────────────────────────────────────────────────────

interface IngredientRow {
  id: string;
  name: string;
  unit: string;
  stock: string;
  low_stock_threshold: string;
  recipe_count: number;
  created_at: Date;
  updated_at: Date;
}

function toIngredient(row: IngredientRow): Ingredient {
  const stock = num(row.stock);
  const low = num(row.low_stock_threshold);
  return {
    id: row.id,
    name: row.name,
    unit: row.unit,
    stock,
    lowStockThreshold: low,
    lowStock: low > 0 && stock <= low,
    recipeCount: row.recipe_count,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const INGREDIENT_SELECT = `i.id, i.name, i.unit, i.stock, i.low_stock_threshold, i.created_at, i.updated_at,
  (SELECT count(DISTINCT rc.recipe_id)::int
     FROM recipe_components rc JOIN recipes r ON r.id = rc.recipe_id
    WHERE rc.ingredient_id = i.id AND r.is_active) AS recipe_count`;

export async function listIngredients(tenantId: string): Promise<Ingredient[]> {
  const { rows } = await query<IngredientRow>(
    `SELECT ${INGREDIENT_SELECT} FROM ingredients i WHERE i.tenant_id = $1 ORDER BY lower(i.name) ASC`,
    [tenantId],
  );
  return rows.map(toIngredient);
}

async function getIngredient(tenantId: string, id: string): Promise<Ingredient | null> {
  const { rows } = await query<IngredientRow>(
    `SELECT ${INGREDIENT_SELECT} FROM ingredients i WHERE i.id = $1 AND i.tenant_id = $2`,
    [id, tenantId],
  );
  return rows[0] ? toIngredient(rows[0]) : null;
}

export type IngredientWriteResult =
  | { ok: true; ingredient: Ingredient }
  | { ok: false; code: "DUPLICATE" | "NOT_FOUND" };

/** Postgres unique_violation — the per-tenant case-insensitive name index. */
function isDuplicate(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

export async function createIngredient(
  tenantId: string,
  input: IngredientCreateInput,
): Promise<IngredientWriteResult> {
  try {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO ingredients (tenant_id, name, unit, stock, low_stock_threshold)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [tenantId, input.name, input.unit, input.stock, input.lowStockThreshold],
    );
    const ingredient = await getIngredient(tenantId, rows[0].id);
    if (!ingredient) throw new Error("Ingredient vanished immediately after insert.");
    return { ok: true, ingredient };
  } catch (err) {
    if (isDuplicate(err)) return { ok: false, code: "DUPLICATE" };
    throw err;
  }
}

export async function updateIngredient(
  tenantId: string,
  id: string,
  input: IngredientUpdateInput,
): Promise<IngredientWriteResult> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  const set = (col: string, val: unknown) => {
    sets.push(`${col} = $${sets.length + 3}`);
    vals.push(val);
  };
  if (input.name !== undefined) set("name", input.name);
  if (input.unit !== undefined) set("unit", input.unit);
  if (input.stock !== undefined) set("stock", input.stock);
  if (input.lowStockThreshold !== undefined) set("low_stock_threshold", input.lowStockThreshold);
  if (sets.length > 0) {
    sets.push("updated_at = now()");
    try {
      const { rowCount } = await query(
        `UPDATE ingredients SET ${sets.join(", ")} WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId, ...vals],
      );
      if (!rowCount) return { ok: false, code: "NOT_FOUND" };
    } catch (err) {
      if (isDuplicate(err)) return { ok: false, code: "DUPLICATE" };
      throw err;
    }
  }
  const ingredient = await getIngredient(tenantId, id);
  return ingredient ? { ok: true, ingredient } : { ok: false, code: "NOT_FOUND" };
}

/** Add stock (a delivery / market run) — relative, so it can't clobber a concurrent produce. */
export async function restockIngredient(
  tenantId: string,
  id: string,
  qty: number,
): Promise<Ingredient | null> {
  const { rowCount } = await query(
    `UPDATE ingredients SET stock = stock + $3, updated_at = now() WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId, qty],
  );
  return rowCount ? getIngredient(tenantId, id) : null;
}

export async function deleteIngredient(tenantId: string, id: string): Promise<boolean> {
  const { rowCount } = await query(`DELETE FROM ingredients WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
  return (rowCount ?? 0) > 0;
}

// ── Recipe assembly helpers ──────────────────────────────────────────────────

interface RecipeRow {
  id: string;
  product_id: string | null;
  product_name: string | null;
  output_qty: number;
  note: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

interface ComponentRow {
  id: string;
  recipe_id: string;
  ingredient_id: string | null;
  product_id: string | null;
  name: string;
  unit: string | null;
  qty: string;
  ingredient_stock: string | null;
  product_stock: number | null;
  ingredient_exists: boolean;
  product_exists: boolean;
}

function buildableBatches(components: RecipeComponent[]): number {
  if (components.length === 0) return 0;
  let max = Infinity;
  for (const c of components) {
    // A line whose ingredient/product was deleted blocks production. The epsilon
    // absorbs float noise so 1000 g on hand / 500 g per batch is exactly 2.
    const possible = c.available ? Math.floor(c.stock / c.qty + 1e-9) : 0;
    if (possible < max) max = possible;
  }
  return Number.isFinite(max) ? Math.max(0, max) : 0;
}

function assembleRecipe(row: RecipeRow, comps: ComponentRow[]): Recipe {
  const components: RecipeComponent[] = comps.map((c) => {
    // A legacy line carries a product_id (or, if that product was deleted, a
    // NULL unit); everything else is an ingredient line.
    const legacy = c.product_id !== null || (c.ingredient_id === null && c.unit === null);
    return {
      id: c.id,
      ingredientId: c.ingredient_id,
      productId: c.product_id,
      name: c.name,
      unit: c.unit ?? "pcs",
      qty: num(c.qty),
      stock: legacy ? c.product_stock ?? 0 : num(c.ingredient_stock),
      available: legacy ? c.product_exists : c.ingredient_exists,
    };
  });
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name ?? "(deleted product)",
    outputQty: row.output_qty,
    note: row.note,
    isActive: row.is_active,
    components,
    maxBatches: buildableBatches(components),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const RECIPE_SELECT = `r.id, r.product_id, p.name AS product_name, r.output_qty, r.note,
  r.is_active, r.created_at, r.updated_at`;

async function componentsFor(recipeIds: string[]): Promise<Map<string, ComponentRow[]>> {
  const map = new Map<string, ComponentRow[]>();
  if (recipeIds.length === 0) return map;
  const { rows } = await query<ComponentRow>(
    `SELECT rc.id, rc.recipe_id, rc.ingredient_id, rc.product_id, rc.name,
            coalesce(ing.unit, rc.unit) AS unit, rc.qty,
            ing.stock AS ingredient_stock, pr.stock AS product_stock,
            ing.id IS NOT NULL AS ingredient_exists, pr.id IS NOT NULL AS product_exists
       FROM recipe_components rc
       LEFT JOIN ingredients ing ON ing.id = rc.ingredient_id
       LEFT JOIN products pr ON pr.id = rc.product_id
      WHERE rc.recipe_id = ANY($1::uuid[])
      ORDER BY rc.qty DESC, lower(rc.name) ASC`,
    [recipeIds],
  );
  for (const row of rows) {
    const list = map.get(row.recipe_id) ?? [];
    list.push(row);
    map.set(row.recipe_id, list);
  }
  return map;
}

export async function listRecipes(tenantId: string): Promise<Recipe[]> {
  const { rows } = await query<RecipeRow>(
    `SELECT ${RECIPE_SELECT}
       FROM recipes r
       LEFT JOIN products p ON p.id = r.product_id
      WHERE r.tenant_id = $1
      ORDER BY r.is_active DESC, lower(p.name) ASC NULLS LAST`,
    [tenantId],
  );
  const comps = await componentsFor(rows.map((r) => r.id));
  return rows.map((r) => assembleRecipe(r, comps.get(r.id) ?? []));
}

export async function getRecipe(tenantId: string, id: string): Promise<Recipe | null> {
  const { rows } = await query<RecipeRow>(
    `SELECT ${RECIPE_SELECT}
       FROM recipes r
       LEFT JOIN products p ON p.id = r.product_id
      WHERE r.id = $1 AND r.tenant_id = $2`,
    [id, tenantId],
  );
  if (!rows[0]) return null;
  const comps = await componentsFor([id]);
  return assembleRecipe(rows[0], comps.get(id) ?? []);
}

export type RecipeWriteResult =
  | { ok: true; recipe: Recipe }
  | { ok: false; code: "PRODUCT_INVALID" | "INGREDIENT_INVALID" | "NOT_FOUND" };

/** Resolve product ids to {id → name} within the Tenant; null if any is foreign. */
async function resolveProducts(tenantId: string, ids: string[]): Promise<Map<string, string> | null> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { rows } = await query<{ id: string; name: string }>(
    `SELECT id, name FROM products WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
    [tenantId, unique],
  );
  if (rows.length !== unique.length) return null; // some id isn't ours / doesn't exist
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Resolve ingredient ids to {id → name, unit} within the Tenant; null if any is foreign. */
async function resolveIngredients(
  tenantId: string,
  ids: string[],
): Promise<Map<string, { name: string; unit: string }> | null> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { rows } = await query<{ id: string; name: string; unit: string }>(
    `SELECT id, name, unit FROM ingredients WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
    [tenantId, unique],
  );
  if (rows.length !== unique.length) return null;
  return new Map(rows.map((r) => [r.id, { name: r.name, unit: r.unit }]));
}

interface ResolvedLines {
  products: Map<string, string>;
  ingredients: Map<string, { name: string; unit: string }>;
}

async function resolveLines(
  tenantId: string,
  outputProductId: string | undefined,
  lines: RecipeComponentInput[],
): Promise<ResolvedLines | "PRODUCT_INVALID" | "INGREDIENT_INVALID"> {
  const products = await resolveProducts(tenantId, [
    ...(outputProductId ? [outputProductId] : []),
    ...lines.flatMap((c) => (c.productId ? [c.productId] : [])),
  ]);
  if (!products) return "PRODUCT_INVALID";
  const ingredients = await resolveIngredients(
    tenantId,
    lines.flatMap((c) => (c.ingredientId ? [c.ingredientId] : [])),
  );
  if (!ingredients) return "INGREDIENT_INVALID";
  return { products, ingredients };
}

async function insertLines(
  client: PoolClient,
  recipeId: string,
  lines: RecipeComponentInput[],
  resolved: ResolvedLines,
): Promise<void> {
  for (const c of lines) {
    const ing = c.ingredientId ? resolved.ingredients.get(c.ingredientId) : undefined;
    const productName = c.productId ? resolved.products.get(c.productId) : undefined;
    await client.query(
      `INSERT INTO recipe_components (recipe_id, ingredient_id, product_id, name, unit, qty)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        recipeId,
        c.ingredientId ?? null,
        c.productId ?? null,
        ing?.name ?? productName ?? "Ingredient",
        // A legacy catalogue line stores NULL so it reads back as "pcs" + legacy.
        ing?.unit ?? null,
        c.qty,
      ],
    );
  }
}

export async function createRecipe(
  tenantId: string,
  input: RecipeCreateInput,
): Promise<RecipeWriteResult> {
  const resolved = await resolveLines(tenantId, input.productId, input.components);
  if (typeof resolved === "string") return { ok: false, code: resolved };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const recRes = await client.query<{ id: string }>(
      `INSERT INTO recipes (tenant_id, product_id, output_qty, note, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [tenantId, input.productId, input.outputQty, input.note ?? null, input.isActive ?? true],
    );
    const recipeId = recRes.rows[0].id;
    await insertLines(client, recipeId, input.components, resolved);
    await client.query("COMMIT");
    const recipe = await getRecipe(tenantId, recipeId);
    if (!recipe) throw new Error("Recipe vanished immediately after insert.");
    return { ok: true, recipe };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function updateRecipe(
  tenantId: string,
  id: string,
  input: RecipeUpdateInput,
): Promise<RecipeWriteResult> {
  const existing = await getRecipe(tenantId, id);
  if (!existing) return { ok: false, code: "NOT_FOUND" };

  // Validate any product / ingredient references being introduced.
  const resolved = await resolveLines(tenantId, input.productId, input.components ?? []);
  if (typeof resolved === "string") return { ok: false, code: resolved };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const sets: string[] = [];
    const vals: unknown[] = [];
    const set = (col: string, val: unknown) => {
      sets.push(`${col} = $${sets.length + 3}`);
      vals.push(val);
    };
    if (input.productId !== undefined) set("product_id", input.productId);
    if (input.outputQty !== undefined) set("output_qty", input.outputQty);
    if (input.note !== undefined) set("note", input.note ?? null);
    if (input.isActive !== undefined) set("is_active", input.isActive);
    if (sets.length > 0) {
      sets.push("updated_at = now()");
      await client.query(
        `UPDATE recipes SET ${sets.join(", ")} WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId, ...vals],
      );
    }
    if (input.components) {
      await client.query(`DELETE FROM recipe_components WHERE recipe_id = $1`, [id]);
      await insertLines(client, id, input.components, resolved);
    }
    await client.query("COMMIT");
    const recipe = await getRecipe(tenantId, id);
    if (!recipe) return { ok: false, code: "NOT_FOUND" };
    return { ok: true, recipe };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteRecipe(tenantId: string, id: string): Promise<boolean> {
  const { rowCount } = await query(`DELETE FROM recipes WHERE id = $1 AND tenant_id = $2`, [
    id,
    tenantId,
  ]);
  return (rowCount ?? 0) > 0;
}

// ── Production ────────────────────────────────────────────────────────────────

export type ProduceResult =
  | { ok: true; run: ProductionRunDetail }
  | {
      ok: false;
      code: "NOT_FOUND" | "INACTIVE" | "PRODUCT_GONE" | "COMPONENT_GONE" | "INSUFFICIENT";
      shortage?: { name: string; needed: number; available: number; unit: string };
    };

interface ConsumeLine {
  ingredientId: string | null;
  productId: string | null;
  name: string;
  unit: string;
  qtyConsumed: number;
}

/**
 * Produce `batches` of a recipe atomically:
 *   BEGIN
 *   → lock each ingredient (or legacy product) row FOR UPDATE, verify stock ≥ qty×batches
 *   → if any is short, ROLLBACK and report the offending line
 *   → decrement ingredients, increment the finished good, write the run + items.
 * The locks serialize against concurrent produces/restocks so stock can't go negative.
 */
export async function produce(
  tenantId: string,
  recipeId: string,
  createdBy: string | null,
  input: ProduceInput,
): Promise<ProduceResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const recRes = await client.query<{
      product_id: string | null;
      output_qty: number;
      is_active: boolean;
      product_name: string | null;
    }>(
      `SELECT r.product_id, r.output_qty, r.is_active, p.name AS product_name
         FROM recipes r
         LEFT JOIN products p ON p.id = r.product_id
        WHERE r.id = $1 AND r.tenant_id = $2`,
      [recipeId, tenantId],
    );
    const recipe = recRes.rows[0];
    if (!recipe) {
      await client.query("ROLLBACK");
      return { ok: false, code: "NOT_FOUND" };
    }
    if (!recipe.is_active) {
      await client.query("ROLLBACK");
      return { ok: false, code: "INACTIVE" };
    }
    if (!recipe.product_id) {
      await client.query("ROLLBACK");
      return { ok: false, code: "PRODUCT_GONE" };
    }

    const compRes = await client.query<{
      ingredient_id: string | null;
      product_id: string | null;
      name: string;
      unit: string | null;
      qty: string;
    }>(
      `SELECT ingredient_id, product_id, name, unit, qty FROM recipe_components WHERE recipe_id = $1`,
      [recipeId],
    );

    const consumed: ConsumeLine[] = [];
    for (const c of compRes.rows) {
      const needed = num(num(c.qty) * input.batches);
      const unit = c.unit ?? "pcs";
      let available: number | null = null;
      if (c.ingredient_id) {
        const lock = await client.query<{ stock: string }>(
          `SELECT stock FROM ingredients WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
          [c.ingredient_id, tenantId],
        );
        if (lock.rows[0]) available = num(lock.rows[0].stock);
      } else if (c.product_id) {
        const lock = await client.query<{ stock: number }>(
          `SELECT stock FROM products WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
          [c.product_id, tenantId],
        );
        if (lock.rows[0]) available = lock.rows[0].stock;
      }
      if (available === null) {
        await client.query("ROLLBACK");
        return { ok: false, code: "COMPONENT_GONE", shortage: { name: c.name, needed, available: 0, unit } };
      }
      if (available + 1e-9 < needed) {
        await client.query("ROLLBACK");
        return { ok: false, code: "INSUFFICIENT", shortage: { name: c.name, needed, available, unit } };
      }
      consumed.push({
        ingredientId: c.ingredient_id,
        productId: c.product_id,
        name: c.name,
        unit,
        qtyConsumed: needed,
      });
    }

    const producedUnits = recipe.output_qty * input.batches;

    const seqRes = await client.query<{ next_seq: string }>(
      `INSERT INTO production_counters (tenant_id, next_seq)
       VALUES ($1, (SELECT count(*) FROM production_runs WHERE tenant_id = $1) + 1)
       ON CONFLICT (tenant_id)
         DO UPDATE SET next_seq = production_counters.next_seq + 1, updated_at = now()
       RETURNING next_seq`,
      [tenantId],
    );
    const reference = `PR-${String(Number(seqRes.rows[0].next_seq)).padStart(6, "0")}`;

    const runRes = await client.query<{ id: string }>(
      `INSERT INTO production_runs
         (tenant_id, recipe_id, reference, product_id, product_name, batches, output_qty, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        tenantId,
        recipeId,
        reference,
        recipe.product_id,
        recipe.product_name ?? "Finished good",
        input.batches,
        producedUnits,
        input.note ?? null,
        createdBy,
      ],
    );
    const runId = runRes.rows[0].id;
    for (const c of consumed) {
      await client.query(
        `INSERT INTO production_run_items (run_id, ingredient_id, product_id, name, unit, qty_consumed)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [runId, c.ingredientId, c.productId, c.name, c.unit, c.qtyConsumed],
      );
    }

    // Consume each line (-), then add the finished good (+). Lines were validated
    // under the held locks above, so a refusal here is a logic error, not a race —
    // throw into the ROLLBACK rather than produce from thin air.
    for (const c of consumed) {
      if (c.ingredientId) {
        await client.query(
          `UPDATE ingredients SET stock = greatest(stock - $3, 0), updated_at = now()
            WHERE id = $1 AND tenant_id = $2`,
          [c.ingredientId, tenantId, c.qtyConsumed],
        );
      } else if (c.productId) {
        const moved = await moveStock(client, {
          tenantId,
          productId: c.productId,
          qtyDelta: -c.qtyConsumed,
          reason: "produce_consume",
          refTable: "production_runs",
          refId: runId,
          createdBy,
        });
        if (!moved.ok) throw new Error(`stock ledger refused component ${c.productId}: ${moved.code}`);
      }
    }
    const output = await moveStock(client, {
      tenantId,
      productId: recipe.product_id,
      qtyDelta: producedUnits,
      reason: "produce_output",
      refTable: "production_runs",
      refId: runId,
      createdBy,
    });
    if (!output.ok) throw new Error(`stock ledger refused finished good: ${output.code}`);

    await client.query("COMMIT");
    const run = await getProductionRun(tenantId, runId);
    if (!run) throw new Error("Production run vanished immediately after insert.");
    return { ok: true, run };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

interface RunRow {
  id: string;
  reference: string;
  recipe_id: string | null;
  product_id: string | null;
  product_name: string;
  batches: number;
  output_qty: number;
  note: string | null;
  created_at: Date;
}

function toRunSummary(row: RunRow): ProductionRunSummary {
  return {
    id: row.id,
    reference: row.reference,
    recipeId: row.recipe_id,
    productId: row.product_id,
    productName: row.product_name,
    batches: row.batches,
    outputQty: row.output_qty,
    createdAt: row.created_at.toISOString(),
  };
}

export async function listProductionRuns(tenantId: string): Promise<ProductionRunSummary[]> {
  const { rows } = await query<RunRow>(
    `SELECT id, reference, recipe_id, product_id, product_name, batches, output_qty, note, created_at
       FROM production_runs WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId],
  );
  return rows.map(toRunSummary);
}

export async function getProductionRun(
  tenantId: string,
  id: string,
): Promise<ProductionRunDetail | null> {
  const { rows } = await query<RunRow>(
    `SELECT id, reference, recipe_id, product_id, product_name, batches, output_qty, note, created_at
       FROM production_runs WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  );
  if (!rows[0]) return null;
  const itemsRes = await query<{
    id: string;
    ingredient_id: string | null;
    product_id: string | null;
    name: string;
    unit: string | null;
    qty_consumed: string;
  }>(
    `SELECT id, ingredient_id, product_id, name, unit, qty_consumed
       FROM production_run_items WHERE run_id = $1 ORDER BY lower(name) ASC`,
    [id],
  );
  const items: ProductionRunItem[] = itemsRes.rows.map((i) => ({
    id: i.id,
    ingredientId: i.ingredient_id,
    productId: i.product_id,
    name: i.name,
    unit: i.unit ?? "pcs",
    qtyConsumed: num(i.qty_consumed),
  }));
  return { ...toRunSummary(rows[0]), note: rows[0].note, items };
}

// ── Summary KPIs ──────────────────────────────────────────────────────────────

export interface ManufacturingSummary {
  recipeCount: number;
  buildableNow: number;
  runsThisMonth: number;
  unitsThisMonth: number;
  /** Ingredients at or below their low-stock alert. */
  lowIngredients: number;
}

export async function getManufacturingSummary(tenantId: string): Promise<ManufacturingSummary> {
  const recipes = await listRecipes(tenantId);
  const active = recipes.filter((r) => r.isActive);
  const buildableNow = active.filter((r) => r.maxBatches >= 1).length;

  const [runRes, lowRes] = await Promise.all([
    query<{ runs: number; units: string }>(
      `SELECT count(*)::int AS runs, coalesce(sum(output_qty), 0)::bigint AS units
         FROM production_runs
        WHERE tenant_id = $1
          AND (created_at AT TIME ZONE $2) >= date_trunc('month', now() AT TIME ZONE $2)`,
      [tenantId, MNL],
    ),
    query<{ low: number }>(
      `SELECT count(*)::int AS low FROM ingredients
        WHERE tenant_id = $1 AND low_stock_threshold > 0 AND stock <= low_stock_threshold`,
      [tenantId],
    ),
  ]);

  return {
    recipeCount: active.length,
    buildableNow,
    runsThisMonth: runRes.rows[0].runs,
    unitsThisMonth: Number(runRes.rows[0].units),
    lowIngredients: lowRes.rows[0].low,
  };
}
