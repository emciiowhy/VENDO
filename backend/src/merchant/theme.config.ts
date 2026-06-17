/**
 * Merchant Theme Configuration — the canonical, server-side domain model for a
 * store's storefront skin.
 *
 * A merchant re-skins their whole workspace (back office, POS terminal, and the
 * customer-facing display) by mutating these DESIGN TOKENS — never by injecting
 * raw CSS/markup. The config is stored as a single JSONB blob on the tenant row
 * and projected to the frontend on every `/auth/me`, where the client derives a
 * scoped `<style>` from it (see frontend `lib/themeConfig.ts`).
 *
 * Everything here is intentionally pure (no DB, no Express) so it can be unit
 * tested in isolation and shared by the repository, the router, and the tests.
 * `normalizeThemeConfig` is the single trusted gate: it NEVER throws — any
 * malformed field falls back to the chosen preset's value, so a corrupt or
 * partial blob can never break a store's chrome.
 */

/** The three industry "vibes". Picking one seeds a complete, coherent config. */
export type PresetVibe = "minimalist_apparel" | "espresso_lounge" | "fast_track";

/** A storefront's font register. Mapped to a concrete CSS stack on the client. */
export type FontFamily = "sans" | "mono" | "serif";

/** Product image framing — square plates/items vs. portrait apparel fits. */
export type ProductAspectRatio = "1:1" | "4:5";

export interface MerchantThemeConfig {
  presetVibe: PresetVibe;
  /** Hex code for active buttons/accents. */
  primaryColor: string;
  /** Document body background. */
  bgSurface: string;
  /** Card/container panels. */
  bgPaper: string;
  /** Main readable text body. */
  textInk: string;
  fontFamily: FontFamily;
  /** 1:1 for café plates/items, 4:5 for apparel fits. */
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

export const FONT_FAMILIES: readonly FontFamily[] = ["sans", "mono", "serif"] as const;

export const PRODUCT_ASPECT_RATIOS: readonly ProductAspectRatio[] = ["1:1", "4:5"] as const;

/** Hard caps so a hostile/oversized payload can't bloat the session blob. */
export const ANNOUNCEMENT_MAX = 160;
const HERO_URL_MAX = 2048;

/**
 * The three turnkey presets. Each is a COMPLETE config, so selecting a vibe in
 * the Theme Studio fills every token at once; the owner then tweaks individual
 * fields on top. Copy is Philippine-market flavoured to match the demo tenants.
 */
export const THEME_PRESETS: Record<PresetVibe, MerchantThemeConfig> = {
  // Streetwear / apparel — stark monochrome, mono type, portrait fits.
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
  // Café / coffee lounge — warm browns on cream, serif type, square plates.
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
  // Quick-service restaurant — appetite-red, bold sans, square items.
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

/** The vibe a fresh Theme Studio opens on when a store has never saved one. */
export const DEFAULT_PRESET_VIBE: PresetVibe = "espresso_lounge";

function isPresetVibe(v: unknown): v is PresetVibe {
  return typeof v === "string" && (PRESET_VIBES as readonly string[]).includes(v);
}
function isFontFamily(v: unknown): v is FontFamily {
  return typeof v === "string" && (FONT_FAMILIES as readonly string[]).includes(v);
}
function isAspect(v: unknown): v is ProductAspectRatio {
  return typeof v === "string" && (PRODUCT_ASPECT_RATIOS as readonly string[]).includes(v);
}

/** Validate `#rgb`/`#rrggbb` and normalise to lowercase `#rrggbb`, else null. */
export function normalizeHex(input: unknown): string | null {
  if (typeof input !== "string") return null;
  let s = input.trim().toLowerCase();
  if (!s) return null;
  if (s[0] !== "#") s = "#" + s;
  if (/^#[0-9a-f]{3}$/.test(s)) s = "#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
  return /^#[0-9a-f]{6}$/.test(s) ? s : null;
}

/**
 * Accept a hero media URL only if it's a safe, displayable reference: an
 * absolute http(s) URL, or a server-relative path (e.g. an `/uploads/...`
 * asset). Anything else — `javascript:` URIs, data blobs, garbage — becomes
 * null. Defence in depth: the value is also rendered as a plain `src`, never
 * interpolated into markup.
 */
export function normalizeHeroUrl(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim();
  if (!s || s.length > HERO_URL_MAX) return null;
  if (s.startsWith("/")) return s.startsWith("//") ? null : s;
  if (/^https?:\/\/[^\s]+$/i.test(s)) return s;
  return null;
}

/**
 * Coerce ANY untrusted value into a clean `MerchantThemeConfig`. Each field that
 * fails validation falls back to the chosen vibe's preset value, so the result
 * is always complete and renderable. Never throws.
 */
export function normalizeThemeConfig(raw: unknown): MerchantThemeConfig {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const vibe = isPresetVibe(o.presetVibe) ? o.presetVibe : DEFAULT_PRESET_VIBE;
  const base = THEME_PRESETS[vibe];

  const announcement =
    typeof o.announcementText === "string"
      ? o.announcementText.trim().slice(0, ANNOUNCEMENT_MAX)
      : base.announcementText;

  return {
    presetVibe: vibe,
    primaryColor: normalizeHex(o.primaryColor) ?? base.primaryColor,
    bgSurface: normalizeHex(o.bgSurface) ?? base.bgSurface,
    bgPaper: normalizeHex(o.bgPaper) ?? base.bgPaper,
    textInk: normalizeHex(o.textInk) ?? base.textInk,
    fontFamily: isFontFamily(o.fontFamily) ? o.fontFamily : base.fontFamily,
    productAspectRatio: isAspect(o.productAspectRatio) ? o.productAspectRatio : base.productAspectRatio,
    heroMediaUrl: normalizeHeroUrl(o.heroMediaUrl),
    showAnnouncementBar:
      typeof o.showAnnouncementBar === "boolean" ? o.showAnnouncementBar : base.showAnnouncementBar,
    announcementText: announcement,
  };
}

/**
 * Resolve a stored blob (the JSONB column) into a config, or null when the
 * store has never configured a theme — null means "use the stock VendoPOS
 * look", so the chrome stays untouched for unthemed merchants.
 */
export function resolveThemeConfig(stored: unknown): MerchantThemeConfig | null {
  if (stored === null || stored === undefined) return null;
  return normalizeThemeConfig(stored);
}
