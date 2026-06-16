"use client";

import Link from "next/link";
import { Icon, IconSprite } from "@/app/components/Icon";
import { BrandMark } from "@/app/components/BrandMark";
import { ThemeToggle } from "@/app/components/theme/ThemeToggle";
import { useTheme } from "@/app/components/theme/ThemeProvider";
import { useSession, homeForRole } from "@/app/components/auth/useSession";
import { EssPortal } from "@/app/components/ess/EssPortal";
import { MyClockRecords } from "@/app/components/ess/MyClockRecords";

/**
 * Employee Self-Service portal at /me. Open to ANY signed-in staff member
 * (including cashiers on a shared terminal) — so it deliberately doesn't use the
 * merchant DashShell or its nav. The backend resolves the record from the
 * session cookie; this page never carries a tenant or employee id.
 */
export default function MyHrPage() {
  const session = useSession();
  const { theme } = useTheme();

  if (session.status !== "authed") {
    return (
      <div className={"theme-root min-h-screen grid place-items-center bg-paper text-ink " + (theme === "dark" ? "dark" : "")}>
        <div className="flex items-center gap-3 text-ink-soft">
          <BrandMark className="w-9 h-9 animate-pulse" />
          <span className="text-[14px] font-semibold">Loading your record…</span>
        </div>
      </div>
    );
  }

  const { user } = session;

  return (
    <div className={"theme-root min-h-screen bg-paper text-ink " + (theme === "dark" ? "dark" : "")}>
      <IconSprite />
      <header className="sticky top-0 z-10 glass hairline-b">
        <div className="max-w-[1000px] mx-auto flex items-center gap-4 px-5 sm:px-8 h-[68px]">
          <div className="flex items-center gap-2.5">
            <BrandMark className="w-8 h-8" />
            <div className="leading-tight">
              <div className="font-extrabold text-[15px] tracking-tightest">My record</div>
              <div className="text-[11px] font-semibold text-ink-faint">Employee self-service</div>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
            <Link
              href={homeForRole(user.role)}
              className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-ink-soft hover:text-ink transition"
            >
              <Icon name="arrow" className="w-4 h-4 rotate-180" />
              Back to work
            </Link>
          </div>
        </div>
      </header>
      <main className="max-w-[1000px] mx-auto px-5 sm:px-8 py-7 space-y-5">
        {/* Shift-clock history loads from the time-clock engine and shows for any
            signed-in worker, independent of the payroll-gated ESS profile below. */}
        <MyClockRecords />
        <EssPortal greetingName={user.name} />
      </main>
    </div>
  );
}
