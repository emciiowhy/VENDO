"use client";

import { useState } from "react";
import { Icon } from "../Icon";

/**
 * Marketing contact form (right pane of /contact). No backend round-trip — this
 * is a front-of-funnel form, so it validates entirely on the client and then
 * shows a confirmation. Field chrome mirrors the /auth/signup inputs exactly
 * (`field-input`), and validation leans on the design system's danger token
 * (the `.field-wrap.invalid` red border + rose error text) and success token
 * (the accent-green inline check + confirmation panel).
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldKey = "businessName" | "email" | "message";

const EMPTY: Record<FieldKey, string> = { businessName: "", email: "", message: "" };

/** Per-field rules — returns an error string, or "" when the value is valid. */
function fieldError(key: FieldKey, value: string): string {
  const v = value.trim();
  switch (key) {
    case "businessName":
      return v.length < 2 ? "Enter your business name." : "";
    case "email":
      return EMAIL_RE.test(v) ? "" : "Enter a valid email address.";
    case "message":
      return v.length < 10 ? "Add a few details so we can help — at least 10 characters." : "";
  }
}

export function ContactForm() {
  const [form, setForm] = useState<Record<FieldKey, string>>(EMPTY);
  const [touched, setTouched] = useState<Record<FieldKey, boolean>>({
    businessName: false,
    email: false,
    message: false,
  });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  function update(key: FieldKey, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function markTouched(key: FieldKey) {
    setTouched((t) => (t[key] ? t : { ...t, [key]: true }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const hasError = (Object.keys(form) as FieldKey[]).some((k) => fieldError(k, form[k]));
    if (hasError) {
      setTouched({ businessName: true, email: true, message: true });
      return;
    }
    setBusy(true);
    // Simulate the network hand-off so the button shows its in-flight state.
    await new Promise((r) => setTimeout(r, 650));
    setBusy(false);
    setSent(true);
  }

  function reset() {
    setForm(EMPTY);
    setTouched({ businessName: false, email: false, message: false });
    setSent(false);
  }

  if (sent) {
    return (
      <div className="grid place-items-center text-center py-10" role="status" aria-live="polite">
        <div className="w-16 h-16 rounded-full bg-accent-50 grid place-items-center">
          <Icon name="check" className="w-8 h-8 text-accent-600" strokeWidth={2.2} />
        </div>
        <h3 className="mt-5 text-[1.4rem] font-extrabold tracking-tight text-ink">
          Message sent. Salamat!
        </h3>
        <p className="mt-2.5 max-w-[40ch] text-[0.98rem] leading-relaxed text-ink-soft">
          We&rsquo;ve received your message and a specialist will reply within{" "}
          <span className="font-semibold text-ink">2 business hours</span>. Keep an eye on your
          inbox.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-7 inline-flex items-center gap-2 bg-surface hairline text-ink font-semibold text-[14px] px-5 py-2.5 rounded-[10px] hover:border-brand-200 hover:text-brand-600 transition duration-150"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <ContactField
        id="businessName"
        label="Business name"
        value={form.businessName}
        onChange={(v) => update("businessName", v)}
        onBlur={() => markTouched("businessName")}
        error={touched.businessName ? fieldError("businessName", form.businessName) : ""}
        placeholder="Kape ni Juan"
        autoComplete="organization"
      />

      <ContactField
        id="email"
        label="Work email"
        type="email"
        value={form.email}
        onChange={(v) => update("email", v)}
        onBlur={() => markTouched("email")}
        error={touched.email ? fieldError("email", form.email) : ""}
        placeholder="you@business.ph"
        autoComplete="email"
      />

      <ContactField
        id="message"
        label="How can we help?"
        multiline
        value={form.message}
        onChange={(v) => update("message", v)}
        onBlur={() => markTouched("message")}
        error={touched.message ? fieldError("message", form.message) : ""}
        placeholder="Tell us about your stores, headcount, and what you're trying to solve…"
      />

      <button
        type="submit"
        disabled={busy}
        className="inline-flex items-center justify-center gap-2 w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[15px] tracking-tight py-3.5 rounded-[10px] shadow-btn transition duration-150 disabled:opacity-60"
      >
        {busy ? "Sending…" : "Send message"}
        {!busy && <Icon name="arrow" className="w-[18px] h-[18px] -mr-1" strokeWidth={2} />}
      </button>

      <p className="text-center text-[12px] text-ink-faint leading-relaxed">
        We&rsquo;ll only use your details to reply about VendoPOS. Your data stays private.
      </p>
    </form>
  );
}

/**
 * One labelled field. Matches the /auth/signup input chrome and adds the
 * design-system states: `invalid` flips on the rose danger border via CSS, and
 * a valid, touched field earns an accent-green check (the success token).
 */
function ContactField({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  placeholder,
  type = "text",
  autoComplete,
  multiline = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  error: string;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
  multiline?: boolean;
}) {
  const invalid = error.length > 0;
  const valid = !invalid && value.trim().length > 0;
  const errorId = `${id}-error`;

  const shared = {
    id,
    value,
    placeholder,
    "aria-invalid": invalid,
    "aria-describedby": invalid ? errorId : undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(e.target.value),
    onBlur,
  };

  return (
    <label className="block">
      <span className="text-[13px] font-semibold text-ink-soft">{label}</span>
      <div className={"field-wrap relative mt-1.5" + (invalid ? " invalid" : "")}>
        {multiline ? (
          <textarea
            {...shared}
            rows={4}
            className="field-input w-full rounded-[10px] px-3.5 py-3 pr-10 text-[15px] tracking-tight text-ink resize-y"
          />
        ) : (
          <input
            {...shared}
            type={type}
            autoComplete={autoComplete}
            autoCapitalize={type === "email" ? "none" : undefined}
            autoCorrect={type === "email" ? "off" : undefined}
            spellCheck={type === "email" ? false : undefined}
            className="field-input w-full rounded-[10px] px-3.5 py-3 pr-10 text-[15px] tracking-tight text-ink"
          />
        )}
        {valid && (
          <Icon
            name="check"
            className={
              "absolute right-3.5 text-accent-600 w-[18px] h-[18px] " +
              (multiline ? "top-3.5" : "top-1/2 -translate-y-1/2")
            }
            strokeWidth={2.4}
          />
        )}
      </div>
      {invalid && (
        <span id={errorId} role="alert" className="block mt-1 text-[12px] font-semibold text-rose-600">
          {error}
        </span>
      )}
    </label>
  );
}
