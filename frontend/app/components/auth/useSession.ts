"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, type SessionUser } from "@/lib/auth";

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
    getSession().then((user) => {
      cachedUser = user;
      if (!active) return;
      if (!user) {
        setState({ status: "unauthed", user: null });
        router.replace("/login");
        return;
      }
      if (allow && !allow.includes(user.role)) {
        setState({ status: "unauthed", user: null });
        router.replace(homeForRole(user.role));
        return;
      }
      setState({ status: "authed", user });
    });
    return () => {
      active = false;
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
