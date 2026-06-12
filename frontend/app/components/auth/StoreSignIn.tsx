"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "../Icon";
import { PinPad } from "./PinPad";
import { ForgotPin } from "./ForgotPin";
import { GOOGLE_SIGN_IN_URL, lookupStore, passwordLogin, switchByPin, type Store } from "@/lib/auth";

/**
 * Store-ID sign-in for the login screen.
 *
 * A shared shop-floor terminal has no Google session yet, so a cashier can't be
 * scoped to a Tenant the way the warm-terminal {@link PinSwitcher} is. The
 * person first types their **Store ID** (the tenant slug) — we confirm the store
 * exists and name it — then says whether they're a **cashier** or the
 * **owner/manager**:
 *   • Cashier → a 4-digit PIN, checked by the backend strictly within that store
 *     (this is what isolates one tenant's tills from another's on a shared box).
 *   • Owner / manager → email + password (scoped to the store they just typed),
 *     or Google as a fallback. Their email maps to their tenant either way.
 */
const SUFFIX = ".vendopos.app";

export function StoreSignIn() {
  const [phase, setPhase] = useState<"store" | "role" | "pin" | "owner">("store");
  const [storeId, setStoreId] = useState("");
  const [store, setStore] = useState<Store | null>(null);
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);

  // ---- Step 1: resolve the Store ID --------------------------------------
  const resolveStore = useCallback(async () => {
    const slug = storeId.trim().toLowerCase();
    if (!slug) {
      setError("Enter your Store ID.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await lookupStore(slug);
    setBusy(false);
    if (res.ok) {
      setStore(res.store);
      setPin("");
      setPhase("role");
    } else {
      setError(res.error);
    }
  }, [storeId]);

  const backToStore = useCallback(() => {
    setPhase("store");
    setPin("");
    setPassword("");
    setError(null);
    setBusy(false);
    setForgot(false);
  }, []);

  // ---- Step 2: who's signing in? -----------------------------------------
  const backToRole = useCallback(() => {
    setPhase("role");
    setPin("");
    setPassword("");
    setError(null);
    setBusy(false);
    setForgot(false);
  }, []);

  // Owner/manager → email + password, scoped to the store they just resolved.
  const signInAsOwner = useCallback(async () => {
    if (!store) return;
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await passwordLogin({ storeId: store.slug, email: email.trim(), password });
    if (res.ok) {
      window.location.assign(res.redirectTo);
      return;
    }
    setError(res.error);
    setBusy(false);
  }, [store, email, password]);

  // ---- Step 2: PIN within the resolved store -----------------------------
  const submitPin = useCallback(
    async (value: string) => {
      if (!store) return;
      setBusy(true);
      setError(null);
      const res = await switchByPin(value, { storeId: store.slug });
      if (res.ok) {
        window.location.assign(res.redirectTo);
        return;
      }
      setError(res.error);
      setPin("");
      setBusy(false);
    },
    [store],
  );

  const push = useCallback(
    (digit: string) => {
      if (busy) return;
      setError(null);
      setPin((prev) => {
        if (prev.length >= 4) return prev;
        const next = prev + digit;
        if (next.length === 4) void submitPin(next);
        return next;
      });
    },
    [busy, submitPin],
  );

  const backspace = useCallback(() => {
    if (busy) return;
    setPin((prev) => prev.slice(0, -1));
  }, [busy]);

  // Physical keyboard while the PIN modal is open. We preventDefault on the keys
  // we handle so digits/backspace are captured by the PIN pad and never leak
  // into the Store ID field sitting behind the modal.
  useEffect(() => {
    if (phase !== "pin" || forgot) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        backToRole();
      } else if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        push(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        backspace();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, forgot, push, backspace, backToRole]);

  return (
    <>
      {/* Inline Store ID field — visible on the form, like a store address. */}
      <label htmlFor="store-id" className="block text-[13px] font-semibold text-ink-soft">
        Store ID
      </label>
      <form
        className="mt-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void resolveStore();
        }}
      >
        <div className="relative">
          <Icon
            name="store"
            className="absolute left-3 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-ink-faint"
            strokeWidth={1.7}
          />
          <input
            id="store-id"
            name="store-id"
            value={storeId}
            onChange={(e) => {
              setStoreId(e.target.value.replace(/\s+/g, "").toLowerCase());
              setError(null);
            }}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            readOnly={phase !== "store"}
            placeholder="your-store"
            className="field-input w-full rounded-[10px] pl-10 pr-[108px] py-3 text-[15px] tracking-tight text-ink"
          />
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] font-medium text-ink-faint pointer-events-none">
            {SUFFIX}
          </span>
        </div>

        {phase === "store" && error && (
          <p className="mt-2 text-[12.5px] font-semibold text-rose-600">{error}</p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-3 inline-flex items-center justify-center gap-2 w-full bg-surface hairline text-ink font-semibold text-[14.5px] py-3 rounded-[10px] hover:border-brand-200 hover:text-brand-600 transition duration-150 disabled:opacity-60"
        >
          {busy && phase === "store" ? "Checking…" : "Continue"}
          {!busy && <Icon name="chevron" className="w-4 h-4 -mr-1" strokeWidth={2} />}
        </button>
      </form>

      {/* Step 2: role chooser, scoped to the resolved store. */}
      {phase === "role" && store && (
        <div
          className="fixed inset-0 z-[120] grid place-items-center px-5"
          role="dialog"
          aria-modal="true"
          aria-label={`Sign in to ${store.name}`}
        >
          <button
            type="button"
            aria-label="Close"
            onClick={backToStore}
            className="absolute inset-0 glass backdrop-blur-sm"
          />
          <div className="relative w-full max-w-[360px] rounded-xl2 bg-surface hairline shadow-soft p-7">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-wide text-brand-600">
                  {store.name}
                </p>
                <h3 className="mt-0.5 text-[1.15rem] font-extrabold tracking-tight">
                  Who&apos;s signing in?
                </h3>
                <p className="mt-1 text-[13px] text-ink-soft">Choose how you work this store.</p>
              </div>
              <button
                type="button"
                onClick={backToStore}
                aria-label="Close"
                className="text-ink-faint hover:text-ink transition -mt-1 -mr-1 p-1"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {/* Cashier → 4-digit PIN within this store. */}
              <button
                type="button"
                onClick={() => setPhase("pin")}
                className="group w-full flex items-center gap-3.5 rounded-[12px] bg-brand-500 hover:bg-brand-600 text-white p-4 shadow-btn transition duration-150 text-left"
              >
                <span className="grid place-items-center w-10 h-10 rounded-[11px] bg-white/15 shrink-0">
                  <Icon name="lock" className="w-5 h-5" strokeWidth={1.8} />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-[15px] tracking-tight">I&apos;m a cashier</span>
                  <span className="block text-[12.5px] text-white/80">Sign in with your 4-digit PIN</span>
                </span>
                <Icon name="chevron" className="w-4 h-4 ml-auto shrink-0 opacity-80" strokeWidth={2} />
              </button>

              {/* Owner / manager → email + password (Google offered as a fallback). */}
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setPhase("owner");
                }}
                className="group w-full flex items-center gap-3.5 rounded-[12px] bg-surface hairline p-4 hover:border-brand-200 transition duration-150 text-left"
              >
                <span className="grid place-items-center w-10 h-10 rounded-[11px] bg-paper hairline shrink-0 text-ink-soft">
                  <Icon name="lock" className="w-5 h-5" strokeWidth={1.8} />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-[15px] tracking-tight">
                    I&apos;m the owner / manager
                  </span>
                  <span className="block text-[12.5px] text-ink-soft">Sign in with your email &amp; password</span>
                </span>
                <Icon name="chevron" className="w-4 h-4 ml-auto shrink-0 text-ink-faint" strokeWidth={2} />
              </button>
            </div>

            <button
              type="button"
              onClick={backToStore}
              className="mt-5 mx-auto block text-[12px] font-semibold text-ink-faint hover:text-ink transition"
            >
              Change Store ID
            </button>
          </div>
        </div>
      )}

      {/* Step 3a: owner / manager email + password, scoped to the resolved store. */}
      {phase === "owner" && store && (
        <div
          className="fixed inset-0 z-[120] grid place-items-center px-5"
          role="dialog"
          aria-modal="true"
          aria-label={`Owner sign-in for ${store.name}`}
        >
          <button
            type="button"
            aria-label="Close"
            onClick={backToStore}
            className="absolute inset-0 glass backdrop-blur-sm"
          />
          <div className="relative w-full max-w-[360px] rounded-xl2 bg-surface hairline shadow-soft p-7">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-wide text-brand-600">
                  {store.name}
                </p>
                <h3 className="mt-0.5 text-[1.15rem] font-extrabold tracking-tight">
                  Owner &amp; manager sign-in
                </h3>
                <p className="mt-1 text-[13px] text-ink-soft">Use your email and password.</p>
              </div>
              <button
                type="button"
                onClick={backToRole}
                aria-label="Close"
                className="text-ink-faint hover:text-ink transition -mt-1 -mr-1 p-1"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            <form
              className="mt-5 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void signInAsOwner();
              }}
            >
              <label className="block">
                <span className="text-[12px] font-semibold text-ink-soft">Email</span>
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
                  autoComplete="email"
                  placeholder="you@store.ph"
                  className="field-input w-full rounded-[10px] px-3.5 py-2.5 text-[14px] text-ink mt-1.5"
                />
              </label>
              <label className="block">
                <span className="text-[12px] font-semibold text-ink-soft">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="field-input w-full rounded-[10px] px-3.5 py-2.5 text-[14px] text-ink mt-1.5"
                />
              </label>

              {error && <p className="text-[12.5px] font-semibold text-rose-600">{error}</p>}

              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[14.5px] py-3 rounded-[10px] shadow-btn transition duration-150 disabled:opacity-60"
              >
                {busy ? "Signing in…" : "Sign in"}
                {!busy && <Icon name="arrow" className="w-4 h-4 -mr-1" strokeWidth={2} />}
              </button>
            </form>

            {/* Google fallback — for owners who haven't set a password yet. */}
            <button
              type="button"
              onClick={() => window.location.assign(GOOGLE_SIGN_IN_URL)}
              className="mt-3 inline-flex items-center justify-center gap-2.5 w-full bg-surface hairline text-ink font-semibold text-[14px] py-2.5 rounded-[10px] hover:border-brand-200 transition duration-150"
            >
              <GoogleGlyph />
              Continue with Google instead
            </button>

            <p className="mt-3 text-center text-[11.5px] text-ink-faint leading-relaxed">
              No password yet? Sign in with Google, then set one under Account.
            </p>

            <button
              type="button"
              onClick={backToRole}
              className="mt-3 mx-auto block text-[12px] font-semibold text-ink-faint hover:text-ink transition"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* Step 3: PIN modal, scoped to the resolved store. */}
      {phase === "pin" && store && (
        <div
          className="fixed inset-0 z-[120] grid place-items-center px-5"
          role="dialog"
          aria-modal="true"
          aria-label={`Cashier PIN for ${store.name}`}
        >
          <button
            type="button"
            aria-label="Close"
            onClick={backToStore}
            className="absolute inset-0 glass backdrop-blur-sm"
          />
          <div className="relative w-full max-w-[360px] rounded-xl2 bg-surface hairline shadow-soft p-7">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-wide text-brand-600">
                  {store.name}
                </p>
                <h3 className="mt-0.5 text-[1.15rem] font-extrabold tracking-tight">
                  Enter your PIN
                </h3>
                <p className="mt-1 text-[13px] text-ink-soft">
                  Cashier sign-in — 4 digits.
                </p>
              </div>
              <button
                type="button"
                onClick={backToRole}
                aria-label="Close"
                className="text-ink-faint hover:text-ink transition -mt-1 -mr-1 p-1"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            {forgot ? (
              <ForgotPin storeId={store.slug} onBack={() => setForgot(false)} />
            ) : (
              <>
                <PinPad
                  pin={pin}
                  error={error}
                  submitting={busy}
                  onPush={push}
                  onBackspace={backspace}
                />

                <div className="mt-5 flex items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={() => setForgot(true)}
                    className="text-[12px] font-semibold text-brand-600 hover:text-brand-700 transition"
                  >
                    Forgot PIN?
                  </button>
                  <span className="text-ink-faint">·</span>
                  <button
                    type="button"
                    onClick={backToRole}
                    className="text-[12px] font-semibold text-ink-faint hover:text-ink transition"
                  >
                    Back
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** Google's multi-color "G" — a brand logo, so it keeps its official colors. */
function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.82-.07-1.6-.2-2.36H12v4.47h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.74Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.88-3a7.2 7.2 0 0 1-10.78-3.77H1.28v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.33a7.18 7.18 0 0 1 0-4.66V6.58H1.28a12 12 0 0 0 0 10.84l4.01-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.44-3.44A11.96 11.96 0 0 0 12 0 12 12 0 0 0 1.28 6.58l4.01 3.09A7.2 7.2 0 0 1 12 4.77Z"
      />
    </svg>
  );
}
