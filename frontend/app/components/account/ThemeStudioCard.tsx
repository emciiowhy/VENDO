"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useToast } from "../Toast";
import { useTheme } from "../theme/ThemeProvider";
import { useThemeConfig } from "../theme/TenantThemeConfig";
import { Icon, type IconName } from "../Icon";
import { CardSkeleton, PrimaryButton, SectionCard, Toggle } from "./ui";
import { getThemeConfig, saveThemeConfig } from "@/lib/account";
import { resolveAssetUrl } from "@/lib/images";
import {
  ANNOUNCEMENT_MAX,
  DEFAULT_PRESET_VIBE,
  PRESET_VIBES,
  THEME_PRESETS,
  VIBE_META,
  aspectValue,
  configVars,
  normalizeThemeConfig,
  type FontFamily,
  type MerchantThemeConfig,
  type PresetVibe,
  type ProductAspectRatio,
} from "@/lib/themeConfig";
import { normalizeHex } from "@/lib/theme";

/**
 * Theme Studio — the merchant-facing storefront configurator.
 *
 * The owner picks an industry "vibe" (which seeds every token at once), then
 * fine-tunes colours, type, product framing and the announcement bar. A live
 * preview themes ONLY its own subtree (inline CSS vars) so it shows the result
 * without disturbing the surrounding console; Apply commits the config and
 * re-skins the running shell instantly via the theme-config context.
 *
 * Gated to BUSINESS tier (`custom_branding`) at the API and by the FeatureGate
 * around it in AccountConsole — a Starter store never reaches this editor.
 */
export function ThemeStudioCard() {
  const { push } = useToast();
  const { theme } = useTheme();
  const { setConfig: applyLive } = useThemeConfig();

  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [config, setConfig] = useState<MerchantThemeConfig>(THEME_PRESETS[DEFAULT_PRESET_VIBE]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getThemeConfig();
      if (!alive) return;
      if (res.ok) {
        setConfig(res.config ? normalizeThemeConfig(res.config) : THEME_PRESETS[DEFAULT_PRESET_VIBE]);
        setLoaded(true);
      } else setLoadError(res.error ?? "Could not load your theme.");
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loadError) {
    return (
      <SectionCard icon="layers" title="Theme Studio">
        <p className="text-[13.5px] font-semibold text-rose-600">{loadError}</p>
      </SectionCard>
    );
  }
  if (!loaded) return <CardSkeleton />;

  function patch(p: Partial<MerchantThemeConfig>) {
    setConfig((c) => ({ ...c, ...p }));
  }
  function applyPreset(vibe: PresetVibe) {
    setConfig(THEME_PRESETS[vibe]);
  }

  async function submit() {
    setBusy(true);
    const res = await saveThemeConfig(config);
    setBusy(false);
    if (res.ok) {
      const saved = normalizeThemeConfig(res.config);
      setConfig(saved);
      applyLive(saved); // re-skin the running workspace immediately
      push({ variant: "success", title: "Storefront theme applied" });
    } else {
      push({ variant: "danger", title: "Couldn’t save", message: res.error });
    }
  }

  const announceLeft = ANNOUNCEMENT_MAX - config.announcementText.length;

  return (
    <SectionCard
      icon="layers"
      title="Theme Studio"
      description="Re-skin your storefront for your industry. Pick a vibe to set everything at once, then fine-tune the colours, type and product framing. It themes your whole workspace, the POS terminal and the customer display."
    >
      <div className="space-y-7">
        {/* Vibe presets */}
        <Field label="Industry vibe">
          <div className="grid gap-2.5 sm:grid-cols-3">
            {PRESET_VIBES.map((vibe) => (
              <VibeCard
                key={vibe}
                vibe={vibe}
                active={config.presetVibe === vibe}
                onClick={() => applyPreset(vibe)}
              />
            ))}
          </div>
        </Field>

        {/* Colours */}
        <Field label="Colours" className="hairline-t pt-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <ColorInput
              label="Primary / accent"
              value={config.primaryColor}
              onChange={(v) => patch({ primaryColor: v })}
            />
            <ColorInput
              label="Text (ink)"
              value={config.textInk}
              onChange={(v) => patch({ textInk: v })}
            />
            <ColorInput
              label="Surface (cards)"
              value={config.bgSurface}
              onChange={(v) => patch({ bgSurface: v })}
            />
            <ColorInput
              label="Canvas (page)"
              value={config.bgPaper}
              onChange={(v) => patch({ bgPaper: v })}
            />
          </div>
          <p className="mt-2.5 text-[12px] text-ink-faint">
            Surface &amp; canvas apply in light mode; Dark mode keeps its tuned palette. The accent
            themes buttons, badges and active tabs in both.
          </p>
        </Field>

        {/* Typography + framing */}
        <div className="grid gap-6 sm:grid-cols-2 hairline-t pt-6">
          <Field label="Font">
            <Segmented<FontFamily>
              value={config.fontFamily}
              onChange={(v) => patch({ fontFamily: v })}
              options={[
                { value: "sans", label: "Sans" },
                { value: "mono", label: "Mono" },
                { value: "serif", label: "Serif" },
              ]}
            />
          </Field>
          <Field label="Product framing">
            <Segmented<ProductAspectRatio>
              value={config.productAspectRatio}
              onChange={(v) => patch({ productAspectRatio: v })}
              options={[
                { value: "1:1", label: "Square 1:1" },
                { value: "4:5", label: "Portrait 4:5" },
              ]}
            />
          </Field>
        </div>

        {/* Announcement bar */}
        <Field label="Announcement bar" className="hairline-t pt-6">
          <Toggle
            label="Show announcement bar"
            description="A slim brand-coloured strip at the top of every screen."
            checked={config.showAnnouncementBar}
            onChange={(v) => patch({ showAnnouncementBar: v })}
          />
          {config.showAnnouncementBar && (
            <div className="mt-2">
              <input
                type="text"
                value={config.announcementText}
                maxLength={ANNOUNCEMENT_MAX}
                onChange={(e) => patch({ announcementText: e.target.value })}
                placeholder="e.g. Free delivery within Metro Manila today only"
                className="field-input rounded-[10px] px-3.5 py-2.5 text-[14px] w-full"
              />
              <div className="mt-1 text-right text-[11.5px] font-semibold text-ink-faint tabular-nums">
                {announceLeft} left
              </div>
            </div>
          )}
        </Field>

        {/* Hero media */}
        <Field label="Hero image URL" className="hairline-t pt-6">
          <input
            type="url"
            value={config.heroMediaUrl ?? ""}
            onChange={(e) => patch({ heroMediaUrl: e.target.value.trim() ? e.target.value : null })}
            placeholder="https://… or /uploads/…"
            spellCheck={false}
            className="field-input rounded-[10px] px-3.5 py-2.5 text-[14px] w-full font-mono tracking-tight"
          />
          <p className="mt-1 text-[12px] text-ink-faint">
            Optional. Shown on the storefront hero. Must be an https or uploaded image URL.
          </p>
        </Field>

        {/* Live preview */}
        <Field label="Live preview" className="hairline-t pt-6">
          <StorefrontPreview config={config} mode={theme} />
        </Field>

        <div className="flex items-center justify-end gap-4">
          <PrimaryButton busy={busy} onClick={submit}>
            Apply theme
          </PrimaryButton>
        </div>
      </div>
    </SectionCard>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <span className="text-[12px] font-semibold text-ink-soft">{label}</span>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

function VibeCard({
  vibe,
  active,
  onClick,
}: {
  vibe: PresetVibe;
  active: boolean;
  onClick: () => void;
}) {
  const meta = VIBE_META[vibe];
  const preset = THEME_PRESETS[vibe];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "group flex flex-col gap-2.5 rounded-[12px] p-3 text-left transition duration-150 hairline " +
        (active ? "ring-2 ring-brand-500 bg-brand-50" : "bg-surface hover:border-brand-200")
      }
    >
      <div className="flex items-center gap-2">
        <span
          className="grid place-items-center w-8 h-8 rounded-[9px] text-white shrink-0"
          style={{ backgroundColor: preset.primaryColor }}
        >
          <Icon name={meta.icon as IconName} className="w-4 h-4" strokeWidth={1.8} />
        </span>
        <span className="text-[13.5px] font-bold tracking-tight">{meta.label}</span>
      </div>
      <span className="text-[12px] text-ink-soft leading-snug">{meta.tagline}</span>
      {/* Token chips */}
      <span className="mt-0.5 flex gap-1.5">
        {[preset.primaryColor, preset.bgSurface, preset.bgPaper, preset.textInk].map((hex, i) => (
          <span
            key={i}
            className="w-4 h-4 rounded-full hairline"
            style={{ backgroundColor: hex }}
          />
        ))}
      </span>
    </button>
  );
}

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const safe = normalizeHex(value) ?? "#000000";
  return (
    <div>
      <span className="text-[12px] font-semibold text-ink-soft">{label}</span>
      <div className="mt-1.5 flex items-center gap-2.5">
        <label
          className="relative w-10 h-10 rounded-[10px] hairline overflow-hidden shrink-0 cursor-pointer"
          style={{ backgroundColor: safe }}
          title={`Pick ${label.toLowerCase()}`}
        >
          <input
            type="color"
            value={safe}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer"
            aria-label={label}
          />
        </label>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className="field-input rounded-[10px] px-3 py-2.5 text-[13.5px] w-full font-mono tracking-tight"
        />
      </div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-[10px] hairline bg-paper p-1 w-full">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={
              "flex-1 rounded-[8px] px-3 py-2 text-[13px] font-semibold tracking-tight transition duration-150 " +
              (active ? "bg-surface text-ink shadow-btn" : "text-ink-soft hover:text-ink")
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A miniature storefront that themes its OWN subtree via inline CSS vars (the
 * same builder the live shell uses), so the owner sees the full result — canvas,
 * surface cards, accent, font and product framing — without touching the
 * surrounding console.
 */
function StorefrontPreview({
  config,
  mode,
}: {
  config: MerchantThemeConfig;
  mode: "light" | "dark";
}) {
  const vars = configVars(config, mode) as CSSProperties;
  const hero = resolveAssetUrl(config.heroMediaUrl);
  const tiles = [
    { name: "House Blend", price: "₱120" },
    { name: "Signature Item", price: "₱185" },
    { name: "Daily Special", price: "₱99" },
  ];
  return (
    <div
      data-vp-theme=""
      style={vars}
      className={
        "rounded-[14px] hairline overflow-hidden bg-paper text-ink " + (mode === "dark" ? "dark" : "")
      }
    >
      {/* Announcement */}
      {config.showAnnouncementBar && config.announcementText.trim() && (
        <div className="flex items-center justify-center gap-2 bg-brand-600 px-3 py-1.5 text-white">
          <Icon name="bell" className="w-3 h-3 opacity-90" strokeWidth={1.9} />
          <span className="truncate text-[11.5px] font-semibold tracking-tight">
            {config.announcementText.trim()}
          </span>
        </div>
      )}
      {/* Hero / header */}
      <div className="flex items-center justify-between gap-3 bg-surface px-4 py-3 hairline-b">
        <div className="leading-tight">
          <div className="text-[14px] font-extrabold tracking-tight">Your Store</div>
          <div className="text-[11px] text-ink-soft">{VIBE_META[config.presetVibe].label}</div>
        </div>
        <button
          type="button"
          className="rounded-[9px] bg-brand-500 px-3.5 py-1.5 text-[12px] font-bold text-white shadow-btn"
        >
          Checkout
        </button>
      </div>
      {hero && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={hero} alt="" className="h-20 w-full object-cover" />
      )}
      {/* Product grid */}
      <div className="grid grid-cols-3 gap-2.5 bg-paper p-3.5">
        {tiles.map((t) => (
          <div key={t.name} className="rounded-[10px] bg-surface hairline p-2">
            <div
              style={{ aspectRatio: aspectValue(config.productAspectRatio) }}
              className="mb-1.5 grid place-items-center rounded-[7px] bg-paper hairline overflow-hidden"
            >
              <Icon name="image" className="w-5 h-5 text-ink-faint" strokeWidth={1.5} />
            </div>
            <div className="truncate text-[11.5px] font-bold tracking-tight">{t.name}</div>
            <div className="text-[11px] font-semibold text-brand-600">{t.price}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
