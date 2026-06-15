"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useToast } from "../Toast";
import { useTheme } from "../theme/ThemeProvider";
import { useAccent } from "../theme/TenantTheme";
import { Icon } from "../Icon";
import { CardSkeleton, PrimaryButton, SectionCard } from "./ui";
import { getStore, saveTheme } from "@/lib/account";
import { DEFAULT_ACCENT, THEME_PRESETS, brandVars, normalizeHex } from "@/lib/theme";

/**
 * Appearance — the store's brand accent. Owners pick a curated preset or a custom
 * hex; the choice themes the whole back office and the customer-facing display by
 * overriding the `--color-brand-*` tokens (see lib/theme + TenantTheme). The
 * preview swatch themes only its own subtree (inline CSS vars), while Save commits
 * the colour and applies it to the live shell immediately via the accent context.
 */
export function AppearanceCard() {
  const { push } = useToast();
  const { theme } = useTheme();
  const { setAccent } = useAccent();

  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // null = the default VendoPOS blue; otherwise a normalised #rrggbb.
  const [selected, setSelected] = useState<string | null>(null);
  const [customText, setCustomText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getStore();
      if (!alive) return;
      if (res.ok) {
        const hex = res.store.themeColor ? normalizeHex(res.store.themeColor) : null;
        setSelected(hex);
        setCustomText(hex ?? "");
        setLoaded(true);
      } else setLoadError(res.error ?? "Could not load your appearance settings.");
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loadError) {
    return (
      <SectionCard icon="layers" title="Appearance">
        <p className="text-[13.5px] font-semibold text-rose-600">{loadError}</p>
      </SectionCard>
    );
  }
  if (!loaded) return <CardSkeleton />;

  const effective = selected ?? DEFAULT_ACCENT;
  const previewVars = brandVars(effective, theme) as CSSProperties;
  const isDefault = selected === null;

  function choosePreset(hex: string) {
    const n = normalizeHex(hex);
    setSelected(n);
    setCustomText(n ?? "");
  }
  function chooseDefault() {
    setSelected(null);
    setCustomText("");
  }
  function onCustom(value: string) {
    setCustomText(value);
    const n = normalizeHex(value);
    if (n) setSelected(n);
  }

  async function submit() {
    setBusy(true);
    const res = await saveTheme(selected);
    setBusy(false);
    if (res.ok) {
      setAccent(selected); // paint the running shell right away
      push({ variant: "success", title: isDefault ? "Reset to default" : "Theme applied" });
    } else {
      push({ variant: "danger", title: "Couldn’t save", message: res.error });
    }
  }

  return (
    <SectionCard
      icon="layers"
      title="Appearance"
      description="Pick your store's brand colour. It themes your whole workspace and the customer-facing display. Light and Dark stay a per-person choice in Preferences."
    >
      <div className="space-y-6">
        {/* Presets */}
        <div>
          <span className="text-[12px] font-semibold text-ink-soft">Brand colour</span>
          <div className="mt-2.5 flex flex-wrap gap-2.5">
            <Swatch
              label="Default"
              hex={DEFAULT_ACCENT}
              active={isDefault}
              onClick={chooseDefault}
            />
            {THEME_PRESETS.map((p) => (
              <Swatch
                key={p.name}
                label={p.name}
                hex={p.hex}
                active={!isDefault && selected === normalizeHex(p.hex)}
                onClick={() => choosePreset(p.hex)}
              />
            ))}
          </div>
        </div>

        {/* Custom hex */}
        <div className="hairline-t pt-5">
          <span className="text-[12px] font-semibold text-ink-soft">Custom colour</span>
          <div className="mt-2 flex items-center gap-3">
            <label
              className="relative w-11 h-11 rounded-[10px] hairline overflow-hidden shrink-0 cursor-pointer"
              style={{ backgroundColor: effective }}
              title="Pick a colour"
            >
              <input
                type="color"
                value={effective}
                onChange={(e) => onCustom(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer"
                aria-label="Pick a custom brand colour"
              />
            </label>
            <input
              type="text"
              value={customText}
              onChange={(e) => onCustom(e.target.value)}
              placeholder="#2b50ea"
              spellCheck={false}
              className="field-input rounded-[10px] px-3.5 py-2.5 text-[14px] w-[160px] font-mono tracking-tight"
            />
            <span className="text-[12px] text-ink-faint">
              Any hex, e.g. <span className="font-mono">#0aa372</span>.
            </span>
          </div>
        </div>

        {/* Live preview — themed by inline vars, isolated from the surrounding shell */}
        <div className="hairline-t pt-5">
          <span className="text-[12px] font-semibold text-ink-soft">Preview</span>
          <div
            style={previewVars}
            className="mt-2.5 rounded-[12px] hairline bg-paper p-4 flex flex-wrap items-center gap-3"
          >
            <button
              type="button"
              className="rounded-[10px] bg-brand-500 hover:bg-brand-600 px-4 py-2 font-semibold text-white shadow-btn text-[13.5px] tracking-tight transition"
            >
              Primary action
            </button>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 text-brand-700 px-3 py-1.5 text-[12.5px] font-bold">
              <Icon name="bolt" className="w-3.5 h-3.5" strokeWidth={1.9} />
              Badge
            </span>
            <span className="inline-flex items-center gap-2 rounded-[9px] bg-brand-50 text-brand-700 px-3 py-1.5 text-[13px] font-semibold">
              <Icon name="grid" className="w-4 h-4" strokeWidth={1.8} />
              Active tab
            </span>
            <a className="text-brand-600 font-semibold text-[13.5px] hover:underline cursor-pointer">
              A themed link
            </a>
          </div>
        </div>

        <div className="flex items-center justify-end gap-4">
          {!isDefault && (
            <button
              type="button"
              onClick={chooseDefault}
              className="text-[13px] font-semibold text-ink-soft hover:text-ink transition"
            >
              Reset to default
            </button>
          )}
          <PrimaryButton busy={busy} onClick={submit}>
            Apply theme
          </PrimaryButton>
        </div>
      </div>
    </SectionCard>
  );
}

function Swatch({
  label,
  hex,
  active,
  onClick,
}: {
  label: string;
  hex: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-pressed={active}
      className={
        "group flex flex-col items-center gap-1.5 rounded-[11px] p-1.5 transition " +
        (active ? "bg-brand-50" : "hover:bg-paper")
      }
    >
      <span
        className={
          "relative grid place-items-center w-9 h-9 rounded-full hairline transition " +
          (active ? "ring-2 ring-offset-2 ring-offset-surface ring-brand-500" : "")
        }
        style={{ backgroundColor: hex }}
      >
        {active && <Icon name="check" className="w-4 h-4 text-white" strokeWidth={2.4} />}
      </span>
      <span
        className={
          "text-[11px] font-semibold " + (active ? "text-brand-700" : "text-ink-soft")
        }
      >
        {label}
      </span>
    </button>
  );
}
