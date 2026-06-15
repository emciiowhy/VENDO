"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { buildThemeCss } from "@/lib/theme";

/**
 * Per-tenant brand theming.
 *
 * `TenantTheme` injects a `<style>` that overrides the `--color-brand-*` tokens
 * for the store's chosen accent. It's scoped to `[data-vp-theme]` — the attribute
 * every themed root (DashShell, the POS terminal, the customer display) carries —
 * so it never reaches the marketing/login surfaces, and the derived ramp wins
 * over both the global `@theme` defaults and the `.dark` retint block. A null /
 * invalid accent injects nothing, so the hand-tuned default blue stays intact.
 */
export function TenantTheme({ accent }: { accent?: string | null }) {
  const css = buildThemeCss(accent);
  if (!css) return null;
  return <style data-vp-theme-style="" dangerouslySetInnerHTML={{ __html: css }} />;
}

/**
 * Live accent for the back office. Seeded from the session's stored theme, it
 * lets the Account → Appearance card apply a saved colour to the running shell
 * immediately (no re-login/reload) by calling `setAccent`. Other surfaces (the
 * POS terminal, the customer display) read their accent straight from the
 * session / snapshot and don't need this provider.
 */
const AccentContext = createContext<{
  accent: string | null;
  setAccent: (hex: string | null) => void;
}>({ accent: null, setAccent: () => {} });

export function useAccent() {
  return useContext(AccentContext);
}

export function AccentProvider({
  initial,
  children,
}: {
  initial?: string | null;
  children: ReactNode;
}) {
  const [accent, setAccent] = useState<string | null>(initial ?? null);
  return <AccentContext.Provider value={{ accent, setAccent }}>{children}</AccentContext.Provider>;
}
