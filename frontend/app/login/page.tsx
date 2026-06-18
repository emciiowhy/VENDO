import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { IconSprite, Icon } from "../components/Icon";
import { StoreSignIn } from "../components/auth/StoreSignIn";
import { OwnerPasswordSignIn } from "../components/auth/OwnerPasswordSignIn";
import { LoginNotice } from "../components/auth/LoginNotice";
import { BrandMark } from "../components/BrandMark";
import { GOOGLE_SIGN_IN_URL } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Sign in — VendoPOS",
  description:
    "Sign in to your VendoPOS store dashboard with Google, or sign in to a shared terminal with your Store ID and cashier PIN.",
  robots: { index: false, follow: false },
};

/** Value props shown on the brand rail. */
const HIGHLIGHTS = [
  { icon: "shield", text: "Each store is its own tenant — tills and data stay isolated." },
  { icon: "wallet", text: "Cash, GCash, Maya & QRPH at the point of sale." },
  { icon: "file", text: "BIR-ready receipts and e-invoicing built in." },
] as const;

/**
 * The single VendoPOS sign-in entry point — a split layout: a brand rail on the
 * left, the auth controls on the right.
 *
 *  • Merchants (owners/managers) and the Super Admin authenticate with one
 *    "Sign in with Google" button — the backend resolves the role from our own
 *    rows and routes them to the right dashboard. They don't need a Store ID;
 *    their email already maps to exactly one tenant.
 *  • Cashiers on a shared shop-floor terminal first enter their Store ID (which
 *    scopes them to one tenant), then a 4-digit PIN.
 *  • Leads don't authenticate — a low-emphasis link points misplaced prospects
 *    back to the landing-page demo form.
 */
export default function LoginPage() {
  return (
    <>
      <IconSprite />
      <main className="min-h-screen lg:grid lg:grid-cols-2">
        {/* ── Brand rail (lg+) ─────────────────────────────────────────── */}
        <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-brand-600 text-white p-10 xl:p-14">
          {/* Faint grid + glow, keeping it on-brand rather than a stock photo. */}
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />
          <div
            aria-hidden="true"
            className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-brand-500/40 blur-3xl"
          />

          <Link href="/" className="relative inline-flex items-center gap-2.5 w-fit">
            <BrandMark className="w-8 h-8" />
            <span className="font-extrabold text-[19px] tracking-tightest">VendoPOS</span>
          </Link>

          <div className="relative">
            <h2 className="text-[2rem] xl:text-[2.35rem] font-extrabold tracking-tightest leading-[1.1]">
              One terminal.
              <br />
              Every till, kept apart.
            </h2>
            <p className="mt-4 max-w-[42ch] text-[15px] text-white/80 leading-relaxed">
              The multi-tenant POS &amp; ERP built for Philippine retail. Sign in to your store
              dashboard, or open a shared register on the floor.
            </p>
            <ul className="mt-8 space-y-4">
              {HIGHLIGHTS.map((h) => (
                <li key={h.icon} className="flex items-start gap-3">
                  <span className="mt-0.5 grid place-items-center w-7 h-7 rounded-[9px] bg-white/12 shrink-0">
                    <Icon name={h.icon} className="w-[16px] h-[16px] text-white" strokeWidth={1.7} />
                  </span>
                  <span className="text-[14px] text-white/85 leading-relaxed">{h.text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Support blurb, in the spirit of the reference's "Questions?" panel. */}
          <div className="relative rounded-xl2 bg-white/10 backdrop-blur-sm p-5 max-w-[36ch]">
            <p className="font-extrabold text-[15px] tracking-tight">Questions?</p>
            <p className="mt-1 text-[13px] text-white/80 leading-relaxed">
              Our team is here 7 days a week. Reach us at{" "}
              <span className="font-semibold text-white">support@vendopos.app</span> by chat, email,
              or phone.
            </p>
          </div>
        </aside>

        {/* ── Auth column ──────────────────────────────────────────────── */}
        <div className="grid-bg flex flex-col min-h-screen">
          {/* Brand mark for small screens, where the rail is hidden. */}
          <header className="px-6 py-6 lg:hidden">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <BrandMark className="w-8 h-8" />
              <span className="font-extrabold text-[19px] tracking-tightest">VendoPOS</span>
            </Link>
          </header>

          <div className="flex-1 grid place-items-center px-5 pb-16 pt-2 lg:pt-16">
            <div className="w-full max-w-[400px]">
              <div>
                <h1 className="text-[1.75rem] font-extrabold tracking-tightest leading-tight">
                  Log in to your account
                </h1>
                <p className="mt-2 text-[14.5px] text-ink-soft leading-relaxed">
                  Owners &amp; managers sign in with Google or a password. Or enter your Store ID and
                  choose whether you&apos;re a cashier or the owner.
                </p>
              </div>

              <div className="mt-7">
                <Suspense fallback={null}>
                  <LoginNotice />
                </Suspense>

                {/* Primary action — direct top-level navigation to the backend. */}
                <a
                  href={GOOGLE_SIGN_IN_URL}
                  className="press inline-flex items-center justify-center gap-3 w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[15px] tracking-tight py-3.5 rounded-[10px] shadow-btn"
                >
                  <span className="grid place-items-center w-[22px] h-[22px] rounded-full bg-white">
                    <GoogleGlyph />
                  </span>
                  Continue with Google
                </a>
                <p className="mt-2 text-center text-[12px] text-ink-faint">
                  For store owners &amp; managers
                </p>

                {/* Alternative for managers who've set a password (self-service). */}
                <OwnerPasswordSignIn />

                {/* Divider into the Store ID path (cashier PIN or owner → Google). */}
                <div className="my-5 flex items-center gap-3 text-[12px] font-semibold text-ink-faint">
                  <span className="h-px flex-1 bg-ink/8" />
                  OR SIGN IN WITH YOUR STORE ID
                  <span className="h-px flex-1 bg-ink/8" />
                </div>

                <StoreSignIn />
              </div>

              {/* The Lead drop-in: misplaced prospects routed back to the demo form. */}
              <p className="mt-7 text-center text-[13.5px] text-ink-soft">
                New to VendoPOS?{" "}
                <Link
                  href="/#demo"
                  className="text-ink hover:text-brand-600 font-semibold transition duration-150"
                >
                  Request a demo
                </Link>
              </p>

              <p className="mt-5 text-center text-[12px] text-ink-faint leading-relaxed max-w-[36ch] mx-auto">
                Accounts are provisioned by VendoPOS — there’s no self-serve sign-up. Trouble signing
                in? Reach your administrator.
              </p>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

/** Google's multi-color "G" — a brand logo, so it keeps its official colors. */
function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="w-[15px] h-[15px]" aria-hidden="true">
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
