"use client";

import { useState } from "react";
import { Icon } from "../Icon";
import { stopImpersonation } from "@/lib/auth";

/**
 * The impersonation escape hatch — a high-contrast brand bar back to the platform
 * console. Render it only when the signed-in session carries `isImpersonating`
 * (a SUPER_ADMIN viewing an owner workspace), so an ordinary merchant can never
 * see or trigger it. Shared by the normal back-office shell ({@link DashShell})
 * and the full-screen trial-recovery fallback ({@link TrialRecovery}), so the
 * admin is never stranded inside a tenant view.
 *
 * Returning hits POST /auth/impersonate/stop — the server restores the admin's
 * own session cookie WITHOUT touching their primary auth — then a full navigation
 * to the returned /admin path resets the cached session so the Super Admin lands
 * on an authorized console route (never bounced to login, the bug this fixes). A
 * bare router.push would carry the stale impersonated session and fail the guard.
 */
export function ImpersonationBanner({ tenantName }: { tenantName: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onReturn() {
    setBusy(true);
    setError(null);
    const res = await stopImpersonation();
    if (res.ok) {
      window.location.assign(res.redirectTo);
      return; // navigating away — keep the spinner up
    }
    setError(res.error);
    setBusy(false);
  }

  return (
    <div className="bg-brand-600 text-white">
      <div className="flex items-center gap-3 px-5 sm:px-8 py-2.5">
        <Icon name="shield" className="w-[18px] h-[18px] shrink-0" strokeWidth={1.9} />
        <p className="min-w-0 truncate text-[13px] font-semibold">
          Super Admin view{tenantName ? ` · ${tenantName}` : ""}
          <span className="hidden font-normal text-white/80 sm:inline">
            {" "}— you’re browsing this store as the platform admin.
          </span>
        </p>
        <button
          type="button"
          onClick={() => void onReturn()}
          disabled={busy}
          className="ml-auto shrink-0 inline-flex items-center gap-1.5 rounded-[9px] bg-white/15 px-3 py-1.5 text-[12.5px] font-bold tracking-tight transition duration-150 hover:bg-white/25 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Icon name="arrow" className="w-[15px] h-[15px] rotate-180" strokeWidth={2} />
          {busy ? "Returning…" : "Return to Super Admin Portal"}
        </button>
      </div>
      {error && <p className="px-5 pb-2 text-[12px] font-semibold text-white sm:px-8">{error}</p>}
    </div>
  );
}
