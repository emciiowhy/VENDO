"use client";

import { useSearchParams } from "next/navigation";
import { LOGIN_ERRORS } from "@/lib/auth";

/**
 * Surfaces the `?error=<code>` the backend redirects to /login with when an
 * OAuth attempt is turned away (unknown account, expired state, etc.). Rendered
 * inside a <Suspense> boundary because useSearchParams reads request data.
 */
export function LoginNotice() {
  const params = useSearchParams();
  const code = params.get("error");
  if (!code) return null;

  const message = LOGIN_ERRORS[code] ?? "We couldn’t sign you in. Please try again.";

  return (
    <div
      role="alert"
      className="mb-5 flex items-start gap-2.5 rounded-[12px] bg-rose-50 border border-rose-200/70 px-4 py-3 text-[13px] text-rose-700 leading-relaxed"
    >
      <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] mt-px shrink-0" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5M12 16h.01" />
      </svg>
      <span>{message}</span>
    </div>
  );
}
