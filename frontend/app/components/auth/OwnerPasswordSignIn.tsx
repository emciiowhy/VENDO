"use client";

import { useEffect, useState } from "react";
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
const STORE_KEY = "vendopos_last_store";

export function OwnerPasswordSignIn() {
  const [open, setOpen] = useState(false);
  const [storeId, setStoreId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [remembered, setRemembered] = useState(false);

  // Prefill the last store this terminal signed into. Read after mount so the
  // server + first client render stay deterministic (no hydration mismatch);
  // presentational only — the auth call is unchanged.
  useEffect(() => {
    try {
      const last = window.localStorage.getItem(STORE_KEY);
      if (last) {
        setStoreId(last);
        setRemembered(true);
      }
    } catch {
      /* private mode / disabled storage */
    }
  }, []);

  function clearStore() {
    setStoreId("");
    setRemembered(false);
    try {
      window.localStorage.removeItem(STORE_KEY);
    } catch {
      /* ignore */
    }
  }

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
      try {
        window.localStorage.setItem(STORE_KEY, slug);
      } catch {
        /* ignore */
      }
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

      {remembered && (
        <button
          type="button"
          onClick={clearStore}
          className="press -mt-1.5 block text-[12px] font-semibold text-ink-faint hover:text-ink transition duration-150"
        >
          Use a different store
        </button>
      )}

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
        <div className="relative mt-1.5">
          <input
            type={showPw ? "text" : "password"}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            onKeyUp={(e) => setCapsOn(e.getModifierState("CapsLock"))}
            onKeyDown={(e) => setCapsOn(e.getModifierState("CapsLock"))}
            autoComplete="current-password"
            placeholder="••••••••"
            className="field-input w-full rounded-[10px] pl-3.5 pr-11 py-3 text-[15px] tracking-tight text-ink"
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            aria-label={showPw ? "Hide password" : "Show password"}
            aria-pressed={showPw}
            className="press absolute right-1 top-1/2 -translate-y-1/2 grid place-items-center w-9 h-9 rounded-[8px] text-ink-faint hover:text-ink transition duration-150"
          >
            <Icon name={showPw ? "eye-off" : "eye"} className="w-[18px] h-[18px]" strokeWidth={1.7} />
          </button>
        </div>
        <p aria-live="polite" className="mt-1.5 min-h-[1.05em] text-[12px] font-semibold text-amber-600">
          {capsOn ? (
            <span className="inline-flex items-center gap-1.5">
              <Icon name="lock" className="w-3.5 h-3.5" strokeWidth={2} />
              Caps Lock is on
            </span>
          ) : (
            ""
          )}
        </p>
      </label>

      {error && (
        <p role="alert" className="text-[12.5px] font-semibold text-rose-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="press inline-flex items-center justify-center gap-2 w-full bg-ink text-paper hover:opacity-90 font-semibold text-[14.5px] py-3 rounded-[10px] shadow-btn disabled:opacity-60"
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
