import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { IconSprite, Icon } from "../../components/Icon";
import { BrandMark } from "../../components/BrandMark";
import { SignupForm } from "../../components/auth/SignupForm";

export const metadata: Metadata = {
  title: "Start your free trial — VendoPOS",
  description:
    "Create your VendoPOS store in minutes and explore the platform on a 14-day free trial — no card required.",
  robots: { index: false, follow: false },
};

/** Value props shown on the brand rail (signup-flavoured). */
const HIGHLIGHTS = [
  { icon: "bolt", text: "Your store is live in under a minute — no waiting on a demo." },
  { icon: "box", text: "We pre-load sample products and a sale so the dashboard isn't empty." },
  { icon: "shield", text: "Your own isolated tenant from the first second — data stays yours." },
] as const;

/**
 * Self-service signup entry point. Same split layout as /login — a brand rail on
 * the left, the streamlined trial form on the right. The form reads the chosen
 * plan from `?plan=`, so it's wrapped in Suspense (useSearchParams).
 */
export default function SignupPage() {
  return (
    <>
      <IconSprite />
      <main className="min-h-screen lg:grid lg:grid-cols-2">
        {/* ── Brand rail (lg+) ─────────────────────────────────────────── */}
        <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-brand-600 text-white p-10 xl:p-14">
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
              Try the whole platform.
              <br />
              Free for 14 days.
            </h2>
            <p className="mt-4 max-w-[42ch] text-[15px] text-white/80 leading-relaxed">
              Spin up your own VendoPOS store and explore the POS, inventory and reports with sample
              data already in place. No card, no commitment.
            </p>
            <ul className="mt-8 space-y-3.5">
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

          <div className="relative rounded-xl2 bg-white/10 backdrop-blur-sm p-5 max-w-[36ch]">
            <p className="font-extrabold text-[15px] tracking-tight">Need a hand?</p>
            <p className="mt-1 text-[13px] text-white/80 leading-relaxed">
              We&apos;re here 7 days a week at{" "}
              <span className="font-semibold text-white">support@vendopos.app</span> — or book a
              guided walkthrough anytime.
            </p>
          </div>
        </aside>

        {/* ── Form column ──────────────────────────────────────────────── */}
        <div className="grid-bg flex flex-col min-h-screen">
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
                  Create your store
                </h1>
                <p className="mt-2 text-[14.5px] text-ink-soft leading-relaxed">
                  Four quick details and you&apos;re in — we&apos;ll set up your workspace with sample
                  data so you can start exploring right away.
                </p>
              </div>

              <div className="mt-7">
                <Suspense fallback={null}>
                  <SignupForm />
                </Suspense>
              </div>

              <p className="mt-7 text-center text-[13.5px] text-ink-soft">
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="text-ink hover:text-brand-600 font-semibold transition duration-150"
                >
                  Log in
                </Link>
              </p>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
