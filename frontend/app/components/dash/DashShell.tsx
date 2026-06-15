"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, IconSprite, type IconName } from "../Icon";
import { useSession } from "../auth/useSession";
import { useTheme } from "../theme/ThemeProvider";
import { ThemeToggle } from "../theme/ThemeToggle";
import { AccentProvider, TenantTheme, useAccent } from "../theme/TenantTheme";
import { ToastProvider } from "../Toast";
import { ConfirmDialog } from "../ConfirmDialog";
import { NotificationBell } from "./NotificationBell";
import { BrandMark } from "../BrandMark";
import { logout, type SessionUser } from "@/lib/auth";
import { resolveAssetUrl } from "@/lib/images";

export interface NavItem {
  label: string;
  icon: IconName;
  href: string;
  /** Visual-only tiles for modules not yet built — shown muted, not linked. */
  soon?: boolean;
}

export interface NavGroup {
  heading?: string;
  items: NavItem[];
}

const UserContext = createContext<SessionUser | null>(null);
/** Read the authenticated user from inside a DashShell. */
export function useDashUser(): SessionUser {
  const u = useContext(UserContext);
  if (!u) throw new Error("useDashUser must be used inside <DashShell>");
  return u;
}

const ROLE_LABEL: Record<SessionUser["role"], string> = {
  SUPER_ADMIN: "Super Admin",
  MERCHANT_OWNER: "Owner",
  MANAGER: "Manager",
  CASHIER: "Cashier",
};

/**
 * The shared back-office frame for /admin and /dashboard: a fixed brand
 * sidebar, a glass top bar carrying the page title + the signed-in identity,
 * and the routed content. Guards the route via useSession — an unauthenticated
 * visitor is bounced to /login before any content renders.
 */
export function DashShell({
  title,
  subtitle,
  nav,
  brandSub,
  allow,
  children,
}: {
  title: string;
  subtitle?: string;
  nav: NavGroup[];
  brandSub: string;
  allow?: SessionUser["role"][];
  children: ReactNode;
}) {
  const session = useSession(allow);
  const pathname = usePathname();
  const { theme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);

  if (session.status !== "authed") {
    return <BrandLoader dark={theme === "dark"} />;
  }
  const user = session.user;
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  const avatarUrl = resolveAssetUrl(user.avatarUrl);

  return (
    <UserContext.Provider value={user}>
      <AccentProvider initial={user.themeColor}>
      <ToastProvider>
      <IconSprite />
      <div
        data-vp-theme=""
        className={
          "theme-root min-h-screen bg-paper text-ink lg:grid lg:grid-cols-[260px_1fr] " +
          (theme === "dark" ? "dark" : "")
        }
      >
        <ShellAccentStyle />
        {/* Sidebar */}
        <aside
          className={
            "fixed inset-y-0 left-0 z-40 w-[260px] bg-surface hairline-r flex flex-col transition-transform duration-150 ease-in-out lg:static lg:translate-x-0 " +
            (mobileOpen ? "translate-x-0" : "-translate-x-full")
          }
        >
          <div className="h-[68px] flex items-center gap-2.5 px-6 hairline-b">
            <StoreBrand user={user} brandSub={brandSub} />
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
            {nav.map((group, gi) => (
              <div key={gi}>
                {group.heading && (
                  <div className="px-3 pb-1.5 text-[11px] font-bold tracking-wide text-ink-faint uppercase">
                    {group.heading}
                  </div>
                )}
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = pathname === item.href;
                    const base =
                      "flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[14px] font-semibold transition duration-150";
                    if (item.soon) {
                      return (
                        <div
                          key={item.label}
                          className={base + " text-ink-faint cursor-default select-none"}
                        >
                          <Icon name={item.icon} className="w-[18px] h-[18px]" />
                          {item.label}
                          <span className="ml-auto text-[10px] font-bold bg-paper hairline rounded-full px-2 py-0.5">
                            soon
                          </span>
                        </div>
                      );
                    }
                    return (
                      <Link
                        key={item.label}
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={
                          base +
                          (active
                            ? " bg-brand-50 text-brand-700"
                            : " text-ink-soft hover:text-ink hover:bg-paper")
                        }
                      >
                        <Icon
                          name={item.icon}
                          className="w-[18px] h-[18px]"
                          strokeWidth={active ? 1.9 : 1.6}
                        />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="p-3 hairline-t">
            <button
              type="button"
              onClick={() => setSignOutOpen(true)}
              className="flex w-full items-center gap-3 px-3 py-2.5 rounded-[10px] text-[14px] font-semibold text-ink-soft hover:text-rose-600 hover:bg-rose-50 transition duration-150"
            >
              <Icon name="logout" className="w-[18px] h-[18px]" />
              Sign out
            </button>
          </div>
        </aside>

        {mobileOpen && (
          <button
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          />
        )}

        {/* Main column */}
        <div className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-10 glass hairline-b">
            <div className="flex items-center gap-4 px-5 sm:px-8 h-[68px]">
              <button
                type="button"
                aria-label="Open menu"
                onClick={() => setMobileOpen(true)}
                className="lg:hidden text-ink-soft hover:text-ink transition"
              >
                <Icon name="menu" className="w-6 h-6" />
              </button>
              <div className="min-w-0">
                <h1 className="text-title font-extrabold truncate">
                  {title}
                </h1>
                {subtitle && (
                  <p className="text-fine text-ink-soft truncate">{subtitle}</p>
                )}
              </div>

              <div className="ml-auto flex items-center gap-3">
                <ThemeToggle />
                <NotificationBell />
                <div className="flex items-center gap-2.5 pl-1">
                  <div className="hidden sm:block text-right leading-tight">
                    <div className="text-note font-bold tracking-tight">{user.name}</div>
                    <div className="text-cap font-semibold text-ink-faint">
                      {ROLE_LABEL[user.role]}
                    </div>
                  </div>
                  {avatarUrl ? (
                    // The user's own uploaded photo (cross-origin uploads URL);
                    // plain <img> sidesteps next/image remote config.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarUrl}
                      alt={user.name}
                      className="w-9 h-9 rounded-full object-cover hairline"
                    />
                  ) : (
                    <span className="w-9 h-9 rounded-full bg-ink dark:bg-[#0b1220] text-white grid place-items-center font-bold text-[13px] tracking-tight">
                      {initials || "U"}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 px-5 sm:px-8 py-7">{children}</main>
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
      </ToastProvider>
      </AccentProvider>
    </UserContext.Provider>
  );
}

/** Injects the live tenant accent (from the Appearance card / session) onto the shell. */
function ShellAccentStyle() {
  const { accent } = useAccent();
  return <TenantTheme accent={accent} />;
}

/**
 * The sidebar brand lockup. The platform Super Admin sees VendoPOS; a Merchant
 * sees THEIR OWN store — the uploaded logo (or a monogram fallback) and the
 * store name — so the back office reads as the merchant's product, not ours.
 */
function StoreBrand({ user, brandSub }: { user: SessionUser; brandSub: string }) {
  const isPlatform = user.role === "SUPER_ADMIN" || !user.tenantName;
  if (isPlatform) {
    return (
      <>
        <BrandMark className="w-8 h-8" />
        <div className="leading-tight">
          <div className="font-extrabold text-[16px] tracking-tightest">VendoPOS</div>
          <div className="text-[11px] font-semibold text-ink-faint">{brandSub}</div>
        </div>
      </>
    );
  }

  const storeName = user.tenantName ?? "Your Store";
  const monogram = storeName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <>
      {user.tenantLogoUrl ? (
        // Tenant logo is a cross-origin uploads URL; plain <img> avoids Image config.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.tenantLogoUrl}
          alt={storeName}
          className="w-8 h-8 rounded-[8px] object-cover hairline"
        />
      ) : (
        <span className="grid place-items-center w-8 h-8 rounded-[8px] bg-brand-500 text-white font-extrabold text-[13px] tracking-tight">
          {monogram || "S"}
        </span>
      )}
      <div className="leading-tight min-w-0">
        <div className="font-extrabold text-[16px] tracking-tightest truncate">{storeName}</div>
        <div className="text-[11px] font-semibold text-ink-faint">{brandSub}</div>
      </div>
    </>
  );
}

function BrandLoader({ dark }: { dark: boolean }) {
  // Carry the stored theme so a dark-mode user doesn't get a white flash before
  // the authenticated shell mounts (bg-paper retints via the .dark token).
  //
  // Unlike the authenticated shell, this loader IS server-rendered (the session
  // guard starts unresolved on both server and client), so `dark` differs
  // between the two: the server has no localStorage and always reports light,
  // while the client reads the stored "dark". That one-token className delta on
  // this root is the intended client value — suppressHydrationWarning silences
  // the otherwise-correct mismatch. Children theme via CSS .dark variants, so
  // their markup is identical and needs no suppression.
  return (
    <div
      suppressHydrationWarning
      className={
        "theme-root grid-bg min-h-screen grid place-items-center bg-paper text-ink " +
        (dark ? "dark" : "")
      }
    >
      <div className="flex items-center gap-3 text-ink-soft">
        <BrandMark className="w-9 h-9 animate-pulse" />
        <span className="text-[14px] font-semibold">Loading your workspace…</span>
      </div>
    </div>
  );
}
