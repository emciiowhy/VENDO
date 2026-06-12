import { pool, query } from "../db.js";
import type {
  ProduceInput,
  ProductionRunDetail,
  ProductionRunItem,
  ProductionRunSummary,
  Recipe,
  RecipeComponent,
  RecipeCreateInput,
  RecipeUpdateInput,
} from "./manufacturing.schema.js";

/**
 * Data access for Manufacturing. EVERY query is scoped by `tenantId` (read from
 * the verified JWT session, never the request body). Producing a batch runs in
 * one transaction that decrements each component's `products.stock` and
 * increments the finished good's — the manufacturing counterpart of a POS sale
 * + a PO receive combined (see pos.repository.createOrder /
 * procurement.repository.receivePurchaseOrder).
 */
const MNL = "Asia/Manila";

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
  product_id: string | null;
  name: string;
  qty: number;
  product_stock: number | null;
}

function buildableBatches(components: RecipeComponent[]): number {
  if (components.length === 0) return 0;
  let max = Infinity;
  for (const c of components) {
    // A component whose product was deleted (stock null) blocks production.
    const possible = c.productId ? Math.floor(c.stock / c.qty) : 0;
    if (possible < max) max = possible;
  }
  return Number.isFinite(max) ? Math.max(0, max) : 0;
}

function assembleRecipe(row: RecipeRow, comps: ComponentRow[]): Recipe {
  const components: RecipeComponent[] = comps.map((c) => ({
    id: c.id,
    productId: c.product_id,
    name: c.name,
    qty: c.qty,
    stock: c.product_stock ?? 0,
  }));
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
    `SELECT rc.id, rc.recipe_id, rc.product_id, rc.name, rc.qty, pr.stock AS product_stock
       FROM recipe_components rc
       LEFT JOIN products pr ON pr.id = rc.product_id
      WHERE rc.recipe_id = ANY($1::uuid[])
      ORDER BY lower(rc.name) ASC`,
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
  | { ok: false; code: "PRODUCT_INVALID" | "NOT_FOUND" };

/** Resolve product ids to {id → name} within the Tenant; null if any is foreign. */
async function resolveNames(
  tenantId: string,
  ids: string[],
): Promise<Map<string, string> | null> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { rows } = await query<{ id: string; name: string }>(
    `SELECT id, name FROM products WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
    [tenantId, unique],
  );
  if (rows.length !== unique.length) return null; // some id isn't ours / doesn't exist
  return new Map(rows.map((r) => [r.id, r.name]));
}

export async function createRecipe(
  tenantId: string,
  input: RecipeCreateInput,
): Promise<RecipeWriteResult> {
  const names = await resolveNames(tenantId, [
    input.productId,
    ...input.components.map((c) => c.productId),
  ]);
  if (!names) return { ok: false, code: "PRODUCT_INVALID" };

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
    for (const c of input.components) {
      await client.query(
        `INSERT INTO recipe_components (recipe_id, product_id, name, qty)
         VALUES ($1, $2, $3, $4)`,
        [recipeId, c.productId, names.get(c.productId) ?? "Component", c.qty],
      );
    }
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

  // Validate any product references being introduced.
  const refIds = [
    ...(input.productId ? [input.productId] : []),
    ...(input.components ? input.components.map((c) => c.productId) : []),
  ];
  const names = await resolveNames(tenantId, refIds);
  if (!names) return { ok: false, code: "PRODUCT_INVALID" };

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
      for (const c of input.components) {
        await client.query(
          `INSERT INTO recipe_components (recipe_id, product_id, name, qty)
           VALUES ($1, $2, $3, $4)`,
          [id, c.productId, names.get(c.productId) ?? "Component", c.qty],
        );
      }
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
      shortage?: { name: string; needed: number; available: number };
    };

/**
 * Produce `batches` of a recipe atomically:
 *   BEGIN
 *   → lock each component product row (FOR UPDATE), verify stock ≥ qty×batches
 *   → if any is short, ROLLBACK and report the offending component
 *   → decrement components, increment the finished good, write the run + items.
 * The locks serialize against concurrent sells/produces so stock can't go negative.
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

    const compRes = await client.query<{ product_id: string | null; name: string; qty: number }>(
      `SELECT product_id, name, qty FROM recipe_components WHERE recipe_id = $1`,
      [recipeId],
    );

    const consumed: { productId: string; name: string; qtyConsumed: number }[] = [];
    for (const c of compRes.rows) {
      if (!c.product_id) {
        await client.query("ROLLBACK");
        return { ok: false, code: "COMPONENT_GONE", shortage: { name: c.name, needed: 0, available: 0 } };
      }
      const needed = c.qty * input.batches;
      const lock = await client.query<{ stock: number }>(
        `SELECT stock FROM products WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [c.product_id, tenantId],
      );
      const available = lock.rows[0]?.stock ?? 0;
      if (!lock.rows[0]) {
        await client.query("ROLLBACK");
        return { ok: false, code: "COMPONENT_GONE", shortage: { name: c.name, needed, available: 0 } };
      }
      if (available < needed) {
        await client.query("ROLLBACK");
        return { ok: false, code: "INSUFFICIENT", shortage: { name: c.name, needed, available } };
      }
      consumed.push({ productId: c.product_id, name: c.name, qtyConsumed: needed });
    }

    // Decrement components, increment the finished good (under the held locks).
    for (const c of consumed) {
      await client.query(
        `UPDATE products SET stock = stock - $1, updated_at = now() WHERE id = $2 AND tenant_id = $3`,
        [c.qtyConsumed, c.productId, tenantId],
      );
    }
    const producedUnits = recipe.output_qty * input.batches;
    await client.query(
      `UPDATE products SET stock = stock + $1, updated_at = now() WHERE id = $2 AND tenant_id = $3`,
      [producedUnits, recipe.product_id, tenantId],
    );

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
        `INSERT INTO production_run_items (run_id, product_id, name, qty_consumed)
         VALUES ($1, $2, $3, $4)`,
        [runId, c.productId, c.name, c.qtyConsumed],
      );
    }

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
  const itemsRes = await query<{ id: string; product_id: string | null; name: string; qty_consumed: number }>(
    `SELECT id, product_id, name, qty_consumed FROM production_run_items WHERE run_id = $1 ORDER BY lower(name) ASC`,
    [id],
  );
  const items: ProductionRunItem[] = itemsRes.rows.map((i) => ({
    id: i.id,
    productId: i.product_id,
    name: i.name,
    qtyConsumed: i.qty_consumed,
  }));
  return { ...toRunSummary(rows[0]), note: rows[0].note, items };
}

// ── Summary KPIs ──────────────────────────────────────────────────────────────

export interface ManufacturingSummary {
  recipeCount: number;
  buildableNow: number;
  runsThisMonth: number;
  unitsThisMonth: number;
}

export async function getManufacturingSummary(tenantId: string): Promise<ManufacturingSummary> {
  const recipes = await listRecipes(tenantId);
  const active = recipes.filter((r) => r.isActive);
  const buildableNow = active.filter((r) => r.maxBatches >= 1).length;

  const runRes = await query<{ runs: number; units: string }>(
    `SELECT count(*)::int AS runs, coalesce(sum(output_qty), 0)::bigint AS units
       FROM production_runs
      WHERE tenant_id = $1
        AND (created_at AT TIME ZONE $2) >= date_trunc('month', now() AT TIME ZONE $2)`,
    [tenantId, MNL],
  );

  return {
    recipeCount: active.length,
    buildableNow,
    runsThisMonth: runRes.rows[0].runs,
    unitsThisMonth: Number(runRes.rows[0].units),
  };
}
