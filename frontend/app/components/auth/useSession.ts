"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchSession, type SessionUser } from "@/lib/auth";

type State =
  | { status: "loading"; user: null }
  | { status: "authed"; user: SessionUser }
  | { status: "unauthed"; user: null };

/**
 * Resolved session shared across every DashShell/PosTerminal mount in this page
 * session. Each protected route renders its own shell, so without this a route
 * change would unmount the authed shell, drop back to `loading`, and repaint the
 * full-screen BrandLoader while /auth/me round-trips — a dark full-screen blink
 * on every click. Once the first fetch resolves we cache the user and later
 * mounts start straight in `authed`, so navigation is seamless. The effect still
 * re-validates in the background to catch an expired/changed session.
 *
 * `undefined` = never fetched yet (first paint), `null` = confirmed signed-out,
 * a user = the live session. A full-reload logout (window.location → /login)
 * re-evaluates this module, so the cache clears itself on sign-out.
 */
let cachedUser: SessionUser | null | undefined;

/**
 * How often a mounted session quietly re-checks /auth/me. This is what closes
 * the tier-propagation gap: a store downgraded from BUSINESS to STARTER in the
 * admin console reflects in the operator's live workspace within one beat —
 * premium nav nodes relock and gated panels swap to the <UpgradeCard /> — with
 * no manual refresh. A tab refocus refetches immediately (see the listeners
 * below), so the interval is only the backstop for a tab left in the foreground.
 */
const REVALIDATE_MS = 15000;

/**
 * Client-side session guard for the protected dashboards. Asks the backend
 * /auth/me (which reads the HTTP-only session cookie), and bounces to /login if
 * there's no valid session. `allow` optionally restricts a page to specific
 * roles — a role mismatch is redirected to that user's own dashboard rather
 * than shown a forbidden screen.
 *
 * This is a convenience guard, not the security boundary: real authorization is
 * enforced server-side by requireAuth + the role/tenantId baked into the JWT.
 */
export function useSession(allow?: SessionUser["role"][]): State {
  const router = useRouter();
  // Start from the cache when it's a permitted user so a navigation never flashes
  // the loader. Anything else (not-yet-fetched, signed-out, or a role this page
  // disallows) begins as `loading` and lets the effect resolve/redirect — the
  // first-load path, which hydrates identically on server and client.
  const [state, setState] = useState<State>(() =>
    cachedUser && (!allow || allow.includes(cachedUser.role))
      ? { status: "authed", user: cachedUser }
      : { status: "loading", user: null },
  );

  useEffect(() => {
    let active = true;
    // Whether we currently hold a session to fall back on. Drives error handling:
    // a transient /auth/me failure is ignored while one is established (so a
    // network blip can't log a working operator out), but on a cold load with
    // nothing cached it bounces to /login exactly as before.
    let established = !!cachedUser;
    // Serialized snapshot of the last applied user, so the heartbeat only
    // re-renders the shell when something the UI cares about (tier, name, logo,
    // avatar, accent…) actually changed — an unchanged poll is a no-op.
    let lastApplied = cachedUser ? JSON.stringify(cachedUser) : null;

    function applyUser(user: SessionUser) {
      cachedUser = user;
      established = true;
      if (!active) return;
      if (allow && !allow.includes(user.role)) {
        setState({ status: "unauthed", user: null });
        router.replace(homeForRole(user.role));
        return;
      }
      const serialized = JSON.stringify(user);
      if (serialized === lastApplied) {
        // No meaningful change; just make sure we've left the loader.
        setState((prev) => (prev.status === "authed" ? prev : { status: "authed", user }));
        return;
      }
      lastApplied = serialized;
      setState({ status: "authed", user });
    }

    function signOut() {
      cachedUser = null;
      established = false;
      if (!active) return;
      setState({ status: "unauthed", user: null });
      router.replace("/login");
    }

    async function revalidate() {
      const probe = await fetchSession();
      if (!active) return;
      if (probe.status === "authed") applyUser(probe.user);
      else if (probe.status === "unauthed") signOut();
      else if (!established) signOut(); // cold load, server unreachable, nothing to show
      // else: a blip on an established session — keep state, the next beat retries.
    }

    void revalidate();

    // Backstop heartbeat (skip while hidden — refocus handles catch-up), plus an
    // immediate recheck whenever the operator returns to or refocuses the tab.
    const interval = window.setInterval(() => {
      if (!document.hidden) void revalidate();
    }, REVALIDATE_MS);
    const onFocus = () => void revalidate();
    const onVisible = () => {
      if (document.visibilityState === "visible") void revalidate();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // allow is a stable literal from the call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  return state;
}

export function homeForRole(role: SessionUser["role"]): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "/admin";
    case "CASHIER":
      return "/pos";
    default:
      return "/dashboard";
  }
}
