"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, IconSprite, type IconName } from "../Icon";
import { useSession } from "../auth/useSession";
import { useTheme } from "../theme/ThemeProvider";
import { ThemeToggle } from "../theme/ThemeToggle";
import { AccentProvider, TenantTheme, useAccent } from "../theme/TenantTheme";
import {
  AnnouncementBar,
  ConfigStyle,
  ThemeConfigProvider,
  useThemeConfig,
} from "../theme/TenantThemeConfig";
import { ToastProvider } from "../Toast";
import { ConfirmDialog } from "../ConfirmDialog";
import { NotificationBell } from "./NotificationBell";
import { TrialRecovery } from "./TrialRecovery";
import { BrandMark } from "../BrandMark";
import { TierCaption } from "./TierBadge";
import { logout, type SessionUser } from "@/lib/auth";
import { ImpersonationBanner } from "./ImpersonationBanner";
import { resolveAssetUrl } from "@/lib/images";
import { asTier, featureAllowed, type Feature } from "@/lib/tiers";

export interface NavItem {
  label: string;
  icon: IconName;
  href: string;
  /** Visual-only tiles for modules not yet built — shown muted, not linked. */
  soon?: boolean;
  /**
   * Tier-gated module: when the signed-in store's tier doesn't unlock this
   * feature, the link renders muted with a lock badge. It still navigates — the
   * destination page shows the <UpgradeCard /> — so the gate is discoverable.
   */
  feature?: Feature;
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

  // Trial lapsed: the workspace is fenced (the module APIs 402), so swap the
  // whole dashboard for the graceful billing/recovery view. SUPER_ADMIN has no
  // tenant status, so the platform console is never affected.
  if (user.status === "trial_expired") {
    return <TrialRecovery user={user} dark={theme === "dark"} />;
  }
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  const avatarUrl = resolveAssetUrl(user.avatarUrl);

  return (
    <UserContext.Provider value={user}>
      <AccentProvider initial={user.themeColor}>
      <ThemeConfigProvider initial={user.themeConfig}>
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
        <ShellConfigStyle />
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
                    // Premium module the current tier can't reach: render muted with
                    // a lock badge. Still a link — the page shows the upgrade card.
                    if (item.feature && !featureAllowed(asTier(user.tier), item.feature)) {
                      return (
                        <Link
                          key={item.label}
                          href={item.href}
                          onClick={() => setMobileOpen(false)}
                          title="Upgrade to unlock"
                          className={base + " text-ink-faint hover:text-ink hover:bg-paper"}
                        >
                          <Icon name={item.icon} className="w-[18px] h-[18px]" strokeWidth={1.6} />
                          {item.label}
                          <Icon name="lock" className="ml-auto w-[14px] h-[14px]" strokeWidth={1.9} />
                        </Link>
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
          <ShellAnnouncementBar />
          {/* Impersonation escape hatch — only ever present on a SUPER_ADMIN's
              impersonated tenant view (never a real merchant login). */}
          {user.isImpersonating && (
            <ImpersonationBanner tenantName={user.tenantName ?? null} />
          )}
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
      </ThemeConfigProvider>
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
 * Injects the live storefront theme config (from the Theme Studio / session)
 * onto the shell. Rendered after ShellAccentStyle so a saved config — which also
 * derives the brand ramp — wins over the legacy accent style at equal scope.
 */
function ShellConfigStyle() {
  const { config } = useThemeConfig();
  return <ConfigStyle config={config} />;
}

/** The live announcement strip at the top of the workspace. */
function ShellAnnouncementBar() {
  const { config } = useThemeConfig();
  return <AnnouncementBar config={config} />;
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
        {/* Live store tier, read straight from the session (no extra fetch). */}
        <TierCaption tier={asTier(user.tier)} className="mt-1" />
      </div>
    </>
  );
}

function BrandLoader({ dark }: { dark: boolean }) {
  // Carry the stored theme so a dark-mode user doesn't get a white flash before
  // the authenticated shell mounts (bg-paper retints via the .dark token). This
  // loader IS server-rendered, but `dark` is now deterministic on the server and
  // first client render (ThemeProvider seeds "light" and reconciles post-mount),
  // so the two agree and no suppressHydrationWarning is needed.
  return (
    <div
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
