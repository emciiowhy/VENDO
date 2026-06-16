"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../Icon";
import { useDashUser } from "../dash/DashShell";
import { formatPesoExact } from "@/lib/format";
import { resolveAssetUrl } from "@/lib/images";
import {
  deleteProduct,
  listCategories,
  listProducts,
  type Category,
  type Product,
} from "@/lib/inventory";
import { categoryLabel } from "./categoryLabel";
import { ProductFormModal } from "./ProductFormModal";
import { CategoryManagerModal } from "./CategoryManagerModal";

/**
 * The Merchant Inventory & Category CRUD Matrix.
 *
 * Loads the signed-in store's catalog (tenant-scoped server-side), and lets
 * staff search, filter by category, add/edit/delete products with images, and
 * manage the nested category tree. Stock at or below each item's configured
 * threshold trips an amber/rose badge and a row tint across the matrix.
 */
export function InventoryMatrix() {
  const store = useDashUser().tenantName ?? "your store";
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [catMgrOpen, setCatMgrOpen] = useState(false);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  // Reusable reload for after a save/delete (called from event handlers).
  const load = useCallback(async () => {
    const [p, c] = await Promise.all([listProducts(), listCategories()]);
    if (p.ok) setProducts(p.products);
    else setLoadError(p.error ?? "Could not load products.");
    if (c.ok) setCategories(c.categories);
    setLoading(false);
  }, []);

  // Initial load on mount — setState happens after the await, with an alive
  // guard so a fast unmount can't set state on an unmounted component.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [p, c] = await Promise.all([listProducts(), listCategories()]);
      if (!alive) return;
      if (p.ok) setProducts(p.products);
      else setLoadError(p.error ?? "Could not load products.");
      if (c.ok) setCategories(c.categories);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (catFilter && p.categoryId !== catFilter) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q);
    });
  }, [products, search, catFilter]);

  const lowCount = useMemo(() => products.filter((p) => p.lowStock).length, [products]);

  async function confirmDelete() {
    if (!deleting) return;
    const res = await deleteProduct(deleting.id);
    const name = deleting.name;
    setDeleting(null);
    if (res.ok) {
      setProducts((prev) => prev.filter((p) => p.id !== deleting.id));
      flash(`Removed “${name}”.`);
    } else {
      flash(res.error ?? "Could not delete.");
    }
  }

  return (
    <div className="space-y-6 max-w-[1180px]">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[1.4rem] font-extrabold tracking-tightest">Inventory</h2>
          <p className="text-[13.5px] text-ink-soft">
            Manage items, prices, categories and stock thresholds for{" "}
            <span className="font-semibold text-ink">{store}</span>.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setCatMgrOpen(true)}
            className="inline-flex items-center gap-2 bg-surface hairline text-ink-soft hover:text-ink hover:border-brand-200 font-semibold text-[14px] px-4 py-2.5 rounded-[10px] transition duration-150"
          >
            <Icon name="layers" className="w-[18px] h-[18px]" strokeWidth={1.7} />
            Categories
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[14px] px-5 py-2.5 rounded-[10px] shadow-btn transition duration-150"
          >
            <Icon name="plus" className="w-[18px] h-[18px]" strokeWidth={2} />
            Add product
          </button>
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat icon="box" label="Products" value={String(products.length)} tone="brand" />
        <Stat icon="bolt" label="Low on stock" value={String(lowCount)} tone={lowCount ? "amber" : "brand"} />
        <Stat icon="layers" label="Categories" value={String(categories.length)} tone="brand" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Icon name="search" className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-ink-faint" strokeWidth={1.7} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or SKU…"
            className="field-input w-full rounded-[10px] pl-10 pr-3.5 py-2.5 text-[14.5px] text-ink"
          />
        </div>
        <div className="relative sm:w-60">
          <Icon name="filter" className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-ink-faint pointer-events-none" strokeWidth={1.7} />
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="field-input w-full rounded-[10px] pl-10 pr-3.5 py-2.5 text-[14.5px] text-ink"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {categoryLabel(c, categories)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Matrix */}
      <div className="rounded-xl2 bg-surface hairline shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="text-[11px] font-bold tracking-wide text-ink-faint uppercase hairline-b">
                <th className="px-5 sm:px-6 py-3">Product</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3 text-center">Stock</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-[13.5px] text-ink-soft">
                    Loading your catalog…
                  </td>
                </tr>
              )}
              {!loading && loadError && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-[13.5px] text-rose-600 font-semibold">
                    {loadError}
                  </td>
                </tr>
              )}
              {!loading && !loadError && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-14 text-center">
                    <div className="text-[14px] font-semibold text-ink">No products found</div>
                    <div className="mt-1 text-[13px] text-ink-soft">
                      {products.length === 0 ? "Add your first product to get started." : "Try a different search or filter."}
                    </div>
                  </td>
                </tr>
              )}
              {filtered.map((p) => {
                const out = p.stock <= 0;
                return (
                  <tr
                    key={p.id}
                    className={
                      "hairline-b last:border-0 transition duration-150 hover:bg-paper/70 " +
                      (out ? "bg-rose-50/40" : p.lowStock ? "bg-amber-50/40" : "")
                    }
                  >
                    <td className="px-5 sm:px-6 py-3">
                      <div className="flex items-center gap-3">
                        <Thumb url={p.imageUrl} name={p.name} />
                        <div className="min-w-0">
                          <div className="text-[14px] font-bold tracking-tight truncate">{p.name}</div>
                          {p.sku && <div className="text-[12px] font-mono text-ink-faint">{p.sku}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {p.categoryName ? (
                        <span className="inline-flex rounded-full bg-brand-50 text-brand-700 px-2.5 py-0.5 text-[11.5px] font-bold tracking-tight">
                          {p.categoryName}
                        </span>
                      ) : (
                        <span className="text-[12.5px] text-ink-faint">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-bold tracking-tight tabular-nums">
                      {formatPesoExact(p.price)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {out ? (
                        <span className="inline-flex rounded-full bg-rose-100 text-rose-700 px-2.5 py-0.5 text-[11.5px] font-bold">
                          Out of stock
                        </span>
                      ) : p.lowStock ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2.5 py-0.5 text-[11.5px] font-bold tabular-nums">
                          {p.stock} left · low
                        </span>
                      ) : (
                        <span className="text-[13.5px] font-semibold tabular-nums text-ink">{p.stock}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={
                          "inline-flex rounded-full px-2.5 py-0.5 text-[11.5px] font-bold tracking-tight " +
                          (p.isActive ? "bg-accent-50 text-accent-600" : "bg-paper text-ink-faint hairline")
                        }
                      >
                        {p.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(p);
                            setFormOpen(true);
                          }}
                          aria-label={`Edit ${p.name}`}
                          className="grid place-items-center w-8 h-8 rounded-[8px] text-ink-faint hover:text-brand-600 hover:bg-brand-50 transition duration-150"
                        >
                          <Icon name="pencil" className="w-[17px] h-[17px]" strokeWidth={1.7} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(p)}
                          aria-label={`Delete ${p.name}`}
                          className="grid place-items-center w-8 h-8 rounded-[8px] text-ink-faint hover:text-rose-600 hover:bg-rose-50 transition duration-150"
                        >
                          <Icon name="trash" className="w-[17px] h-[17px]" strokeWidth={1.7} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {formOpen && (
        <ProductFormModal
          product={editing}
          categories={categories}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            flash(editing ? "Product updated." : "Product added.");
            void load();
          }}
        />
      )}
      {catMgrOpen && (
        <CategoryManagerModal
          categories={categories}
          onClose={() => setCatMgrOpen(false)}
          onChanged={() => void load()}
        />
      )}
      {deleting && (
        <ConfirmDelete
          name={deleting.name}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void confirmDelete()}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[130] bg-ink dark:bg-[#0b1220] text-white text-[13.5px] font-semibold px-4 py-2.5 rounded-[10px] shadow-soft">
          {toast}
        </div>
      )}
    </div>
  );
}

function Thumb({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "—";
  const src = failed ? null : resolveAssetUrl(url);
  return (
    <span className="w-10 h-10 shrink-0 rounded-lg hairline bg-paper overflow-hidden grid place-items-center">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="w-full h-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <span className="text-[11px] font-bold tracking-tight text-ink-faint">{initials}</span>
      )}
    </span>
  );
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: "box" | "bolt" | "layers";
  label: string;
  value: string;
  tone: "brand" | "amber";
}) {
  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card p-4 flex items-center gap-3.5">
      <span
        className={
          "grid place-items-center w-10 h-10 rounded-[12px] " +
          (tone === "amber" ? "bg-amber-50 text-amber-600" : "bg-brand-50 text-brand-600")
        }
      >
        <Icon name={icon} className="w-5 h-5" strokeWidth={1.7} />
      </span>
      <div>
        <div className="text-[1.4rem] leading-none font-extrabold tracking-tightest">{value}</div>
        <div className="mt-1 text-[12.5px] text-ink-soft">{label}</div>
      </div>
    </div>
  );
}

function ConfirmDelete({
  name,
  onCancel,
  onConfirm,
}: {
  name: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center px-4" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" onClick={onCancel} className="fixed inset-0 bg-black/50 backdrop-blur-sm overlay-backdrop" />
      <div className="relative w-full max-w-[380px] rounded-xl2 bg-surface hairline shadow-soft p-6 overlay-card">
        <div className="grid place-items-center w-11 h-11 rounded-[12px] bg-rose-50 text-rose-600">
          <Icon name="trash" className="w-5 h-5" strokeWidth={1.7} />
        </div>
        <h3 className="mt-4 text-[1.1rem] font-extrabold tracking-tight">Delete product?</h3>
        <p className="mt-1.5 text-[13.5px] text-ink-soft leading-relaxed">
          “{name}” will be permanently removed from your catalog. This can’t be undone.
        </p>
        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 rounded-[10px] text-[14px] font-semibold text-ink-soft hover:bg-paper transition duration-150"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="bg-rose-600 hover:bg-rose-700 text-white font-semibold text-[14px] px-5 py-2.5 rounded-[10px] transition duration-150"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
