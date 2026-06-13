import { pool, query } from "../db.js";
import { moveStock } from "../inventory/stockLedger.js";
import type {
  Category,
  CategoryCreateInput,
  CategoryUpdateInput,
  Product,
  ProductCreateInput,
  ProductUpdateInput,
} from "./products.schema.js";

/**
 * Data access for inventory. EVERY query is scoped by `tenantId` — passed in
 * from the caller, which reads it from the verified JWT session (never from the
 * request body). Writes match on `id AND tenant_id`, so a Merchant can neither
 * read nor mutate another Tenant's catalog even with a guessed id.
 */

// ── Categories ─────────────────────────────────────────────────────────────

interface CategoryRow {
  id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
  created_at: Date;
}

function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    sortOrder: row.sort_order,
    createdAt: row.created_at.toISOString(),
  };
}

export async function listCategories(tenantId: string): Promise<Category[]> {
  const { rows } = await query<CategoryRow>(
    `SELECT id, parent_id, name, sort_order, created_at
       FROM categories
      WHERE tenant_id = $1
      ORDER BY sort_order ASC, lower(name) ASC`,
    [tenantId],
  );
  return rows.map(toCategory);
}

export async function createCategory(
  tenantId: string,
  input: CategoryCreateInput,
): Promise<Category> {
  const { rows } = await query<CategoryRow>(
    `INSERT INTO categories (tenant_id, name, parent_id, sort_order)
     VALUES ($1, $2, $3, $4)
     RETURNING id, parent_id, name, sort_order, created_at`,
    [tenantId, input.name, input.parentId ?? null, input.sortOrder ?? 0],
  );
  return toCategory(rows[0]);
}

export async function updateCategory(
  tenantId: string,
  id: string,
  input: CategoryUpdateInput,
): Promise<Category | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  const set = (col: string, val: unknown) => {
    sets.push(`${col} = $${sets.length + 3}`);
    vals.push(val);
  };
  if (input.name !== undefined) set("name", input.name);
  if (input.parentId !== undefined) set("parent_id", input.parentId);
  if (input.sortOrder !== undefined) set("sort_order", input.sortOrder);
  if (sets.length === 0) return getCategory(tenantId, id);

  const { rows } = await query<CategoryRow>(
    `UPDATE categories SET ${sets.join(", ")}
      WHERE id = $1 AND tenant_id = $2
      RETURNING id, parent_id, name, sort_order, created_at`,
    [id, tenantId, ...vals],
  );
  return rows[0] ? toCategory(rows[0]) : null;
}

async function getCategory(tenantId: string, id: string): Promise<Category | null> {
  const { rows } = await query<CategoryRow>(
    `SELECT id, parent_id, name, sort_order, created_at
       FROM categories WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  );
  return rows[0] ? toCategory(rows[0]) : null;
}

export async function deleteCategory(tenantId: string, id: string): Promise<boolean> {
  // Products in this category fall back to uncategorised (FK ON DELETE SET NULL).
  const { rowCount } = await query(
    `DELETE FROM categories WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  );
  return (rowCount ?? 0) > 0;
}

// ── Products ────────────────────────────────────────────────────────────────

interface ProductRow {
  id: string;
  category_id: string | null;
  category_name: string | null;
  name: string;
  sku: string | null;
  price_cents: number;
  stock: number;
  low_stock_threshold: number;
  image_url: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    name: row.name,
    sku: row.sku,
    priceCents: row.price_cents,
    price: row.price_cents / 100,
    stock: row.stock,
    lowStockThreshold: row.low_stock_threshold,
    lowStock: row.low_stock_threshold > 0 && row.stock <= row.low_stock_threshold,
    imageUrl: row.image_url,
    isActive: row.is_active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const PRODUCT_COLUMNS = `p.id, p.category_id, p.name, p.sku, p.price_cents, p.stock,
  p.low_stock_threshold, p.image_url, p.is_active, p.created_at, p.updated_at,
  c.name AS category_name`;

export async function listProducts(tenantId: string): Promise<Product[]> {
  const { rows } = await query<ProductRow>(
    `SELECT ${PRODUCT_COLUMNS}
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.tenant_id = $1
      ORDER BY p.created_at DESC`,
    [tenantId],
  );
  return rows.map(toProduct);
}

export async function getProduct(tenantId: string, id: string): Promise<Product | null> {
  const { rows } = await query<ProductRow>(
    `SELECT ${PRODUCT_COLUMNS}
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.id = $1 AND p.tenant_id = $2`,
    [id, tenantId],
  );
  return rows[0] ? toProduct(rows[0]) : null;
}

export async function createProduct(
  tenantId: string,
  input: ProductCreateInput,
  imageUrl: string | null,
  createdBy: string | null = null,
): Promise<Product> {
  // The product is inserted at stock 0, then any opening quantity is posted as a
  // `count` movement through the ledger. This keeps the invariant — cached stock
  // always equals SUM(ledger deltas) — true from a product's very first row, so
  // the drift check never false-flags a freshly created item.
  const client = await pool.connect();
  let newId: string;
  try {
    await client.query("BEGIN");
    const ins = await client.query<{ id: string }>(
      `INSERT INTO products
         (tenant_id, name, sku, category_id, price_cents, stock, low_stock_threshold, image_url, is_active)
       VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8)
       RETURNING id`,
      [
        tenantId,
        input.name,
        input.sku ?? null,
        input.categoryId ?? null,
        input.price,
        input.lowStockThreshold,
        imageUrl,
        input.isActive ?? true,
      ],
    );
    newId = ins.rows[0].id;
    if (input.stock > 0) {
      const moved = await moveStock(client, {
        tenantId,
        productId: newId,
        qtyDelta: input.stock,
        reason: "count",
        note: "Opening stock",
        createdBy,
      });
      if (!moved.ok) throw new Error(`stock ledger refused opening stock: ${moved.code}`);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  const created = await getProduct(tenantId, newId);
  if (!created) throw new Error("Product vanished immediately after insert.");
  return created;
}

export async function updateProduct(
  tenantId: string,
  id: string,
  input: ProductUpdateInput,
  imageUrl: string | null | undefined,
  editedBy: string | null = null,
): Promise<Product | null> {
  // `stock` is never written as a raw overwrite — an owner editing on-hand is a
  // physical recount, so it goes through the ledger as a signed `adjust` delta
  // (new − old). Everything else is a plain column update. When stock is in the
  // payload we run both inside one transaction so the column and the journal
  // move together; otherwise we keep the cheap single-statement path.
  const sets: string[] = [];
  const vals: unknown[] = [];
  const set = (col: string, val: unknown) => {
    sets.push(`${col} = $${sets.length + 3}`);
    vals.push(val);
  };
  if (input.name !== undefined) set("name", input.name);
  if (input.sku !== undefined) set("sku", input.sku ?? null);
  if (input.categoryId !== undefined) set("category_id", input.categoryId);
  if (input.price !== undefined) set("price_cents", input.price);
  if (input.lowStockThreshold !== undefined) set("low_stock_threshold", input.lowStockThreshold);
  if (input.isActive !== undefined) set("is_active", input.isActive);
  if (imageUrl !== undefined) set("image_url", imageUrl);

  const stockRequested = input.stock !== undefined;

  if (!stockRequested) {
    if (sets.length === 0) return getProduct(tenantId, id);
    sets.push("updated_at = now()");
    const { rows } = await query<{ id: string }>(
      `UPDATE products SET ${sets.join(", ")}
        WHERE id = $1 AND tenant_id = $2
        RETURNING id`,
      [id, tenantId, ...vals],
    );
    if (!rows[0]) return null;
    return getProduct(tenantId, id);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock + read current stock so the adjust delta is computed race-free against
    // concurrent sales/receives. moveStock re-locks the same row in this txn.
    const cur = await client.query<{ stock: number }>(
      `SELECT stock FROM products WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [id, tenantId],
    );
    if (!cur.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }

    if (sets.length > 0) {
      sets.push("updated_at = now()");
      await client.query(
        `UPDATE products SET ${sets.join(", ")} WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId, ...vals],
      );
    }

    const delta = (input.stock as number) - cur.rows[0].stock;
    const moved = await moveStock(client, {
      tenantId,
      productId: id,
      qtyDelta: delta,
      reason: "adjust",
      note: "Manual stock edit",
      createdBy: editedBy,
    });
    if (!moved.ok) {
      await client.query("ROLLBACK");
      // NEGATIVE can't happen (target stock is validated >= 0 by the schema);
      // GONE was ruled out by the locked read above. Treat as not-found.
      return null;
    }

    await client.query("COMMIT");
    return getProduct(tenantId, id);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Delete a product, returning its old image URL (if any) for cleanup. */
export async function deleteProduct(
  tenantId: string,
  id: string,
): Promise<{ imageUrl: string | null } | null> {
  const { rows } = await query<{ image_url: string | null }>(
    `DELETE FROM products WHERE id = $1 AND tenant_id = $2 RETURNING image_url`,
    [id, tenantId],
  );
  return rows[0] ? { imageUrl: rows[0].image_url } : null;
}
