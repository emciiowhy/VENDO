"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../Icon";
import { useToast } from "../Toast";
import { useTheme } from "../theme/ThemeProvider";
import { deactivateStore } from "@/lib/account";
import { logout } from "@/lib/auth";

/**
 * Danger zone (owner only) — deactivate the store. This suspends the tenant and
 * revokes every session, so it's gated behind a password confirmation. On
 * success we log out and bounce to /login; a Super Admin can reactivate later.
 */
export function DangerZoneCard() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl2 bg-surface border border-rose-200 dark:border-rose-900/50 shadow-card p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid place-items-center w-10 h-10 rounded-[11px] bg-rose-50 text-rose-600 shrink-0">
          <Icon name="ban" className="w-5 h-5" strokeWidth={1.7} />
        </span>
        <div className="min-w-0">
          <h2 className="text-[1.05rem] font-extrabold tracking-tight text-rose-700 dark:text-rose-400">
            Deactivate store
          </h2>
          <p className="mt-0.5 text-[13.5px] text-ink-soft leading-relaxed max-w-[60ch]">
            Suspends your store and signs out every device. Your data is kept — a
            VendoPOS administrator can reactivate it. Cashiers won't be able to sign
            in while it's deactivated.
          </p>
        </div>
      </div>
      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-[10px] border border-rose-300 text-rose-600 hover:bg-rose-50 px-5 py-2.5 font-semibold text-[14px] tracking-tight transition duration-150"
        >
          Deactivate store…
        </button>
      </div>
      {open && <DeactivateModal onClose={() => setOpen(false)} />}
    </div>
  );
}

function DeactivateModal({ onClose }: { onClose: () => void }) {
  const { push } = useToast();
  const { theme } = useTheme();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!password) return setError("Enter your account password to confirm.");
    setBusy(true);
    setError(null);
    const res = await deactivateStore(password);
    if (res.ok) {
      push({ variant: "success", title: "Store deactivated" });
      await logout();
      window.location.href = "/login";
      return;
    }
    setBusy(false);
    setError(res.error ?? "Could not deactivate your store.");
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className={theme === "dark" ? "dark" : ""}>
      <div className="fixed inset-0 z-[125] grid place-items-center px-5" role="dialog" aria-modal="true">
        <button type="button" aria-label="Cancel" onClick={onClose} className="absolute inset-0 bg-black/45 backdrop-blur-sm overlay-backdrop" />
        <div className="relative w-full max-w-[400px] rounded-xl2 bg-surface hairline shadow-soft p-6 overlay-card">
          <div className="grid place-items-center w-11 h-11 rounded-[12px] bg-rose-50 text-rose-600">
            <Icon name="ban" className="w-5 h-5" strokeWidth={1.8} />
          </div>
          <h3 className="mt-4 text-[1.1rem] font-extrabold tracking-tight">Deactivate this store?</h3>
          <p className="mt-1.5 text-[13.5px] text-ink-soft leading-relaxed">
            This signs out every device and suspends the store until an administrator
            reactivates it. Confirm with your account password.
          </p>
          <label className="block mt-4">
            <span className="text-[12px] font-semibold text-ink-soft">Account password</span>
            <input
              type="password"
              value={password}
              autoFocus
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="field-input rounded-[10px] px-3.5 py-2.5 text-[14px] w-full mt-1.5"
            />
          </label>
          {error && <p className="mt-2 text-[12.5px] font-semibold text-rose-600">{error}</p>}
          <div className="mt-5 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-[10px] text-[14px] font-semibold text-ink-soft hover:bg-paper transition duration-150"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={busy}
              className="bg-rose-600 hover:bg-rose-700 text-white font-semibold text-[14px] px-5 py-2.5 rounded-[10px] shadow-btn tracking-tight transition duration-150 disabled:opacity-50"
            >
              {busy ? "Deactivating…" : "Deactivate store"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
