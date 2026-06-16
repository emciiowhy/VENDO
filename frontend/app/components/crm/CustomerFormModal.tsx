"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { useToast } from "../Toast";
import { createCustomer, updateCustomer, type Customer, type CustomerFields } from "@/lib/crm";

/** Add / edit a customer. Tags are entered comma-separated. */
export function CustomerFormModal({
  customer,
  onClose,
  onSaved,
}: {
  customer: Customer | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { push } = useToast();
  const editing = customer !== null;

  const [name, setName] = useState(() => customer?.name ?? "");
  const [phone, setPhone] = useState(() => customer?.phone ?? "");
  const [email, setEmail] = useState(() => customer?.email ?? "");
  const [address, setAddress] = useState(() => customer?.address ?? "");
  const [tags, setTags] = useState(() => (customer?.tags ?? []).join(", "));
  const [note, setNote] = useState(() => customer?.note ?? "");
  const [isActive, setIsActive] = useState(() => customer?.isActive ?? true);
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
    if (!name.trim()) return setError("Customer name is required.");
    setBusy(true);
    setError(null);
    const fields: CustomerFields = {
      name,
      phone,
      email,
      address,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      note,
      isActive,
    };
    const res = editing ? await updateCustomer(customer.id, fields) : await createCustomer(fields);
    if (res.ok) {
      push({ variant: "success", title: editing ? "Customer updated" : "Customer added" });
      onSaved();
      return;
    }
    setBusy(false);
    setError(res.error ?? (res.errors ? Object.values(res.errors)[0] : "Could not save the customer."));
  }

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center px-5" role="dialog" aria-modal="true" aria-label={editing ? "Edit customer" : "Add customer"}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/45 backdrop-blur-sm overlay-backdrop" />
      <div className="relative w-full max-w-[460px] rounded-xl2 bg-surface hairline shadow-soft p-6 max-h-[92vh] overflow-y-auto overlay-card">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center w-10 h-10 rounded-[11px] bg-brand-50 text-brand-600 shrink-0">
              <Icon name="heart" className="w-5 h-5" strokeWidth={1.8} />
            </span>
            <div>
              <h3 className="text-[1.1rem] font-extrabold tracking-tight">{editing ? "Edit customer" : "Add a customer"}</h3>
              <p className="text-[12.5px] text-ink-soft">Attach them to sales to build loyalty.</p>
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
          <Field label="Full name" value={name} onChange={setName} placeholder="Ana Reyes" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone" value={phone} onChange={setPhone} placeholder="0917 000 0000" />
            <Field label="Email" value={email} onChange={setEmail} placeholder="ana@email.ph" type="email" />
          </div>
          <Field label="Address" value={address} onChange={setAddress} placeholder="City / area" />
          <Field label="Tags (comma-separated)" value={tags} onChange={setTags} placeholder="VIP, regular" />
          <label className="block">
            <span className="text-[12px] font-semibold text-ink-soft">Note (optional)</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Preferences, birthday…" className="field-input w-full rounded-[10px] px-3 py-2.5 text-[14px] mt-1.5 resize-none" />
          </label>

          {editing && (
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-4 h-4 accent-[var(--color-brand-500)]" />
              <span className="text-[13px] font-semibold">Active customer</span>
            </label>
          )}

          {error && <p className="text-[12.5px] font-semibold text-rose-600">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-[10px] text-[14px] font-semibold text-ink-soft hover:bg-paper transition duration-150">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[14px] px-5 py-2.5 rounded-[10px] shadow-btn tracking-tight transition duration-150 disabled:opacity-60">
              {busy ? "Saving…" : editing ? "Save changes" : "Add customer"}
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
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="field-input w-full rounded-[10px] px-3 py-2.5 text-[14px] mt-1.5" />
    </label>
  );
}
