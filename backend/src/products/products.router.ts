import { Router, type Request, type Response } from "express";
import type { ZodError } from "zod";
import { requireRole } from "../auth/auth.middleware.js";
import { uploadProductImage } from "./products.upload.js";
import { putProductImage, removeProductImage } from "./products.storage.js";
import {
  categoryCreateSchema,
  categoryUpdateSchema,
  productCreateSchema,
  productUpdateSchema,
} from "./products.schema.js";
import {
  createCategory,
  createProduct,
  deleteCategory,
  deleteProduct,
  getProduct,
  listCategories,
  listProducts,
  updateCategory,
  updateProduct,
} from "./products.repository.js";
import { countProducts, getTenantPlan } from "../billing/billing.repository.js";
import { PLAN_SPECS, productLimitFor } from "../billing/plans.js";

/**
 * Merchant Inventory & Category CRUD Matrix.
 *
 * Fenced to store staff (MERCHANT_OWNER / MANAGER). The tenant scope comes
 * exclusively from the verified session — `req.user.tenantId` — and is threaded
 * into every repository call, so the API surface itself enforces row isolation.
 */
export const productsRouter = Router();

productsRouter.use(requireRole("MERCHANT_OWNER", "MANAGER"));

/** First field-level error per key, mirroring the leads seam's shape. */
function fieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !out[key]) out[key] = issue.message;
  }
  return out;
}

/** The active Tenant for this request, or null if (defensively) unscoped. */
function tenantOf(req: Request): string | null {
  return req.user?.tenantId ?? null;
}

function noTenant(res: Response) {
  return res.status(403).json({ ok: false, error: "No store is associated with this account." });
}

// ── Categories ─────────────────────────────────────────────────────────────

productsRouter.get("/categories", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    res.json({ ok: true, categories: await listCategories(tenantId) });
  } catch (err) {
    console.error("[inventory] list categories failed:", err);
    res.status(500).json({ ok: false, error: "Could not load categories." });
  }
});

productsRouter.post("/categories", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const parsed = categoryCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, errors: fieldErrors(parsed.error) });
  try {
    res.status(201).json({ ok: true, category: await createCategory(tenantId, parsed.data) });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ ok: false, error: "A category with that name already exists." });
    }
    console.error("[inventory] create category failed:", err);
    res.status(500).json({ ok: false, error: "Could not create the category." });
  }
});

productsRouter.patch("/categories/:id", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const parsed = categoryUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, errors: fieldErrors(parsed.error) });
  try {
    const category = await updateCategory(tenantId, req.params.id, parsed.data);
    if (!category) return res.status(404).json({ ok: false, error: "Category not found." });
    res.json({ ok: true, category });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ ok: false, error: "A category with that name already exists." });
    }
    console.error("[inventory] update category failed:", err);
    res.status(500).json({ ok: false, error: "Could not update the category." });
  }
});

productsRouter.delete("/categories/:id", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    const ok = await deleteCategory(tenantId, req.params.id);
    if (!ok) return res.status(404).json({ ok: false, error: "Category not found." });
    res.json({ ok: true });
  } catch (err) {
    console.error("[inventory] delete category failed:", err);
    res.status(500).json({ ok: false, error: "Could not delete the category." });
  }
});

// ── Products ─────────────────────────────────────────────────────────────────

productsRouter.get("/products", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    res.json({ ok: true, products: await listProducts(tenantId) });
  } catch (err) {
    console.error("[inventory] list products failed:", err);
    res.status(500).json({ ok: false, error: "Could not load products." });
  }
});

productsRouter.post("/products", uploadProductImage, async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const parsed = productCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, errors: fieldErrors(parsed.error) });

  try {
    // Subscription guardrail: a Tenant may only hold as many products as its
    // plan allows. Checked BEFORE touching storage so an over-limit request
    // never leaves an orphaned upload behind.
    const plan = await getTenantPlan(tenantId);
    const limit = productLimitFor(plan);
    if (limit !== null) {
      const current = await countProducts(tenantId);
      if (current >= limit) {
        return res.status(403).json({
          ok: false,
          code: "plan_limit_exceeded",
          error: `Your ${PLAN_SPECS[plan].label} plan allows up to ${limit} products. Upgrade to add more.`,
          plan,
          limit,
          current,
        });
      }
    }

    // Only stream the image to storage once the rest of the payload is valid.
    const imageUrl = req.file ? await putProductImage(req.file.buffer, req.file.mimetype) : null;
    res.status(201).json({ ok: true, product: await createProduct(tenantId, parsed.data, imageUrl) });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ ok: false, error: "A product with that SKU already exists." });
    }
    console.error("[inventory] create product failed:", err);
    res.status(500).json({ ok: false, error: "Could not create the product." });
  }
});

productsRouter.patch("/products/:id", uploadProductImage, async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const parsed = productUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, errors: fieldErrors(parsed.error) });

  try {
    const existing = await getProduct(tenantId, req.params.id);
    if (!existing) return res.status(404).json({ ok: false, error: "Product not found." });

    // image_url resolution: new upload > explicit removal > leave unchanged.
    let imageUrl: string | null | undefined;
    if (req.file) {
      imageUrl = await putProductImage(req.file.buffer, req.file.mimetype);
    } else if (String((req.body as { removeImage?: unknown }).removeImage) === "true") {
      imageUrl = null;
    }

    const product = await updateProduct(tenantId, req.params.id, parsed.data, imageUrl);
    if (!product) return res.status(404).json({ ok: false, error: "Product not found." });

    // Drop the superseded image once the row points elsewhere.
    if (imageUrl !== undefined && existing.imageUrl && existing.imageUrl !== imageUrl) {
      void removeProductImage(existing.imageUrl);
    }
    res.json({ ok: true, product });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ ok: false, error: "A product with that SKU already exists." });
    }
    console.error("[inventory] update product failed:", err);
    res.status(500).json({ ok: false, error: "Could not update the product." });
  }
});

productsRouter.delete("/products/:id", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    const deleted = await deleteProduct(tenantId, req.params.id);
    if (!deleted) return res.status(404).json({ ok: false, error: "Product not found." });
    void removeProductImage(deleted.imageUrl);
    res.json({ ok: true });
  } catch (err) {
    console.error("[inventory] delete product failed:", err);
    res.status(500).json({ ok: false, error: "Could not delete the product." });
  }
});

/** Postgres unique-constraint violation (duplicate SKU / category name). */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}
