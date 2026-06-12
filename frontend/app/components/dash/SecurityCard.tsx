"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { useToast } from "../Toast";
import { getPasswordStatus, setPassword } from "@/lib/auth";

/**
 * Owner/manager account security — set or change the password used for the
 * Store ID + email + password sign-in. Self-service: the manager reached this
 * page via Google (or an existing password), so the first time there's nothing
 * to confirm; once a password exists, changing it requires the current one.
 * The session scopes everything server-side.
 */
const MIN_LENGTH = 8;

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; hasPassword: boolean };

export function SecurityCard() {
  const { push } = useToast();
  const [state, setState] = useState<State>({ status: "loading" });
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getPasswordStatus();
      if (!alive) return;
      if (res.ok) setState({ status: "ready", hasPassword: res.hasPassword });
      else setState({ status: "error", message: res.error });
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (state.status === "loading") {
    return <div className="max-w-[520px] h-[320px] rounded-xl2 bg-surface hairline shadow-card animate-pulse" />;
  }
  if (state.status === "error") {
    return (
      <div className="max-w-[520px] rounded-xl2 bg-surface hairline shadow-card p-8 text-center">
        <p className="text-[14px] font-semibold text-rose-600">{state.message}</p>
      </div>
    );
  }

  const hasPassword = state.hasPassword;

  async function submit() {
    if (hasPassword && !current) return setError("Enter your current password.");
    if (next.length < MIN_LENGTH) return setError(`New password must be at least ${MIN_LENGTH} characters.`);
    if (next !== confirm) return setError("The two new passwords don't match.");
    setBusy(true);
    setError(null);
    const res = await setPassword({
      currentPassword: hasPassword ? current : undefined,
      newPassword: next,
    });
    if (res.ok) {
      push({ variant: "success", title: hasPassword ? "Password changed" : "Password set" });
      setCurrent("");
      setNext("");
      setConfirm("");
      setState({ status: "ready", hasPassword: true });
      setBusy(false);
      return;
    }
    setBusy(false);
    setError(res.error ?? (res.errors ? Object.values(res.errors)[0] : "Could not update your password."));
  }

  return (
    <div className="max-w-[520px] rounded-xl2 bg-surface hairline shadow-card p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid place-items-center w-10 h-10 rounded-[11px] bg-brand-50 text-brand-600 shrink-0">
          <Icon name="lock" className="w-5 h-5" strokeWidth={1.7} />
        </span>
        <div>
          <h2 className="text-[1.05rem] font-extrabold tracking-tight">
            {hasPassword ? "Change your password" : "Set a password"}
          </h2>
          <p className="mt-0.5 text-[13.5px] text-ink-soft leading-relaxed max-w-[52ch]">
            {hasPassword ? (
              <>Update the password you use to sign in with your Store ID and email.</>
            ) : (
              <>
                Add a password so you can sign in with your <span className="font-semibold text-ink">Store ID</span>,
                email and password — no Google needed next time.
              </>
            )}
          </p>
        </div>
      </div>

      <form
        className="mt-5 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {hasPassword && (
          <Field label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" />
        )}
        <Field
          label={`New password (min ${MIN_LENGTH} characters)`}
          value={next}
          onChange={setNext}
          autoComplete="new-password"
        />
        <Field label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        {error && <p className="text-[12.5px] font-semibold text-rose-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-[10px] bg-brand-500 hover:bg-brand-600 py-3 font-semibold text-white shadow-btn tracking-tight transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? "Saving…" : hasPassword ? "Change password" : "Set password"}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-semibold text-ink-soft">{label}</span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder="••••••••"
        className="field-input rounded-[10px] px-3.5 py-2.5 text-[14px] w-full mt-1.5"
      />
    </label>
  );
}
