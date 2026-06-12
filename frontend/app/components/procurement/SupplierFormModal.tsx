"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { useToast } from "../Toast";
import { createSupplier, updateSupplier, type Supplier, type SupplierFields } from "@/lib/procurement";

/** Add / edit a supplier. Only the name is required. */
export function SupplierFormModal({
  supplier,
  onClose,
  onSaved,
}: {
  supplier: Supplier | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { push } = useToast();
  const editing = supplier !== null;

  const [name, setName] = useState(() => supplier?.name ?? "");
  const [contactName, setContactName] = useState(() => supplier?.contactName ?? "");
  const [email, setEmail] = useState(() => supplier?.email ?? "");
  const [phone, setPhone] = useState(() => supplier?.phone ?? "");
  const [address, setAddress] = useState(() => supplier?.address ?? "");
  const [note, setNote] = useState(() => supplier?.note ?? "");
  const [isActive, setIsActive] = useState(() => supplier?.isActive ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit() {
    if (!name.trim()) return setError("Supplier name is required.");
    setBusy(true);
    setError(null);
    const fields: SupplierFields = { name, contactName, email, phone, address, note, isActive };
    const res = editing ? await updateSupplier(supplier.id, fields) : await createSupplier(fields);
    if (res.ok) {
      push({ variant: "success", title: editing ? "Supplier updated" : "Supplier added" });
      onSaved();
      return;
    }
    setBusy(false);
    setError(res.error ?? (res.errors ? Object.values(res.errors)[0] : "Could not save the supplier."));
  }

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center px-5" role="dialog" aria-modal="true" aria-label={editing ? "Edit supplier" : "Add supplier"}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/45 backdrop-blur-sm" />
      <div className="relative w-full max-w-[440px] rounded-xl2 bg-surface hairline shadow-soft p-6 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center w-10 h-10 rounded-[11px] bg-brand-50 text-brand-600 shrink-0">
              <Icon name="truck" className="w-5 h-5" strokeWidth={1.8} />
            </span>
            <div>
              <h3 className="text-[1.1rem] font-extrabold tracking-tight">
                {editing ? "Edit supplier" : "Add a supplier"}
              </h3>
              <p className="text-[12.5px] text-ink-soft">Who you buy stock from.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-ink-faint hover:text-ink transition -mt-1 -mr-1 p-1">
            <Icon name="x" className="w-5 h-5" strokeWidth={1.8} />
          </button>
        </div>

        <form
          className="mt-5 space-y-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label="Supplier name" value={name} onChange={setName} placeholder="e.g. Nestlé Philippines" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact person" value={contactName} onChange={setContactName} placeholder="Juan dela Cruz" />
            <Field label="Phone" value={phone} onChange={setPhone} placeholder="0917 000 0000" />
          </div>
          <Field label="Email" value={email} onChange={setEmail} placeholder="orders@supplier.ph" type="email" />
          <Field label="Address" value={address} onChange={setAddress} placeholder="City / area" />
          <label className="block">
            <span className="text-[12px] font-semibold text-ink-soft">Note (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Payment terms, lead time…"
              className="field-input w-full rounded-[10px] px-3 py-2.5 text-[14px] mt-1.5 resize-none"
            />
          </label>

          {editing && (
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 accent-[var(--color-brand-500)]"
              />
              <span className="text-[13px] font-semibold">Active supplier</span>
            </label>
          )}

          {error && <p className="text-[12.5px] font-semibold text-rose-600">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-[10px] text-[14px] font-semibold text-ink-soft hover:bg-paper transition duration-150">
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[14px] px-5 py-2.5 rounded-[10px] shadow-btn tracking-tight transition duration-150 disabled:opacity-60"
            >
              {busy ? "Saving…" : editing ? "Save changes" : "Add supplier"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-semibold text-ink-soft">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="field-input w-full rounded-[10px] px-3 py-2.5 text-[14px] mt-1.5"
      />
    </label>
  );
}
