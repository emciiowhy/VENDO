"use client";

import { useState } from "react";
import { Icon } from "../Icon";
import { passwordLogin } from "@/lib/auth";

/**
 * Owner / manager password sign-in for the login screen — an alternative to
 * Google for managers who've set a password (self-service, from the dashboard).
 * It stays collapsed behind a link so the page leads with Google; expanding it
 * reveals the Store ID + email + password fields. The Store ID scopes the
 * lookup to one tenant before the email + password are checked.
 */
const SUFFIX = ".vendopos.app";

export function OwnerPasswordSignIn() {
  const [open, setOpen] = useState(false);
  const [storeId, setStoreId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const slug = storeId.trim().toLowerCase();
    if (!slug || !email.trim() || !password) {
      setError("Enter your Store ID, email and password.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await passwordLogin({ storeId: slug, email: email.trim(), password });
    if (res.ok) {
      window.location.assign(res.redirectTo);
      return;
    }
    setError(res.error);
    setBusy(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 mx-auto block text-[13px] font-semibold text-ink-soft hover:text-brand-600 transition duration-150"
      >
        Sign in with a password instead
      </button>
    );
  }

  return (
    <form
      className="mt-4 space-y-3 reveal"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label className="block">
        <span className="text-[13px] font-semibold text-ink-soft">Store ID</span>
        <div className="relative mt-1.5">
          <Icon
            name="store"
            className="absolute left-3 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-ink-faint"
            strokeWidth={1.7}
          />
          <input
            value={storeId}
            onChange={(e) => {
              setStoreId(e.target.value.replace(/\s+/g, "").toLowerCase());
              setError(null);
            }}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="your-store"
            className="field-input w-full rounded-[10px] pl-10 pr-[108px] py-3 text-[15px] tracking-tight text-ink"
          />
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] font-medium text-ink-faint pointer-events-none">
            {SUFFIX}
          </span>
        </div>
      </label>

      <label className="block">
        <span className="text-[13px] font-semibold text-ink-soft">Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="you@store.ph"
          className="field-input w-full rounded-[10px] px-3.5 py-3 text-[15px] tracking-tight text-ink mt-1.5"
        />
      </label>

      <label className="block">
        <span className="text-[13px] font-semibold text-ink-soft">Password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(null);
          }}
          placeholder="••••••••"
          className="field-input w-full rounded-[10px] px-3.5 py-3 text-[15px] tracking-tight text-ink mt-1.5"
        />
      </label>

      {error && <p className="text-[12.5px] font-semibold text-rose-600">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="inline-flex items-center justify-center gap-2 w-full bg-ink dark:bg-[#0b1220] hover:opacity-90 text-white font-semibold text-[14.5px] py-3 rounded-[10px] shadow-btn transition duration-150 disabled:opacity-60"
      >
        {busy ? "Signing in…" : "Sign in"}
        {!busy && <Icon name="arrow" className="w-4 h-4 -mr-1" strokeWidth={2} />}
      </button>

      <p className="text-center text-[12px] text-ink-faint">
        No password yet? Sign in with Google, then set one under Account in your dashboard.
      </p>
    </form>
  );
}
