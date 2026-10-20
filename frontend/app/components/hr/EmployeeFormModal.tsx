"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { useToast } from "../Toast";
import {
  EMPLOYMENT_TYPES,
  createEmployee,
  updateEmployee,
  type Employee,
  type EmployeeFields,
} from "@/lib/hr";

/**
 * Add / edit an employee. The daily rate is keyed in pesos (the backend stores
 * centavos); payroll pays Hourly rate = Daily rate ÷ Standard hours. The legacy
 * pay basis / rate fields are no longer edited here and stay as they were.
 */

export function EmployeeFormModal({
  employee,
  onClose,
  onSaved,
}: {
  employee: Employee | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { push } = useToast();
  const editing = employee !== null;

  const [name, setName] = useState(() => employee?.name ?? "");
  const [position, setPosition] = useState(() => employee?.position ?? "");
  const [employmentType, setEmploymentType] = useState(() => employee?.employmentType ?? "Full-time");
  const [dailyRate, setDailyRate] = useState(() =>
    employee?.dailyRateCents != null ? String(employee.dailyRateCents / 100) : "",
  );
  const [hireDate, setHireDate] = useState(() => employee?.hireDate ?? "");
  const [phone, setPhone] = useState(() => employee?.phone ?? "");
  const [email, setEmail] = useState(() => employee?.email ?? "");
  const [note, setNote] = useState(() => employee?.note ?? "");
  const [isActive, setIsActive] = useState(() => employee?.isActive ?? true);
  // Optional dossier + financial-suite fields.
  const [address, setAddress] = useState(() => employee?.address ?? "");
  const [emergencyName, setEmergencyName] = useState(() => employee?.emergencyContactName ?? "");
  const [emergencyPhone, setEmergencyPhone] = useState(() => employee?.emergencyContactPhone ?? "");
  const [bankName, setBankName] = useState(() => employee?.bankName ?? "");
  const [bankAccountName, setBankAccountName] = useState(() => employee?.bankAccountName ?? "");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [ptoBalanceDays, setPtoBalanceDays] = useState(() => (employee ? String(employee.ptoBalanceDays) : ""));
  // Work schedule — drives attendance status (rest day vs absent) and payroll.
  const [workDays, setWorkDays] = useState<number[]>(() => employee?.workDays ?? [1, 2, 3, 4, 5, 6]);
  const [stdHours, setStdHours] = useState(() => String(employee?.standardDailyHours ?? 8));
  const [breakMinutes, setBreakMinutes] = useState(() => String(employee?.unpaidBreakMinutes ?? 60));
  const [showMore, setShowMore] = useState(false);
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
    if (!name.trim()) return setError("Name is required.");
    if (workDays.length === 0) return setError("Pick at least one work day.");
    setBusy(true);
    setError(null);
    const fields: EmployeeFields = {
      name,
      position,
      employmentType,
      hireDate,
      phone,
      email,
      note,
      isActive,
      address,
      emergencyContactName: emergencyName,
      emergencyContactPhone: emergencyPhone,
      bankName,
      bankAccountName,
      workDays,
      standardDailyHours: Number(stdHours) || 8,
      unpaidBreakMinutes: Math.round(Number(breakMinutes) || 0),
    };
    // Account number is write-only — send only when newly typed so we never
    // overwrite the stored value with a blank. Same for PTO (blank would zero it).
    if (bankAccountNumber.trim()) fields.bankAccountNumber = bankAccountNumber.trim();
    if (ptoBalanceDays.trim()) fields.ptoBalanceDays = ptoBalanceDays.trim();
    // Only send the rate when typed, so editing someone else's record never
    // clears a confirmed rate (and a manager editing their own record without
    // touching pay isn't refused by the self-pay guard).
    if (dailyRate.trim() && Number(dailyRate) * 100 !== (employee?.dailyRateCents ?? -1)) fields.dailyRate = dailyRate.trim();
    const res = editing ? await updateEmployee(employee.id, fields) : await createEmployee(fields);
    if (res.ok) {
      push({ variant: "success", title: editing ? "Employee updated" : "Employee added" });
      onSaved();
      return;
    }
    setBusy(false);
    setError(res.error ?? (res.errors ? Object.values(res.errors)[0] : "Could not save the employee."));
  }

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center px-5" role="dialog" aria-modal="true" aria-label={editing ? "Edit employee" : "Add employee"}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/45 backdrop-blur-sm overlay-backdrop" />
      <div className="relative w-full max-w-[480px] rounded-xl2 bg-surface hairline shadow-soft p-6 max-h-[92vh] overflow-y-auto overlay-card">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center w-10 h-10 rounded-[11px] bg-brand-50 text-brand-600 shrink-0">
              <Icon name="users" className="w-5 h-5" strokeWidth={1.8} />
            </span>
            <div>
              <h3 className="text-[1.1rem] font-extrabold tracking-tight">{editing ? "Edit employee" : "Add an employee"}</h3>
              <p className="text-[12.5px] text-ink-soft">Your staff roster — pay and attendance build on this.</p>
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
          <div className="grid grid-cols-2 gap-3">
            <Field label="Full name" value={name} onChange={setName} placeholder="Juan dela Cruz" />
            <Field label="Position" value={position} onChange={setPosition} placeholder="Barista" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[12px] font-semibold text-ink-soft">Employment</span>
              <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} className="field-input w-full rounded-[10px] px-3 py-2.5 text-[14px] mt-1.5">
                {EMPLOYMENT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold text-ink-soft">Daily rate (₱ per day)</span>
              <input
                inputMode="decimal"
                value={dailyRate}
                onChange={(e) => {
                  setDailyRate(e.target.value.replace(/[^\d.]/g, ""));
                  setError(null);
                }}
                placeholder="e.g. 610.00"
                className="field-input w-full rounded-[10px] px-3 py-2.5 text-[14px] mt-1.5 tabular-nums"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[12px] font-semibold text-ink-soft">Hire date</span>
              <input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} className="field-input w-full rounded-[10px] px-3 py-2.5 text-[14px] mt-1.5" />
            </label>
          </div>

          <fieldset className="rounded-[12px] bg-paper hairline p-3.5 space-y-3">
            <legend className="px-1 text-[12px] font-bold text-ink-soft">Work schedule</legend>
            <div>
              <span className="text-[12px] font-semibold text-ink-soft">Work days</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label, d) => {
                  const on = workDays.includes(d);
                  return (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setWorkDays((cur) => (on ? cur.filter((x) => x !== d) : [...cur, d].sort((a, b) => a - b)))}
                      className={
                        "min-w-[44px] rounded-[9px] px-2.5 py-1.5 text-[12.5px] font-bold transition " +
                        (on ? "bg-brand-500 text-white" : "bg-surface hairline text-ink-soft hover:border-brand-200")
                      }
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <span className="block mt-1 text-[11.5px] text-ink-faint">Unselected days are rest days (grey on the calendar).</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[12px] font-semibold text-ink-soft">Standard hours per day</span>
                <input inputMode="decimal" value={stdHours} onChange={(e) => setStdHours(e.target.value.replace(/[^\d.]/g, ""))} className="field-input w-full rounded-[10px] px-3 py-2.5 text-[14px] mt-1.5 tabular-nums" />
              </label>
              <label className="block">
                <span className="text-[12px] font-semibold text-ink-soft">Unpaid break (minutes)</span>
                <input inputMode="numeric" value={breakMinutes} onChange={(e) => setBreakMinutes(e.target.value.replace(/[^\d]/g, ""))} className="field-input w-full rounded-[10px] px-3 py-2.5 text-[14px] mt-1.5 tabular-nums" />
              </label>
            </div>
            <span className="block text-[11.5px] text-ink-faint">The break is deducted on days of 5 hours or more on the clock.</span>
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone" value={phone} onChange={setPhone} placeholder="0917 000 0000" />
            <Field label="Email" value={email} onChange={setEmail} placeholder="name@email.ph" type="email" />
          </div>

          <label className="block">
            <span className="text-[12px] font-semibold text-ink-soft">Note (optional)</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="field-input w-full rounded-[10px] px-3 py-2.5 text-[14px] mt-1.5 resize-none" />
          </label>

          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="flex w-full items-center justify-between rounded-[10px] bg-paper hairline px-3.5 py-2.5 text-[13px] font-semibold text-ink-soft hover:text-ink transition"
          >
            <span className="flex items-center gap-2">
              <Icon name="layers" className="w-4 h-4" strokeWidth={1.8} />
              Personal &amp; payroll details (optional)
            </span>
            <Icon name="chevron" className={"w-4 h-4 transition-transform " + (showMore ? "rotate-180" : "")} strokeWidth={1.8} />
          </button>

          {showMore && (
            <div className="space-y-3.5 rounded-[12px] bg-paper/50 hairline p-3.5">
              <Field label="Home address" value={address} onChange={setAddress} placeholder="12 Mabini St, Cebu City" />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Emergency contact" value={emergencyName} onChange={setEmergencyName} placeholder="Contact name" />
                <Field label="Emergency phone" value={emergencyPhone} onChange={setEmergencyPhone} placeholder="0917 000 0000" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Bank" value={bankName} onChange={setBankName} placeholder="BPI / GCash" />
                <Field label="Account name" value={bankAccountName} onChange={setBankAccountName} placeholder="Account holder" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[12px] font-semibold text-ink-soft">Account number</span>
                  <input
                    value={bankAccountNumber}
                    onChange={(e) => setBankAccountNumber(e.target.value)}
                    placeholder={employee?.bankAccountLast4 ? `•••• ${employee.bankAccountLast4}` : "Account number"}
                    className="field-input w-full rounded-[10px] px-3 py-2.5 text-[14px] mt-1.5 tabular-nums"
                  />
                </label>
                <label className="block">
                  <span className="text-[12px] font-semibold text-ink-soft">PTO balance (days)</span>
                  <input
                    inputMode="decimal"
                    value={ptoBalanceDays}
                    onChange={(e) => setPtoBalanceDays(e.target.value)}
                    placeholder="0"
                    className="field-input w-full rounded-[10px] px-3 py-2.5 text-[14px] mt-1.5 tabular-nums"
                  />
                </label>
              </div>
              <p className="text-[11px] text-ink-faint">The account number is stored securely and only ever shown as its last 4 digits.</p>
            </div>
          )}

          {editing && (
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-4 h-4 accent-[var(--color-brand-500)]" />
              <span className="text-[13px] font-semibold">Active employee</span>
            </label>
          )}

          {error && <p className="text-[12.5px] font-semibold text-rose-600">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-[10px] text-[14px] font-semibold text-ink-soft hover:bg-paper transition duration-150">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[14px] px-5 py-2.5 rounded-[10px] shadow-btn tracking-tight transition duration-150 disabled:opacity-60">
              {busy ? "Saving…" : editing ? "Save changes" : "Add employee"}
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
