"use client";

import { useState } from "react";
import { Icon } from "../Icon";
import { ImagePicker } from "./ImagePicker";
import { categoryLabel } from "./categoryLabel";
import {
  createProduct,
  updateProduct,
  type Category,
  type Product,
  type ProductFields,
} from "@/lib/inventory";

const FIELD_INPUT = "field-input w-full rounded-[10px] px-3.5 py-2.5 text-[14.5px] text-ink";

/**
 * Create / edit a product. Standard fields use the shared `.field-input` look
 * (#FBFCFE rest state, brand focus ring); the image rides along as multipart.
 * On save the parent refetches so the matrix and badges stay truthful.
 */
export function ProductFormModal({
  product,
  categories,
  onClose,
  onSaved,
}: {
  product: Product | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!product;
  const [name, setName] = useState(product?.name ?? "");
  const [sku, setSku] = useState(product?.sku ?? "");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  const [price, setPrice] = useState(product ? String(product.price) : "");
  const [stock, setStock] = useState(product ? String(product.stock) : "0");
  const [threshold, setThreshold] = useState(product ? String(product.lowStockThreshold) : "0");
  const [isActive, setIsActive] = useState(product?.isActive ?? true);

  const [file, setFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const fields: ProductFields = {
      name,
      sku,
      categoryId,
      price,
      stock,
      lowStockThreshold: threshold,
      isActive,
    };

    const res = editing
      ? await updateProduct(product.id, fields, file, removeImage)
      : await createProduct(fields, file);

    if (res.ok) {
      onSaved();
      return;
    }
    setSubmitting(false);
    if (res.errors) setFieldErrors(res.errors);
    setError(res.error ?? (res.errors ? "Please fix the highlighted fields." : "Could not save."));
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center px-4 py-8 overflow-y-auto" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" onClick={onClose} className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <form
        onSubmit={submit}
        className="relative w-full max-w-[560px] rounded-xl2 bg-surface hairline shadow-soft"
      >
        <div className="flex items-center justify-between px-6 py-4 hairline-b">
          <h3 className="text-[1.15rem] font-extrabold tracking-tightest">
            {editing ? "Edit product" : "Add product"}
          </h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-ink-faint hover:text-ink transition p-1">
            <Icon name="x" className="w-5 h-5" strokeWidth={1.8} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <ImagePicker
            name={name}
            existingUrl={removeImage ? null : product?.imageUrl ?? null}
            file={file}
            onPick={(f) => {
              setFile(f);
              setRemoveImage(false);
            }}
            onRemove={() => {
              setFile(null);
              setRemoveImage(true);
            }}
          />

          <Field label="Product name" error={fieldErrors.name}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Spanish Latte 16oz"
              className={FIELD_INPUT}
              autoFocus
            />
          </Field>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="SKU (optional)" error={fieldErrors.sku}>
              <input
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="KNJ-ESP-002"
                className={FIELD_INPUT}
              />
            </Field>
            <Field label="Category" error={fieldErrors.categoryId}>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={FIELD_INPUT}>
                <option value="">Uncategorised</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {categoryLabel(c, categories)}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Price" error={fieldErrors.price}>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint text-[14.5px]">₱</span>
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))}
                  inputMode="decimal"
                  placeholder="0.00"
                  className={FIELD_INPUT + " pl-7"}
                />
              </div>
            </Field>
            <Field label="Stock on hand" error={fieldErrors.stock}>
              <input
                value={stock}
                onChange={(e) => setStock(e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                className={FIELD_INPUT}
              />
            </Field>
            <Field label="Low-stock at" error={fieldErrors.lowStockThreshold}>
              <input
                value={threshold}
                onChange={(e) => setThreshold(e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                className={FIELD_INPUT}
              />
            </Field>
          </div>

          {/* Active toggle */}
          <button
            type="button"
            onClick={() => setIsActive((v) => !v)}
            className="flex items-center gap-3 group"
          >
            <span
              className={
                "relative w-10 h-6 rounded-full transition duration-150 " +
                (isActive ? "bg-accent-500" : "bg-ink/15")
              }
            >
              <span
                className={
                  "absolute top-0.5 w-5 h-5 rounded-full bg-surface shadow-sm transition duration-150 " +
                  (isActive ? "left-[18px]" : "left-0.5")
                }
              />
            </span>
            <span className="text-[14px] font-semibold text-ink">
              {isActive ? "Active — sold at POS" : "Inactive — hidden from POS"}
            </span>
          </button>

          {error && (
            <p className="text-[13px] font-semibold text-rose-600 bg-rose-50 rounded-[10px] px-3.5 py-2.5">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 hairline-t">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-[10px] text-[14px] font-semibold text-ink-soft hover:bg-paper transition duration-150"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[14px] px-5 py-2.5 rounded-[10px] shadow-btn transition duration-150 disabled:opacity-60"
          >
            <Icon name="check" className="w-[18px] h-[18px]" strokeWidth={2} />
            {submitting ? "Saving…" : editing ? "Save changes" : "Add product"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[13px] font-semibold text-ink-soft mb-1.5">{label}</span>
      {children}
      {error && <span className="block mt-1 text-[12px] font-semibold text-rose-600">{error}</span>}
    </label>
  );
}
