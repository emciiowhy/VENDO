"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Icon } from "../Icon";
import { signUp, type SignupPlan } from "@/lib/auth";

/**
 * Self-service trial signup. Only four fields stand between a prospect and a live
 * sandbox: Business Name, Owner Name, Email, and a password. The plan is carried
 * in from the pricing card (`?plan=`) and can be flipped here. On success the
 * backend has already provisioned the tenant + seeded a demo workspace and set
 * the session cookie, so we hard-navigate into the dashboard (resetting the
 * cached session), exactly like the password-login path.
 */

const PLAN_COPY: Record<SignupPlan, { label: string; price: string; blurb: string }> = {
  starter: { label: "Starter", price: "₱499/mo", blurb: "POS, inventory & BIR receipts." },
  business: { label: "Business", price: "₱1,499/mo", blurb: "Adds procurement, CRM & finance." },
};

const MIN_PASSWORD = 8;

function coercePlan(value: string | null): SignupPlan {
  return value === "business" ? "business" : "starter";
}

export function SignupForm() {
  const params = useSearchParams();
  const [plan, setPlan] = useState<SignupPlan>(() => coercePlan(params.get("plan")));

  const [businessName, setBusinessName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [topError, setTopError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function clearError(field: string) {
    setTopError(null);
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  async function submit() {
    // Mirror the server's gate for instant feedback before the round-trip.
    const next: Record<string, string> = {};
    if (businessName.trim().length < 2) next.businessName = "Enter your business name.";
    if (ownerName.trim().length < 2) next.ownerName = "Enter your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = "Enter a valid email address.";
    if (password.length < MIN_PASSWORD) next.password = `At least ${MIN_PASSWORD} characters.`;
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }

    setBusy(true);
    setTopError(null);
    setErrors({});
    const res = await signUp({
      businessName: businessName.trim(),
      ownerName: ownerName.trim(),
      email: email.trim(),
      password,
      plan,
    });
    if (res.ok) {
      window.location.assign(res.redirectTo);
      return;
    }
    setBusy(false);
    if (res.errors) setErrors(res.errors);
    setTopError(res.error ?? (res.errors ? null : "Could not create your account. Please try again."));
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      noValidate
    >
      {/* Plan picker — initialised from the pricing card, switchable here. */}
      <div className="grid grid-cols-2 gap-2 p-1 rounded-[12px] bg-paper hairline">
        {(Object.keys(PLAN_COPY) as SignupPlan[]).map((p) => {
          const active = plan === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => setPlan(p)}
              aria-pressed={active}
              className={
                "rounded-[9px] px-3 py-2 text-left transition duration-150 " +
                (active ? "bg-surface shadow-card ring-1 ring-brand-200" : "hover:bg-surface/60")
              }
            >
              <span className="flex items-center justify-between">
                <span className="text-[13.5px] font-bold tracking-tight">{PLAN_COPY[p].label}</span>
                <span className={"text-[12px] font-semibold " + (active ? "text-brand-600" : "text-ink-faint")}>
                  {PLAN_COPY[p].price}
                </span>
              </span>
              <span className="mt-0.5 block text-[11.5px] text-ink-faint leading-snug">
                {PLAN_COPY[p].blurb}
              </span>
            </button>
          );
        })}
      </div>

      <SignupField
        label="Business name"
        value={businessName}
        onChange={(v) => {
          setBusinessName(v);
          clearError("businessName");
        }}
        placeholder="Kape ni Juan"
        autoComplete="organization"
        error={errors.businessName}
      />

      <SignupField
        label="Your name"
        value={ownerName}
        onChange={(v) => {
          setOwnerName(v);
          clearError("ownerName");
        }}
        placeholder="Juan dela Cruz"
        autoComplete="name"
        error={errors.ownerName}
      />

      <SignupField
        label="Email"
        type="email"
        value={email}
        onChange={(v) => {
          setEmail(v);
          clearError("email");
        }}
        placeholder="you@store.ph"
        autoComplete="email"
        error={errors.email}
      />

      <SignupField
        label="Password"
        type="password"
        value={password}
        onChange={(v) => {
          setPassword(v);
          clearError("password");
        }}
        placeholder="••••••••"
        autoComplete="new-password"
        error={errors.password}
        hint={`At least ${MIN_PASSWORD} characters — you'll sign in with your email + this password.`}
      />

      {topError && (
        <p className="text-[12.5px] font-semibold text-rose-600 bg-rose-50 rounded-[10px] px-3.5 py-2.5">
          {topError}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="inline-flex items-center justify-center gap-2 w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[15px] tracking-tight py-3.5 rounded-[10px] shadow-btn transition duration-150 disabled:opacity-60"
      >
        {busy ? "Creating your store…" : "Start free trial"}
        {!busy && <Icon name="arrow" className="w-[18px] h-[18px] -mr-1" strokeWidth={2} />}
      </button>

      <p className="text-center text-[12px] text-ink-faint leading-relaxed">
        14-day free trial · no card required. By continuing you agree to the VendoPOS terms.
      </p>
    </form>
  );
}

function SignupField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  autoComplete,
  error,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
  error?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-[13px] font-semibold text-ink-soft">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoCapitalize={type === "email" ? "none" : undefined}
        autoCorrect={type === "email" ? "off" : undefined}
        spellCheck={type === "email" ? false : undefined}
        className="field-input w-full rounded-[10px] px-3.5 py-3 text-[15px] tracking-tight text-ink mt-1.5"
      />
      {error ? (
        <span className="block mt-1 text-[12px] font-semibold text-rose-600">{error}</span>
      ) : hint ? (
        <span className="block mt-1 text-[12px] text-ink-faint">{hint}</span>
      ) : null}
    </label>
  );
}
