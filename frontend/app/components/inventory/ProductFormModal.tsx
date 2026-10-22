"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { ImagePicker } from "./ImagePicker";
import { categoryLabel } from "./categoryLabel";
import {
  createProduct,
  updateProduct,
  type Category,
  type Product,
  type ProductFields,
  type StockReason,
  STOCK_REASONS,
} from "@/lib/inventory";
import { VAT_CLASS_HINTS, VAT_CLASS_LABELS, previewVatCents, type VatClass } from "@/lib/pos";
import { getReceipt } from "@/lib/account";
import { formatPesoExact } from "@/lib/format";

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
  // The store's VAT status, for the price helper (null until loaded).
  const [vatRegistered, setVatRegistered] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getReceipt();
      if (alive && res.ok) setVatRegistered(res.settings.vatRegistered !== false);
    })();
    return () => {
      alive = false;
    };
  }, []);
  const [stock, setStock] = useState(product ? String(product.stock) : "0");
  // Editing on-hand stock is a logged adjustment; the reason goes on the ledger.
  const [stockReason, setStockReason] = useState<StockReason>("Restock");
  const stockChanged = editing && Number(stock || 0) !== product.stock;
  const [threshold, setThreshold] = useState(product ? String(product.lowStockThreshold) : "0");
  const [vatClass, setVatClass] = useState<VatClass>(product?.vatClass ?? "VATABLE");
  const [isActive, setIsActive] = useState(product?.isActive ?? true);
  const [scPwdEligible, setScPwdEligible] = useState(product?.scPwdEligible ?? true);

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
      ...(stockChanged ? { stockReason } : {}),
      lowStockThreshold: threshold,
      vatClass,
      isActive,
      scPwdEligible,
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
      <button type="button" aria-label="Close" onClick={onClose} className="fixed inset-0 bg-black/50 backdrop-blur-sm overlay-backdrop" />
      <form
        onSubmit={submit}
        className="relative w-full max-w-[560px] rounded-xl2 bg-surface hairline shadow-soft overlay-card"
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
            maxBytes={10 * 1024 * 1024}
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

          <fieldset>
            <legend className="text-[13px] font-semibold text-ink-soft mb-1.5">Is this product VATable?</legend>
            {/* Native radios: arrow keys, one tab stop, and the same announcement
                on VoiceOver (iOS) and TalkBack (Android). The card is the label. */}
            <div className="grid sm:grid-cols-3 gap-2">
              {(Object.keys(VAT_CLASS_LABELS) as VatClass[]).map((k) => {
                const on = vatClass === k;
                return (
                  <label
                    key={k}
                    className={
                      "tap relative flex items-start gap-2.5 min-h-[44px] rounded-[12px] px-3.5 py-2.5 cursor-pointer transition has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand-200 " +
                      (on
                        ? "bg-brand-50 border border-brand-500 text-ink"
                        : "bg-surface hairline text-ink-soft hover:border-brand-300")
                    }
                  >
                    <input
                      type="radio"
                      name="vatClass"
                      value={k}
                      checked={on}
                      onChange={() => setVatClass(k)}
                      className="mt-0.5 w-4 h-4 shrink-0 accent-brand-600"
                    />
                    <span>
                      <span className="block text-[13.5px] font-semibold">{VAT_CLASS_LABELS[k]}</span>
                      <span className="block text-[11.5px] text-ink-faint">{VAT_CLASS_HINTS[k]}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            {fieldErrors.vatClass && (
              <span className="block mt-1 text-[12px] font-semibold text-rose-600">{fieldErrors.vatClass}</span>
            )}
            <span className="block mt-1.5 text-[12px] text-ink-faint">
              Prices are VAT-inclusive. Only VATable items add 12% output VAT on the receipt.
            </span>
          </fieldset>

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
          <PriceVatHelper price={price} vatClass={vatClass} vatRegistered={vatRegistered} onSetPrice={setPrice} />

          {stockChanged && (
            <Field label="Reason for the stock change" error={fieldErrors.stockReason}>
              <select
                value={stockReason}
                onChange={(e) => setStockReason(e.target.value as StockReason)}
                className={FIELD_INPUT}
              >
                {STOCK_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <span className="block mt-1 text-[12px] text-ink-faint">
                {Number(stock || 0) > product.stock ? "+" : "−"}
                {Math.abs(Number(stock || 0) - product.stock)} units · saved in the stock history with your name.
              </span>
            </Field>
          )}

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

          {/* Senior Citizen / PWD eligibility (RA 9994 / RA 10754) */}
          <button
            type="button"
            onClick={() => setScPwdEligible((v) => !v)}
            aria-pressed={scPwdEligible}
            className="flex items-center gap-3 group text-left"
          >
            <span
              className={
                "relative shrink-0 w-10 h-6 rounded-full transition duration-150 " +
                (scPwdEligible ? "bg-accent-500" : "bg-ink/15")
              }
            >
              <span
                className={
                  "absolute top-0.5 w-5 h-5 rounded-full bg-surface shadow-sm transition duration-150 " +
                  (scPwdEligible ? "left-[18px]" : "left-0.5")
                }
              />
            </span>
            <span>
              <span className="block text-[14px] font-semibold text-ink">
                {scPwdEligible ? "Senior / PWD discount applies" : "No Senior / PWD discount"}
              </span>
              <span className="block text-[12px] text-ink-faint">
                Turn off for items the benefit doesn&rsquo;t cover, e.g. alcohol or gift items.
              </span>
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

/**
 * Shows what the typed price is made of, so the owner sees the price is the
 * FINAL shelf price: PH retail prices are VAT-inclusive, so a VATable ₱140.00
 * is ₱125.00 + ₱15.00 VAT — the customer pays ₱140.00, not ₱155. Uses the same
 * VAT maths as the register and the server (previewVatCents). If the owner
 * meant their number as the price BEFORE VAT, one tap converts it.
 */
function PriceVatHelper({
  price,
  vatClass,
  vatRegistered,
  onSetPrice,
}: {
  price: string;
  vatClass: VatClass;
  vatRegistered: boolean | null;
  onSetPrice: (pesos: string) => void;
}) {
  const [converted, setConverted] = useState<string | null>(null);
  const cents = Math.round((Number(price) || 0) * 100);
  if (cents <= 0 || vatRegistered === null) return null;
  const peso = (c: number) => formatPesoExact(c / 100);
  const box = "rounded-[10px] bg-paper hairline px-3.5 py-2.5 text-[12.5px] text-ink-soft";

  if (!vatRegistered) {
    return (
      <p className={box}>
        Your store is <b className="text-ink">non-VAT</b>, so there&rsquo;s no VAT in this price — the customer pays{" "}
        <b className="text-ink">{peso(cents)}</b>.
      </p>
    );
  }
  if (vatClass !== "VATABLE") {
    return (
      <p className={box}>
        No VAT on this item ({vatClass === "EXEMPT" ? "VAT-exempt" : "zero-rated"}) — the customer pays{" "}
        <b className="text-ink">{peso(cents)}</b>.
      </p>
    );
  }
  const vat = previewVatCents([{ vatClass: "VATABLE", lineCents: cents }]);
  const grossedUp = Math.round(cents * 1.12);
  return (
    <div className={box + " space-y-1"}>
      <div className="tabular-nums">
        {peso(cents - vat)} + {peso(vat)} VAT (12%) = <b className="text-ink">{peso(cents)}</b> — the price the customer pays.
      </div>
      {converted !== price && (
        <div className="text-[12px] text-ink-faint">
          Is {peso(cents)} your price <i>before</i> VAT?{" "}
          <button
            type="button"
            onClick={() => {
              const next = (grossedUp / 100).toFixed(2);
              setConverted(next);
              onSetPrice(next);
            }}
            className="font-semibold text-brand-600 hover:text-brand-700 underline underline-offset-2"
          >
            Use {peso(grossedUp)} instead
          </button>
        </div>
      )}
    </div>
  );
}
