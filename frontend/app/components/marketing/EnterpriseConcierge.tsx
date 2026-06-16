"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "../Icon";
import {
  submitEnterpriseInquiry,
  ENTERPRISE_BOOKING_URL,
  type EnterpriseInquiryPayload,
} from "@/lib/api";

/**
 * The Enterprise concierge funnel — what a prospect sees when they pick the
 * Enterprise tier instead of self-serving a trial. It does two jobs:
 *
 *  1. Sets the high-touch expectation: a mandatory 1-on-1 Zoom consultation, then
 *     a custom in-person rollout meeting to map complex multi-location configs.
 *  2. Captures the operational detail (scale, current system) and submits it —
 *     the backend persists the lead and fires an internal admin alert with those
 *     details so a rep can prep before reaching out.
 *
 * On success we reiterate the booking CTA so the prospect can schedule the Zoom
 * consultation right away.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STEPS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "monitor",
    title: "1 · Your 1-on-1 Zoom consultation",
    body: "A mandatory video call with a VendoPOS solutions lead to understand your operation, locations and goals — and answer everything before you commit.",
  },
  {
    icon: "building",
    title: "2 · In-person rollout mapping",
    body: "We come to you. A hands-on session to map your multi-location configuration — branches, roles, inventory transfers and consolidated reporting — into a rollout plan tailored to your business.",
  },
  {
    icon: "shield",
    title: "3 · Guided go-live",
    body: "We provision your stores, migrate your data and train your teams, then stay close through launch with a priority support line.",
  },
];

type Form = EnterpriseInquiryPayload;

const emptyForm: Form = {
  name: "",
  businessName: "",
  email: "",
  phone: "",
  locations: "",
  currentSystem: "",
  message: "",
};

const REQUIRED: (keyof Form)[] = ["name", "businessName", "email", "phone", "locations"];

function validate(data: Form): Record<string, string> {
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

export function EnterpriseConcierge() {
  const [form, setForm] = useState<Form>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  function update<K extends keyof Form>(key: K, value: string) {
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
    const res = await submitEnterpriseInquiry({
      name: form.name.trim(),
      businessName: form.businessName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      locations: form.locations.trim(),
      currentSystem: form.currentSystem?.trim() || undefined,
      message: form.message?.trim() || undefined,
    });
    setSubmitting(false);
    if (res.ok) {
      setDone(true);
    } else if (res.errors) {
      setErrors(res.errors);
    } else {
      setServerError(res.error ?? "Something went wrong. Please try again.");
    }
  }

  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-[1100px] mx-auto px-6">
        <div className="max-w-[62ch]">
          <span className="text-[12.5px] font-bold tracking-widest uppercase text-brand-600">
            Enterprise concierge
          </span>
          <h1 className="mt-4 text-[clamp(2rem,4vw,2.8rem)] leading-[1.08] tracking-tightest font-extrabold">
            Let&apos;s map your rollout together.
          </h1>
          <p className="mt-5 text-[1.05rem] text-ink-soft leading-relaxed">
            Enterprise isn&apos;t a checkout — it&apos;s a partnership. Multi-location operations have
            real complexity, so we start with a conversation and a plan, not a credit card. Here&apos;s
            how onboarding works.
          </p>
        </div>

        <div className="mt-12 grid lg:grid-cols-[1.05fr_1fr] gap-10 lg:gap-14 items-start">
          {/* Strategy outline */}
          <div className="space-y-5">
            {STEPS.map((s) => (
              <div key={s.title} className="flex gap-4 rounded-xl2 bg-surface hairline shadow-card p-5">
                <span className="grid place-items-center w-11 h-11 rounded-[12px] bg-brand-50 text-brand-600 shrink-0">
                  <Icon name={s.icon} className="w-[22px] h-[22px]" strokeWidth={1.7} />
                </span>
                <div>
                  <h3 className="font-extrabold tracking-tight text-[15.5px]">{s.title}</h3>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-ink-soft">{s.body}</p>
                </div>
              </div>
            ))}

            <a
              href={ENTERPRISE_BOOKING_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-[11px] bg-brand-500 hover:bg-brand-600 px-5 py-3 text-[14.5px] font-semibold text-white shadow-btn tracking-tight transition duration-150"
            >
              <Icon name="monitor" className="w-[18px] h-[18px]" strokeWidth={1.9} />
              Book your Zoom consultation
            </a>
            <p className="text-[12.5px] text-ink-faint leading-relaxed">
              Prefer we reach out first? Share your details and we&apos;ll line up the consultation
              for you.
            </p>
          </div>

          {/* Intake */}
          <div className="rounded-[20px] bg-white hairline shadow-soft overflow-hidden">
            <div className="bg-ink text-white px-7 sm:px-8 py-7">
              <h2 className="text-[1.35rem] font-extrabold tracking-tightest">Tell us about your operation</h2>
              <p className="mt-1.5 text-[13.5px] text-white/65 leading-relaxed">
                The more we know up front, the more useful your consultation will be.
              </p>
            </div>

            {done ? (
              <div className="px-7 sm:px-8 py-12 text-center" role="status" aria-live="polite">
                <div className="w-14 h-14 rounded-full bg-accent-50 grid place-items-center mx-auto">
                  <Icon name="check" className="w-7 h-7 text-accent-600" strokeWidth={2.2} />
                </div>
                <h3 className="mt-4 text-[1.3rem] font-extrabold tracking-tight">
                  Your details are in.
                </h3>
                <p className="mt-2 text-ink-soft max-w-[40ch] mx-auto leading-relaxed text-[14px]">
                  Our enterprise team will reach out shortly. To move faster, book your 1-on-1 Zoom
                  consultation now — pick a time that suits you.
                </p>
                <a
                  href={ENTERPRISE_BOOKING_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 inline-flex items-center gap-2 rounded-[11px] bg-brand-500 hover:bg-brand-600 px-5 py-3 text-[14px] font-semibold text-white shadow-btn tracking-tight transition"
                >
                  <Icon name="monitor" className="w-[17px] h-[17px]" strokeWidth={1.9} />
                  Book your Zoom consultation
                </a>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate className="px-7 sm:px-8 py-7 grid sm:grid-cols-2 gap-5">
                <Field id="name" label="Your name" required value={form.name} error={errors.name} onChange={(v) => update("name", v)} placeholder="Juan dela Cruz" autoComplete="name" />
                <Field id="businessName" label="Business name" required value={form.businessName} error={errors.businessName} onChange={(v) => update("businessName", v)} placeholder="Santos Group" autoComplete="organization" />
                <Field id="email" label="Work email" required type="email" value={form.email} error={errors.email} onChange={(v) => update("email", v)} placeholder="you@company.ph" autoComplete="email" />
                <Field id="phone" label="Phone" required type="tel" value={form.phone} error={errors.phone} onChange={(v) => update("phone", v)} placeholder="0917 123 4567" autoComplete="tel" />
                <Field id="locations" label="How many locations?" required value={form.locations} error={errors.locations} onChange={(v) => update("locations", v)} placeholder="e.g. 8 branches" className="sm:col-span-2" />

                <div className="field-wrap flex flex-col gap-2 sm:col-span-2">
                  <label htmlFor="currentSystem" className="text-[14px] font-bold text-ink">
                    Current system <span className="text-ink-faint font-medium">(optional)</span>
                  </label>
                  <input
                    id="currentSystem"
                    value={form.currentSystem ?? ""}
                    onChange={(e) => update("currentSystem", e.target.value)}
                    placeholder="What do you run today? e.g. Loyverse + spreadsheets"
                    className="field-input rounded-[10px] px-3.5 py-3 text-[15px]"
                  />
                </div>

                <div className="field-wrap flex flex-col gap-2 sm:col-span-2">
                  <label htmlFor="message" className="text-[14px] font-bold text-ink">
                    Anything else? <span className="text-ink-faint font-medium">(optional)</span>
                  </label>
                  <textarea
                    id="message"
                    rows={3}
                    value={form.message ?? ""}
                    onChange={(e) => update("message", e.target.value)}
                    placeholder="Goals, timelines, must-haves — anything that helps us prepare."
                    className="field-input rounded-[10px] px-3.5 py-3 text-[15px] resize-y"
                  />
                </div>

                <div className="sm:col-span-2 flex flex-col gap-3">
                  {serverError && (
                    <p className="text-[13px] font-semibold text-rose-600 text-center">{serverError}</p>
                  )}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex justify-center items-center gap-2 bg-brand-600 text-white font-semibold py-3.5 rounded-[11px] shadow-btn hover:bg-brand-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {submitting ? "Sending…" : "Request my consultation"}
                    {!submitting && <Icon name="arrow" className="w-[18px] h-[18px]" strokeWidth={1.8} />}
                  </button>
                  <p className="text-[12.5px] text-ink-soft text-center">
                    We&apos;ll only use your details to plan your VendoPOS rollout. Your data stays private.
                  </p>
                </div>
              </form>
            )}
          </div>
        </div>

        <p className="mt-12 text-[13.5px] text-ink-soft">
          Looking for a self-serve plan instead?{" "}
          <Link href="/#pricing" className="font-semibold text-ink hover:text-brand-600 transition">
            See Starter &amp; Business
          </Link>
          .
        </p>
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
  className,
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
  className?: string;
}) {
  return (
    <div className={"field-wrap flex flex-col gap-2" + (error ? " invalid" : "") + (className ? " " + className : "")}>
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
