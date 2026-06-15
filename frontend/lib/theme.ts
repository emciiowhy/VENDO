/**
 * Per-tenant accent theming.
 *
 * The whole workspace reads `--color-brand-*` design tokens, so a store's chosen
 * accent is applied by deriving the full brand ramp from one hex and overriding
 * those CSS variables on the themed root (see components/theme/TenantTheme).
 *
 * The ramp rides a FIXED lightness ladder — only the chosen colour's hue and
 * saturation carry between stops. That keeps the light tints reading as light
 * backgrounds and the dark-mode tints sitting on the night canvas for ANY input.
 * The button stops (500/600) are additionally capped so white label text stays
 * legible even on a bright custom hue.
 */

export interface ThemePreset {
  name: string;
  hex: string;
}

/** The default workspace accent (VendoPOS brand blue) — selected when unthemed. */
export const DEFAULT_ACCENT = "#2b50ea";

/** Curated, on-brand accents. Each base is mid-dark so white text reads on it. */
export const THEME_PRESETS: ThemePreset[] = [
  { name: "Indigo", hex: "#2b50ea" },
  { name: "Violet", hex: "#7c3aed" },
  { name: "Emerald", hex: "#0aa372" },
  { name: "Teal", hex: "#0d9488" },
  { name: "Rose", hex: "#e11d63" },
  { name: "Crimson", hex: "#dc2626" },
  { name: "Amber", hex: "#d97706" },
  { name: "Slate", hex: "#475569" },
];

/** Normalise input to lowercase `#rrggbb`, or null if it isn't a valid hex. */
export function normalizeHex(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  if (s[0] !== "#") s = "#" + s;
  if (/^#[0-9a-f]{3}$/.test(s)) s = "#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
  return /^#[0-9a-f]{6}$/.test(s) ? s : null;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}
interface Hsl {
  h: number;
  s: number;
  l: number;
}

function hexToRgb(hex: string): Rgb {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === rn) h = (((gn - bn) / d) % 6 + 6) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  s = Math.min(1, Math.max(0, s));
  l = Math.min(1, Math.max(0, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((((h % 360) + 360) % 360)) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** WCAG relative luminance of an sRGB colour (0 = black, 1 = white). */
function relLuminance({ r, g, b }: Rgb): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** A brand stop: target lightness + a multiplier applied to the base saturation. */
interface Stop {
  l: number;
  s: number;
}

// Light-mode ladder (50 → 700): lightness is fixed; saturation scales the base.
const LIGHT: Record<string, Stop> = {
  "50": { l: 0.965, s: 0.45 },
  "100": { l: 0.925, s: 0.6 },
  "200": { l: 0.855, s: 0.75 },
  "400": { l: 0.64, s: 0.95 },
  "500": { l: 0.545, s: 1.0 },
  "600": { l: 0.455, s: 1.0 },
  "700": { l: 0.37, s: 1.0 },
};
// Dark-mode overrides — only the stops globals.css retints under `.dark`.
const DARK: Record<string, Stop> = {
  "50": { l: 0.215, s: 0.55 },
  "100": { l: 0.26, s: 0.6 },
  "200": { l: 0.33, s: 0.65 },
  "700": { l: 0.79, s: 0.75 },
};

// Stops that carry white text (buttons/solid fills): cap luminance so the label
// keeps ≥ ~3.5:1 contrast on any hue. lum ≤ 0.26 → white contrast ≥ 3.4.
const WHITE_TEXT_STOPS = new Set(["500", "600"]);
const MAX_SOLID_LUMINANCE = 0.26;

function stopHex(h: number, baseS: number, stop: Stop, capForWhite: boolean): string {
  let l = stop.l;
  const s = baseS * stop.s;
  let hex = hslToHex(h, s, l);
  if (capForWhite) {
    for (let i = 0; i < 24 && relLuminance(hexToRgb(hex)) > MAX_SOLID_LUMINANCE; i++) {
      l = Math.max(0.1, l - 0.025);
      hex = hslToHex(h, s, l);
    }
  }
  return hex;
}

export interface BrandRamp {
  light: Record<string, string>;
  dark: Record<string, string>;
}

/** Derive the full brand ramp (light + dark overrides) from one accent hex. */
export function deriveBrandRamp(accentHex: string): BrandRamp {
  const { h, s } = rgbToHsl(hexToRgb(accentHex));
  // Clamp base saturation so a near-grey input still tints and a neon won't blow out.
  const baseS = Math.min(0.95, Math.max(0.32, s));
  const build = (table: Record<string, Stop>) => {
    const out: Record<string, string> = {};
    for (const [k, stop] of Object.entries(table)) {
      out[k] = stopHex(h, baseS, stop, WHITE_TEXT_STOPS.has(k));
    }
    return out;
  };
  return { light: build(LIGHT), dark: build(DARK) };
}

/** `#rrggbb` → "r, g, b" for composing rgba() strings. */
function rgbTriplet(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `${r}, ${g}, ${b}`;
}

/**
 * Inline CSS-variable style for a brand ramp — used by the live preview swatch so
 * it themes its own subtree without touching the surrounding shell. `mode` picks
 * which tints to use for the tinted stops so the preview matches the active mode.
 */
export function brandVars(accentHex: string, mode: "light" | "dark"): Record<string, string> {
  const { light, dark } = deriveBrandRamp(accentHex);
  const stops = mode === "dark" ? { ...light, ...dark } : light;
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(stops)) vars[`--color-brand-${k}`] = v;
  return vars;
}

/**
 * The CSS that retints the workspace for a given accent. Scoped to
 * `[data-vp-theme]` (the attribute each themed root carries) so it never reaches
 * the marketing/login surfaces, and `[data-vp-theme].dark` outweighs the global
 * `.dark` retint block. Returns "" for a null/invalid accent (keep the default).
 */
export function buildThemeCss(accent: string | null | undefined): string {
  if (!accent) return "";
  const hex = normalizeHex(accent);
  if (!hex) return "";
  const { light, dark } = deriveBrandRamp(hex);
  const lightVars = Object.entries(light)
    .map(([k, v]) => `--color-brand-${k}:${v};`)
    .join("");
  const darkVars = Object.entries(dark)
    .map(([k, v]) => `--color-brand-${k}:${v};`)
    .join("");
  const shadow = rgbTriplet(light["600"]);
  return (
    `[data-vp-theme]{${lightVars}` +
    `--shadow-btn:0 1px 2px rgba(${shadow},0.18),0 6px 18px rgba(${shadow},0.16);}` +
    `[data-vp-theme].dark{${darkVars}}`
  );
}
