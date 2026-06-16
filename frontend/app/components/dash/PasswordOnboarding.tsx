"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { useToast } from "../Toast";
import { getPasswordStatus, setPassword } from "@/lib/auth";

/**
 * First-run onboarding for owners/managers who signed in with Google and don't
 * yet have a password. It surfaces once (per browser session) as a welcoming
 * prompt to set a Store ID + email + password sign-in, so next time they don't
 * need Google. Skippable — they can always set one later under Account, and the
 * server scopes everything to their session.
 *
 * Existing accounts were backfilled with a default password, so `hasPassword`
 * is already true for them and this never shows; it's only the genuinely new.
 */
const MIN_LENGTH = 8;
const SKIP_KEY = "vp_pw_onboard_skipped";

export function PasswordOnboarding() {
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem(SKIP_KEY) === "1") return;
    let alive = true;
    void (async () => {
      const res = await getPasswordStatus();
      if (!alive) return;
      // Only prompt the genuinely password-less; never nag if the status call
      // fails (managers without store-management scope simply won't see it).
      if (res.ok && !res.hasPassword) setOpen(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  function dismiss() {
    if (typeof window !== "undefined") sessionStorage.setItem(SKIP_KEY, "1");
    setOpen(false);
  }

  async function submit() {
    if (next.length < MIN_LENGTH) return setError(`Use at least ${MIN_LENGTH} characters.`);
    if (next !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    setError(null);
    const res = await setPassword({ newPassword: next });
    if (res.ok) {
      push({ variant: "success", title: "Password set", message: "You can now sign in with your email and password." });
      if (typeof window !== "undefined") sessionStorage.setItem(SKIP_KEY, "1");
      setOpen(false);
      return;
    }
    setBusy(false);
    setError(res.error ?? (res.errors ? Object.values(res.errors)[0] : "Could not set your password."));
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center px-5" role="dialog" aria-modal="true" aria-label="Set a password">
      <button type="button" aria-label="Close" onClick={dismiss} className="absolute inset-0 bg-black/45 backdrop-blur-sm overlay-backdrop" />
      <div className="relative w-full max-w-[420px] rounded-xl2 bg-surface hairline shadow-soft p-6 overlay-card">
        <span className="grid place-items-center w-11 h-11 rounded-[12px] bg-brand-50 text-brand-600">
          <Icon name="lock" className="w-5 h-5" strokeWidth={1.8} />
        </span>
        <h3 className="mt-4 text-[1.15rem] font-extrabold tracking-tight">Secure your account</h3>
        <p className="mt-1.5 text-[13.5px] text-ink-soft leading-relaxed max-w-[44ch]">
          Set a password so you can sign in with your <span className="font-semibold text-ink">Store ID</span>,
          email and password — no Google needed next time. You can change it anytime under Account.
        </p>

        <form
          className="mt-5 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="block">
            <span className="text-[12px] font-semibold text-ink-soft">New password (min {MIN_LENGTH} characters)</span>
            <input
              type="password"
              value={next}
              onChange={(e) => {
                setNext(e.target.value);
                setError(null);
              }}
              autoComplete="new-password"
              placeholder="••••••••"
              className="field-input w-full rounded-[10px] px-3.5 py-2.5 text-[14px] mt-1.5"
            />
          </label>
          <label className="block">
            <span className="text-[12px] font-semibold text-ink-soft">Confirm password</span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                setError(null);
              }}
              autoComplete="new-password"
              placeholder="••••••••"
              className="field-input w-full rounded-[10px] px-3.5 py-2.5 text-[14px] mt-1.5"
            />
          </label>

          {error && <p className="text-[12.5px] font-semibold text-rose-600">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-[10px] bg-brand-500 hover:bg-brand-600 py-3 font-semibold text-white shadow-btn tracking-tight transition duration-150 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Set password"}
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="w-full text-center text-[12.5px] font-semibold text-ink-faint hover:text-ink transition"
          >
            I&apos;ll do this later
          </button>
        </form>
      </div>
    </div>
  );
}
