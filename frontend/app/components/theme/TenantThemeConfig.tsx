"use client";

import {
  createContext,
  useContext,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Icon } from "../Icon";
import { buildConfigCss, type MerchantThemeConfig } from "@/lib/themeConfig";

/**
 * Storefront theme configuration — the structural sibling of TenantTheme.
 *
 * Where TenantTheme paints just the brand accent, the theme CONFIG re-skins the
 * whole surface: canvas (surface/paper/ink), font register, product framing, and
 * the announcement bar. `ConfigStyle` injects a `<style>` (scoped to
 * `[data-vp-theme]`) derived from the config; a null config injects nothing, so
 * an unthemed store keeps the stock VendoPOS look.
 *
 * `ThemeConfigProvider` mirrors AccentProvider: it seeds from the session's
 * stored config and lets the Theme Studio apply edits to the running shell
 * instantly (no reload) via `setConfig`.
 */

const ThemeConfigContext = createContext<{
  config: MerchantThemeConfig | null;
  setConfig: (config: MerchantThemeConfig | null) => void;
}>({ config: null, setConfig: () => {} });

export function useThemeConfig() {
  return useContext(ThemeConfigContext);
}

export function ThemeConfigProvider({
  initial,
  children,
}: {
  initial?: MerchantThemeConfig | null;
  children: ReactNode;
}) {
  const [config, setConfig] = useState<MerchantThemeConfig | null>(initial ?? null);
  return (
    <ThemeConfigContext.Provider value={{ config, setConfig }}>
      {children}
    </ThemeConfigContext.Provider>
  );
}

/** Injects the `<style>` that retints a themed shell for the given config. */
export function ConfigStyle({ config }: { config: MerchantThemeConfig | null }) {
  const css = buildConfigCss(config);
  if (!css) return null;
  return <style data-vp-config-style="" dangerouslySetInnerHTML={{ __html: css }} />;
}

/**
 * The customer-facing announcement strip. Rendered at the very top of a themed
 * shell when the store has enabled it and written copy. Brand-coloured, single
 * line, and never pushes the layout when empty/disabled (returns null).
 */
export function AnnouncementBar({
  config,
  style,
}: {
  config: MerchantThemeConfig | null;
  style?: CSSProperties;
}) {
  if (!config || !config.showAnnouncementBar) return null;
  const text = config.announcementText.trim();
  if (!text) return null;
  return (
    <div
      role="status"
      style={style}
      className="relative z-10 flex items-center justify-center gap-2 bg-brand-600 px-4 py-1.5 text-center text-white"
    >
      <Icon name="bell" className="h-3.5 w-3.5 shrink-0 opacity-90" strokeWidth={1.9} />
      <span className="truncate text-[12.5px] font-semibold tracking-tight">{text}</span>
    </div>
  );
}
