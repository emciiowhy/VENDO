"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { verifyLeadEmail } from "@/lib/api";

/**
 * Landing page for the verification link in the demo-request email. It reads the
 * token straight off the URL (no useSearchParams, so no Suspense boundary needed
 * on this client page — same approach as ProcurementConsole) and posts it to the
 * API, then shows the outcome. The token travels in a POST body rather than being
 * consumed by the GET that merely loads this page, so an email client prefetch
 * can't silently burn it.
 */
type State =
  | { status: "verifying" }
  | { status: "success" }
  | { status: "error"; message: string };

export default function VerifyEmailPage() {
  const [state, setState] = useState<State>({ status: "verifying" });

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token") ?? "";
    if (!token) {
      setState({ status: "error", message: "This link is missing its verification token." });
      return;
    }
    let alive = true;
    void (async () => {
      const res = await verifyLeadEmail(token);
      if (!alive) return;
      setState(
        res.ok
          ? { status: "success" }
          : { status: "error", message: res.error ?? "We couldn't verify your email." },
      );
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="grid-bg min-h-screen grid place-items-center px-5">
      <div className="w-full max-w-[420px] rounded-xl2 bg-surface hairline shadow-soft p-8 text-center">
        {state.status === "verifying" && (
          <>
            <Spinner />
            <h1 className="mt-4 text-[1.3rem] font-extrabold tracking-tightest">Confirming your email…</h1>
            <p className="mt-2 text-[14px] text-ink-soft">Hang tight, this only takes a moment.</p>
          </>
        )}

        {state.status === "success" && (
          <>
            <Badge tone="success">✓</Badge>
            <h1 className="mt-4 text-[1.3rem] font-extrabold tracking-tightest">Email confirmed 🎉</h1>
            <p className="mt-2 text-[14px] text-ink-soft leading-relaxed">
              Thanks for confirming your address. Our team will review your demo request and get your
              store set up — you&apos;ll receive your sign-in details by email once it&apos;s ready.
            </p>
            <Link
              href="/"
              className="press mt-6 inline-flex items-center justify-center w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[15px] py-3 rounded-[10px] shadow-btn"
            >
              Back to VendoPOS
            </Link>
          </>
        )}

        {state.status === "error" && (
          <>
            <Badge tone="error">!</Badge>
            <h1 className="mt-4 text-[1.3rem] font-extrabold tracking-tightest">We couldn&apos;t confirm that</h1>
            <p className="mt-2 text-[14px] text-ink-soft leading-relaxed">{state.message}</p>
            <Link
              href="/#demo"
              className="press mt-6 inline-flex items-center justify-center w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[15px] py-3 rounded-[10px] shadow-btn"
            >
              Request a new demo
            </Link>
          </>
        )}
      </div>
    </main>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block w-9 h-9 rounded-full border-[3px] border-brand-200 border-t-brand-500 animate-spin"
      aria-hidden
    />
  );
}

function Badge({ tone, children }: { tone: "success" | "error"; children: React.ReactNode }) {
  const cls =
    tone === "success"
      ? "bg-accent-50 text-accent-600 dark:bg-accent-500/10 dark:text-accent-400"
      : "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400";
  return (
    <span className={"inline-grid place-items-center w-14 h-14 rounded-full text-[26px] font-black " + cls}>
      {children}
    </span>
  );
}
