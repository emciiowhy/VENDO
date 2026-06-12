"use client";

import { useState } from "react";
import { Icon } from "./Icon";
import { submitLead, type LeadPayload, type LeadResult } from "@/lib/api";

const businessTypes = [
  "Coffee shop / Café",
  "Restaurant / Food service",
  "Retail store (small)",
  "Retail store (medium–large)",
  "Manufacturing / Production",
  "Other",
];

const REQUIRED: (keyof LeadPayload)[] = [
  "name",
  "businessName",
  "email",
  "phone",
  "businessType",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const emptyForm: LeadPayload = {
  name: "",
  businessName: "",
  email: "",
  phone: "",
  businessType: "",
  message: "",
};

function validate(data: LeadPayload): Record<string, string> {
  const errors: Record<string, string> = {};
  REQUIRED.forEach((k) => {
    if (!String(data[k] ?? "").trim()) errors[k] = "This field is required.";
  });
  if (data.email && !EMAIL_RE.test(data.email.trim()))
    errors.email = "Please enter a valid email address.";
  if (data.phone && data.phone.replace(/\D/g, "").length < 7)
    errors.phone = "Please enter a valid phone number.";
  return errors;
}

export function DemoForm() {
  const [form, setForm] = useState<LeadPayload>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Extract<LeadResult, { ok: true }>["lead"] | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  function update<K extends keyof LeadPayload>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);

    const localErrors = validate(form);
    if (Object.keys(localErrors).length) {
      setErrors(localErrors);
      return;
    }

    setSubmitting(true);
    const res = await submitLead(form);
    setSubmitting(false);

    if (res.ok) {
      setResult(res.lead);
    } else if (res.errors) {
      setErrors(res.errors);
    } else {
      setServerError(res.error ?? "Something went wrong. Please try again.");
    }
  }

  function reset() {
    setForm(emptyForm);
    setErrors({});
    setResult(null);
    setServerError(null);
  }

  return (
    <section id="demo" className="py-28 relative overflow-hidden">
      <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-brand-50 blur-3xl rounded-full -z-10" />
      <div className="max-w-[760px] mx-auto px-6">
        <div className="rounded-[20px] bg-white hairline shadow-soft overflow-hidden">
          <div className="bg-ink text-white px-8 sm:px-10 py-9">
            <h2 className="text-[1.7rem] font-extrabold tracking-tightest">Request a demo</h2>
            <p className="mt-2 text-white/65">
              Tell us about your business. We’ll reach out to set you up — no signup, no checkout,
              just a conversation.
            </p>
          </div>

          {result ? (
            <div className="px-8 sm:px-10 py-14 text-center" role="status" aria-live="polite">
              <div className="w-16 h-16 rounded-full bg-accent-50 grid place-items-center mx-auto">
                <Icon name="check" className="w-8 h-8 text-accent-600" strokeWidth={2.2} />
              </div>
              <h3 className="mt-5 text-[1.45rem] font-extrabold tracking-tight">
                Salamat! Your request is in.
              </h3>
              <p className="mt-2.5 text-ink-soft max-w-[44ch] mx-auto leading-relaxed">
                We’ve received your demo request and our team will reach out soon to set you up.
                Watch your inbox and phone for our message.
              </p>
              <div className="mt-6 inline-block text-left text-[14px] bg-paper hairline rounded-[12px] px-5 py-4 leading-relaxed">
                <strong>{result.name}</strong> — {result.businessName}
                <br />
                {result.email} · {result.phone}
                <br />
                Business type: {result.businessType}
                {result.message ? (
                  <>
                    <br />“{result.message}”
                  </>
                ) : null}
              </div>
              <div className="mt-7">
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center bg-white hairline text-ink font-semibold px-5 py-2.5 rounded-[10px] hover:border-brand-200 hover:text-brand-600 transition"
                >
                  Submit another request
                </button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              noValidate
              className="px-8 sm:px-10 py-9 grid sm:grid-cols-2 gap-5"
            >
              <Field
                id="name"
                label="Your name"
                required
                value={form.name}
                error={errors.name}
                onChange={(v) => update("name", v)}
                placeholder="Juan dela Cruz"
                autoComplete="name"
              />
              <Field
                id="businessName"
                label="Business name"
                required
                value={form.businessName}
                error={errors.businessName}
                onChange={(v) => update("businessName", v)}
                placeholder="Kape ni Juan"
                autoComplete="organization"
              />
              <Field
                id="email"
                label="Email"
                required
                type="email"
                value={form.email}
                error={errors.email}
                onChange={(v) => update("email", v)}
                placeholder="you@business.ph"
                autoComplete="email"
              />
              <Field
                id="phone"
                label="Phone"
                required
                type="tel"
                value={form.phone}
                error={errors.phone}
                onChange={(v) => update("phone", v)}
                placeholder="0917 123 4567"
                autoComplete="tel"
              />

              <div className="field-wrap flex flex-col gap-2 sm:col-span-2">
                <label htmlFor="businessType" className="text-[14px] font-bold text-ink">
                  Business type <span className="text-rose-500">*</span>
                </label>
                <select
                  id="businessType"
                  value={form.businessType}
                  onChange={(e) => update("businessType", e.target.value)}
                  className="field-input rounded-[10px] px-3.5 py-3 text-[15px]"
                >
                  <option value="">Select your business type…</option>
                  {businessTypes.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <span className="text-[12.5px] font-semibold text-rose-600 min-h-[1em]">
                  {errors.businessType ?? ""}
                </span>
              </div>

              <div className="field-wrap flex flex-col gap-2 sm:col-span-2">
                <label htmlFor="message" className="text-[14px] font-bold text-ink">
                  Message <span className="text-ink-faint font-medium">(optional)</span>
                </label>
                <textarea
                  id="message"
                  rows={3}
                  value={form.message}
                  onChange={(e) => update("message", e.target.value)}
                  placeholder="Tell us anything that would help us prepare for your demo…"
                  className="field-input rounded-[10px] px-3.5 py-3 text-[15px] resize-y"
                />
              </div>

              <div className="sm:col-span-2 flex flex-col gap-3">
                {serverError && (
                  <p className="text-[13px] font-semibold text-rose-600 text-center">
                    {serverError}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex justify-center items-center gap-2 bg-brand-600 text-white font-semibold py-3.5 rounded-[11px] shadow-btn hover:bg-brand-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting ? "Sending…" : "Request my demo"}
                  {!submitting && (
                    <Icon name="arrow" className="w-[18px] h-[18px]" strokeWidth={1.8} />
                  )}
                </button>
                <p className="text-[12.5px] text-ink-soft text-center">
                  We’ll only use your details to contact you about VendoPOS. Your data stays private.
                </p>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

function Field({
  id,
  label,
  value,
  error,
  onChange,
  placeholder,
  type = "text",
  required,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <div className={"field-wrap flex flex-col gap-2" + (error ? " invalid" : "")}>
      <label htmlFor={id} className="text-[14px] font-bold text-ink">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="field-input rounded-[10px] px-3.5 py-3 text-[15px]"
      />
      <span className="text-[12.5px] font-semibold text-rose-600 min-h-[1em]">{error ?? ""}</span>
    </div>
  );
}
