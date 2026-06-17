/**
 * Merchant Theme Configuration — the client mirror of the backend domain model
 * (backend/src/merchant/theme.config.ts). A store re-skins every themed surface
 * (back office, POS terminal, customer display) by mutating these design tokens;
 * this module turns a config into a scoped `<style>` that overrides the CSS
 * variables the whole workspace already reads.
 *
 * The brand-ramp maths lives in `./theme` and is reused here — the config's
 * `primaryColor` drives the same `--color-brand-*` ladder as the legacy accent,
 * so buttons/badges/active tabs stay legible for any hue. On top of that, the
 * config also retints the canvas (surface/paper/ink), swaps the font register,
 * and frames product media — the structural part of "becoming another store".
 */
import { deriveBrandRamp, normalizeHex } from "./theme";

export type PresetVibe = "minimalist_apparel" | "espresso_lounge" | "fast_track";
export type FontFamily = "sans" | "mono" | "serif";
export type ProductAspectRatio = "1:1" | "4:5";

export interface MerchantThemeConfig {
  presetVibe: PresetVibe;
  primaryColor: string;
  bgSurface: string;
  bgPaper: string;
  textInk: string;
  fontFamily: FontFamily;
  productAspectRatio: ProductAspectRatio;
  heroMediaUrl: string | null;
  showAnnouncementBar: boolean;
  announcementText: string;
}

export const PRESET_VIBES: readonly PresetVibe[] = [
  "minimalist_apparel",
  "espresso_lounge",
  "fast_track",
] as const;

export const ANNOUNCEMENT_MAX = 160;

/** Display metadata for each vibe — drives the Theme Studio preset picker. */
export const VIBE_META: Record<PresetVibe, { label: string; tagline: string; icon: string }> = {
  minimalist_apparel: {
    label: "Minimalist Apparel",
    tagline: "Streetwear & fashion — stark monochrome, portrait fits.",
    icon: "tag",
  },
  espresso_lounge: {
    label: "Espresso Lounge",
    tagline: "Cafés & coffee bars — warm cream, serif, square plates.",
    icon: "store",
  },
  fast_track: {
    label: "Fast Track",
    tagline: "Quick-service restaurants — appetite-red, bold, fast.",
    icon: "bolt",
  },
};

/** The three turnkey presets — each a COMPLETE config (mirrors the backend). */
export const THEME_PRESETS: Record<PresetVibe, MerchantThemeConfig> = {
  minimalist_apparel: {
    presetVibe: "minimalist_apparel",
    primaryColor: "#111111",
    bgSurface: "#ffffff",
    bgPaper: "#f4f4f5",
    textInk: "#0a0a0a",
    fontFamily: "mono",
    productAspectRatio: "4:5",
    heroMediaUrl: null,
    showAnnouncementBar: true,
    announcementText: "FREE SHIPPING OVER ₱2,500 · NEW DROP EVERY FRIDAY 6PM",
  },
  espresso_lounge: {
    presetVibe: "espresso_lounge",
    primaryColor: "#6f4e37",
    bgSurface: "#fffdf9",
    bgPaper: "#f3ece1",
    textInk: "#2b211a",
    fontFamily: "serif",
    productAspectRatio: "1:1",
    heroMediaUrl: null,
    showAnnouncementBar: true,
    announcementText: "Now brewing single-origin Benguet beans · Open daily 7AM–10PM",
  },
  fast_track: {
    presetVibe: "fast_track",
    primaryColor: "#e23744",
    bgSurface: "#ffffff",
    bgPaper: "#fff5f3",
    textInk: "#1a1a1a",
    fontFamily: "sans",
    productAspectRatio: "1:1",
    heroMediaUrl: null,
    showAnnouncementBar: true,
    announcementText: "Combo meals from ₱99 · Ready in 5 minutes, guaranteed",
  },
};

export const DEFAULT_PRESET_VIBE: PresetVibe = "espresso_lounge";

/** The concrete CSS font stack each register maps to (no extra webfont loads). */
export const FONT_STACKS: Record<FontFamily, string> = {
  sans: "var(--font-jakarta), 'Inter', system-ui, sans-serif",
  mono: "ui-monospace, 'SF Mono', 'SFMono-Regular', 'Menlo', 'Consolas', monospace",
  serif: "Georgia, 'Iowan Old Style', 'Times New Roman', 'Times', serif",
};

/** CSS `aspect-ratio` value for a product framing token. */
export function aspectValue(ratio: ProductAspectRatio): string {
  return ratio === "4:5" ? "4 / 5" : "1 / 1";
}

function isVibe(v: unknown): v is PresetVibe {
  return typeof v === "string" && (PRESET_VIBES as readonly string[]).includes(v);
}

/**
 * Coerce an untrusted value (e.g. a `/auth/me` payload) into a complete config.
 * Mirrors the backend gate so the client is robust even if the API shape drifts:
 * invalid fields fall back to the chosen vibe's preset value. Never throws.
 */
export function normalizeThemeConfig(raw: unknown): MerchantThemeConfig {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const vibe = isVibe(o.presetVibe) ? o.presetVibe : DEFAULT_PRESET_VIBE;
  const base = THEME_PRESETS[vibe];
  const font = o.fontFamily;
  const aspect = o.productAspectRatio;
  return {
    presetVibe: vibe,
    primaryColor: normalizeHex(asString(o.primaryColor)) ?? base.primaryColor,
    bgSurface: normalizeHex(asString(o.bgSurface)) ?? base.bgSurface,
    bgPaper: normalizeHex(asString(o.bgPaper)) ?? base.bgPaper,
    textInk: normalizeHex(asString(o.textInk)) ?? base.textInk,
    fontFamily: font === "sans" || font === "mono" || font === "serif" ? font : base.fontFamily,
    productAspectRatio: aspect === "1:1" || aspect === "4:5" ? aspect : base.productAspectRatio,
    heroMediaUrl: typeof o.heroMediaUrl === "string" && o.heroMediaUrl.trim() ? o.heroMediaUrl.trim() : null,
    showAnnouncementBar:
      typeof o.showAnnouncementBar === "boolean" ? o.showAnnouncementBar : base.showAnnouncementBar,
    announcementText:
      typeof o.announcementText === "string"
        ? o.announcementText.slice(0, ANNOUNCEMENT_MAX)
        : base.announcementText,
  };
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function rgbTriplet(hex: string): string | null {
  const h = normalizeHex(hex);
  if (!h) return null;
  return `${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)}`;
}

/**
 * The CSS-variable overrides for a config. Returns a map suitable BOTH for an
 * injected `<style>` (via `buildConfigCss`) and for an inline `style` object on
 * a preview subtree (via `configVars`).
 *
 * Surface/paper/ink are LIGHT-canvas tokens, so they're applied only in light
 * mode (the caller scopes them with `:not(.dark)`); the brand ramp, font and
 * product framing apply in both modes. ink-soft/ink-faint are derived by mixing
 * the chosen ink toward the paper so muted text keeps a consistent relationship.
 */
function lightCanvasVars(config: MerchantThemeConfig): Record<string, string> {
  const ink = normalizeHex(config.textInk) ?? "#15171c";
  const paper = normalizeHex(config.bgPaper) ?? "#f6f4ee";
  const surface = normalizeHex(config.bgSurface) ?? "#ffffff";
  return {
    "--color-paper": paper,
    "--color-surface": surface,
    "--color-surface-2": surface,
    "--color-ink": ink,
    "--color-ink-soft": `color-mix(in srgb, ${ink} 64%, ${paper})`,
    "--color-ink-faint": `color-mix(in srgb, ${ink} 40%, ${paper})`,
  };
}

function brandVarsFor(config: MerchantThemeConfig, mode: "light" | "dark"): Record<string, string> {
  const { light, dark } = deriveBrandRamp(normalizeHex(config.primaryColor) ?? "#2b50ea");
  const stops = mode === "dark" ? { ...light, ...dark } : light;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(stops)) out[`--color-brand-${k}`] = v;
  return out;
}

/** Tokens that apply regardless of light/dark: font register + product framing. */
function structuralVars(config: MerchantThemeConfig): Record<string, string> {
  return {
    "--font-sans": FONT_STACKS[config.fontFamily],
    "--vp-product-aspect": aspectValue(config.productAspectRatio),
  };
}

/**
 * Inline CSS-variable style for a config — used by the Theme Studio's live
 * preview so it themes only its own subtree (no effect on the surrounding
 * shell). `mode` picks the brand tints matching the active light/dark mode.
 */
export function configVars(config: MerchantThemeConfig, mode: "light" | "dark"): Record<string, string> {
  return {
    ...brandVarsFor(config, mode),
    ...(mode === "light" ? lightCanvasVars(config) : {}),
    ...structuralVars(config),
  };
}

function declBlock(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([k, v]) => `${k}:${v};`)
    .join("");
}

/**
 * The `<style>` body that re-skins a themed shell for a config. Scoped to
 * `[data-vp-theme]` (the attribute every themed root carries) so it never
 * touches the marketing/login surfaces, and `[data-vp-theme].dark` outweighs the
 * global `.dark` retint block. Returns "" for a null config (keep the stock look).
 */
export function buildConfigCss(config: MerchantThemeConfig | null | undefined): string {
  if (!config) return "";
  const lightBrand = brandVarsFor(config, "light");
  const darkBrand = brandVarsFor(config, "dark");
  const structural = structuralVars(config);
  const canvas = lightCanvasVars(config);
  const shadowRgb = rgbTriplet(lightBrand["--color-brand-600"] ?? config.primaryColor);
  const shadow = shadowRgb
    ? `--shadow-btn:0 1px 2px rgba(${shadowRgb},0.18),0 6px 18px rgba(${shadowRgb},0.16);`
    : "";

  return (
    // Light + structural tokens (font/aspect apply in both modes).
    `[data-vp-theme]{${declBlock({ ...lightBrand, ...structural })}${shadow}}` +
    // Canvas retint only in light mode — dark keeps its tuned palette.
    `[data-vp-theme]:not(.dark){${declBlock(canvas)}}` +
    // Brand ramp dark overrides.
    `[data-vp-theme].dark{${declBlock(darkBrand)}}`
  );
}
