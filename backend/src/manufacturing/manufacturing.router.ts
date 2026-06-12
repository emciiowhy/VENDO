import { Router, type Request, type Response } from "express";
import type { ZodError } from "zod";
import { requireRole } from "../auth/auth.middleware.js";
import { produceSchema, recipeCreateSchema, recipeUpdateSchema } from "./manufacturing.schema.js";
import {
  createRecipe,
  deleteRecipe,
  getManufacturingSummary,
  getRecipe,
  listProductionRuns,
  listRecipes,
  produce,
  updateRecipe,
  type ProduceResult,
  type RecipeWriteResult,
} from "./manufacturing.repository.js";

/**
 * Merchant Manufacturing — recipes (BOM) + production runs.
 *
 * Fenced to store staff (MERCHANT_OWNER / MANAGER). Tenant scope comes only from
 * the verified session (`req.user.tenantId`); producing moves catalogue stock.
 */
export const manufacturingRouter = Router();

manufacturingRouter.use(requireRole("MERCHANT_OWNER", "MANAGER"));

function fieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

function tenantOf(req: Request): string | null {
  return req.user?.tenantId ?? null;
}

function noTenant(res: Response) {
  return res.status(403).json({ ok: false, error: "No store is associated with this account." });
}

/** Map a recipe write result to a response (PRODUCT_INVALID → 400, etc). */
function sendRecipe(res: Response, result: RecipeWriteResult, createdStatus = 200) {
  if (result.ok) return res.status(createdStatus).json({ ok: true, recipe: result.recipe });
  if (result.code === "NOT_FOUND") return res.status(404).json({ ok: false, error: "Recipe not found." });
  return res.status(400).json({
    ok: false,
    error: "One or more selected products aren't in your catalogue.",
  });
}

// ── Summary ──────────────────────────────────────────────────────────────────

manufacturingRouter.get("/summary", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    res.json({ ok: true, summary: await getManufacturingSummary(tenantId) });
  } catch (err) {
    console.error("[manufacturing] summary failed:", err);
    res.status(500).json({ ok: false, error: "Could not load your manufacturing summary." });
  }
});

// ── Recipes ────────────────────────────────────────────────────────────────

manufacturingRouter.get("/recipes", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    res.json({ ok: true, recipes: await listRecipes(tenantId) });
  } catch (err) {
    console.error("[manufacturing] list recipes failed:", err);
    res.status(500).json({ ok: false, error: "Could not load recipes." });
  }
});

manufacturingRouter.get("/recipes/:id", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    const recipe = await getRecipe(tenantId, req.params.id);
    if (!recipe) return res.status(404).json({ ok: false, error: "Recipe not found." });
    res.json({ ok: true, recipe });
  } catch (err) {
    console.error("[manufacturing] get recipe failed:", err);
    res.status(500).json({ ok: false, error: "Could not load the recipe." });
  }
});

manufacturingRouter.post("/recipes", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const parsed = recipeCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, errors: fieldErrors(parsed.error) });
  try {
    sendRecipe(res, await createRecipe(tenantId, parsed.data), 201);
  } catch (err) {
    console.error("[manufacturing] create recipe failed:", err);
    res.status(500).json({ ok: false, error: "Could not create the recipe." });
  }
});

manufacturingRouter.patch("/recipes/:id", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const parsed = recipeUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, errors: fieldErrors(parsed.error) });
  try {
    sendRecipe(res, await updateRecipe(tenantId, req.params.id, parsed.data));
  } catch (err) {
    console.error("[manufacturing] update recipe failed:", err);
    res.status(500).json({ ok: false, error: "Could not update the recipe." });
  }
});

manufacturingRouter.delete("/recipes/:id", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    const ok = await deleteRecipe(tenantId, req.params.id);
    if (!ok) return res.status(404).json({ ok: false, error: "Recipe not found." });
    res.json({ ok: true });
  } catch (err) {
    console.error("[manufacturing] delete recipe failed:", err);
    res.status(500).json({ ok: false, error: "Could not delete the recipe." });
  }
});

// ── Production ────────────────────────────────────────────────────────────────

manufacturingRouter.get("/runs", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    res.json({ ok: true, runs: await listProductionRuns(tenantId) });
  } catch (err) {
    console.error("[manufacturing] list runs failed:", err);
    res.status(500).json({ ok: false, error: "Could not load production history." });
  }
});

manufacturingRouter.post("/recipes/:id/produce", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const parsed = produceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, errors: fieldErrors(parsed.error) });
  try {
    sendProduce(res, await produce(tenantId, req.params.id, req.user?.userId ?? null, parsed.data));
  } catch (err) {
    console.error("[manufacturing] produce failed:", err);
    res.status(500).json({ ok: false, error: "Could not record the production run." });
  }
});

function sendProduce(res: Response, result: ProduceResult) {
  if (result.ok) return res.status(201).json({ ok: true, run: result.run });
  switch (result.code) {
    case "NOT_FOUND":
      return res.status(404).json({ ok: false, error: "Recipe not found." });
    case "INACTIVE":
      return res.status(409).json({ ok: false, error: "This recipe is archived — reactivate it to produce." });
    case "PRODUCT_GONE":
      return res.status(409).json({ ok: false, error: "The finished product is no longer in your catalogue." });
    case "COMPONENT_GONE":
      return res.status(409).json({
        ok: false,
        error: `A component (${result.shortage?.name ?? "unknown"}) is no longer in your catalogue.`,
      });
    case "INSUFFICIENT":
      return res.status(409).json({
        ok: false,
        code: "INSUFFICIENT",
        error: `Not enough ${result.shortage?.name}: need ${result.shortage?.needed}, have ${result.shortage?.available}.`,
        shortage: result.shortage,
      });
    default:
      return res.status(409).json({ ok: false, error: "Could not produce this recipe." });
  }
}
