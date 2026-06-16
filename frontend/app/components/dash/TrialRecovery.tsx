"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "../Icon";
import { BrandMark } from "../BrandMark";
import { ConfirmDialog } from "../ConfirmDialog";
import { logout, type SessionUser } from "@/lib/auth";

/**
 * The graceful billing/recovery view shown in place of the dashboard once a
 * store's 14-day trial has lapsed (session status `trial_expired`). It's a
 * deliberately standalone full-screen surface — it does NOT mount the sidebar,
 * notification bell or any module panel, so none of the now-402'd module APIs
 * fire behind it. The owner's data is untouched and explicitly reassured; the
 * single job here is to route them to pick a plan and reactivate.
 *
 * Built entirely from semantic tokens (paper / surface / ink / brand) so it reads
 * correctly in light and dark, mirroring DashShell's own loader.
 */
export function TrialRecovery({ user, dark }: { user: SessionUser; dark: boolean }) {
  const [signOutOpen, setSignOutOpen] = useState(false);
  const storeName = user.tenantName ?? "your store";
  const endedOn = formatEnded(user.trialEndsAt);

  return (
    <div
      data-vp-theme=""
      className={
        "theme-root grid-bg min-h-screen grid place-items-center px-5 py-12 bg-paper text-ink " +
        (dark ? "dark" : "")
      }
    >
      <div className="w-full max-w-[480px]">
        <div className="flex items-center gap-2.5">
          <BrandMark className="w-8 h-8" />
          <span className="font-extrabold text-[18px] tracking-tightest">VendoPOS</span>
        </div>

        <div className="mt-6 rounded-xl2 bg-surface hairline shadow-card p-7 sm:p-8 relative overflow-hidden">
          {/* Soft brand wash — premium without a hardcoded colour. */}
          <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-brand-50 blur-2xl" />

          <div className="relative">
            <span className="grid place-items-center w-12 h-12 rounded-[13px] bg-brand-50 text-brand-600">
              <Icon name="bolt" className="w-6 h-6" strokeWidth={1.8} />
            </span>

            <h1 className="mt-5 text-[1.55rem] font-extrabold tracking-tight leading-tight">
              Your free trial has ended
            </h1>
            <p className="mt-2.5 text-[14.5px] leading-relaxed text-ink-soft">
              The 14-day trial for <span className="font-semibold text-ink">{storeName}</span>
              {endedOn ? ` ended on ${endedOn}` : " has ended"}. Everything you set up is safe —
              your workspace is just paused until you choose a plan.
            </p>

            <div className="mt-5 rounded-[12px] bg-paper hairline p-4 flex items-start gap-3">
              <Icon name="shield" className="w-[18px] h-[18px] text-brand-600 mt-0.5 shrink-0" strokeWidth={1.8} />
              <p className="text-[13px] leading-relaxed text-ink-soft">
                Your products, sales history and settings are kept intact. Subscribe and you&apos;ll
                pick up exactly where you left off.
              </p>
            </div>

            <div className="mt-6 flex flex-col gap-3">
              <Link
                href="/#pricing"
                className="inline-flex items-center justify-center gap-2 rounded-[11px] bg-brand-500 hover:bg-brand-600 px-5 py-3 text-[14.5px] font-semibold text-white shadow-btn tracking-tight transition duration-150"
              >
                <Icon name="bolt" className="w-[17px] h-[17px]" strokeWidth={1.9} />
                Choose a plan &amp; reactivate
              </Link>
              <Link
                href="/enterprise"
                className="inline-flex items-center justify-center gap-2 rounded-[11px] bg-surface hairline px-5 py-3 text-[14px] font-semibold text-ink hover:border-brand-200 hover:text-brand-600 transition duration-150"
              >
                Running multiple locations? Talk to our team
                <Icon name="arrow" className="w-[16px] h-[16px]" strokeWidth={1.8} />
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between text-[13px]">
          <span className="text-ink-faint font-semibold">
            Signed in as {user.email || user.name}
          </span>
          <button
            type="button"
            onClick={() => setSignOutOpen(true)}
            className="inline-flex items-center gap-1.5 font-semibold text-ink-soft hover:text-rose-600 transition duration-150"
          >
            <Icon name="logout" className="w-4 h-4" strokeWidth={1.7} />
            Sign out
          </button>
        </div>
      </div>

      {signOutOpen && (
        <ConfirmDialog
          title="Sign out?"
          message="You'll be returned to the login screen and will need to sign in again to continue."
          confirmLabel="Sign out"
          icon="logout"
          danger
          onCancel={() => setSignOutOpen(false)}
          onConfirm={() => logout().then(() => (window.location.href = "/login"))}
        />
      )}
    </div>
  );
}

/** Format the trial-end ISO timestamp as a plain calendar date, or null when absent/invalid. */
function formatEnded(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}
