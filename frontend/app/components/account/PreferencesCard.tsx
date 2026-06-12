"use client";

import { useEffect, useState } from "react";
import { useToast } from "../Toast";
import { useTheme } from "../theme/ThemeProvider";
import { CardSkeleton, PrimaryButton, SectionCard, Toggle } from "./ui";
import { getPreferences, savePreferences, type Preferences } from "@/lib/account";

/**
 * Workspace preferences — the Light/Dark theme (persisted to the account and
 * applied live), and which alerts the workspace surfaces. Theme "system" follows
 * the device; choosing Light/Dark also syncs the live shell via the theme
 * provider so the change is visible immediately.
 */
const THEMES: { value: Preferences["theme"]; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function PreferencesCard() {
  const { push } = useToast();
  const { setTheme } = useTheme();
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getPreferences();
      if (!alive) return;
      if (res.ok) setPrefs(res.preferences);
      else setLoadError(res.error ?? "Could not load your preferences.");
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loadError) {
    return (
      <SectionCard icon="gear" title="Preferences">
        <p className="text-[13.5px] font-semibold text-rose-600">{loadError}</p>
      </SectionCard>
    );
  }
  if (!prefs) return <CardSkeleton />;

  const set = <K extends keyof Preferences>(key: K, value: Preferences[K]) =>
    setPrefs((p) => (p ? { ...p, [key]: value } : p));

  /** Reflect a theme choice in the live shell right away. */
  function applyTheme(theme: Preferences["theme"]) {
    set("theme", theme);
    if (theme === "dark" || theme === "light") {
      setTheme(theme);
    } else if (typeof window !== "undefined") {
      const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
      setTheme(prefersDark ? "dark" : "light");
    }
  }

  async function submit() {
    setBusy(true);
    const res = await savePreferences(prefs!);
    setBusy(false);
    if (res.ok) {
      setPrefs(res.preferences);
      push({ variant: "success", title: "Preferences saved" });
    } else {
      push({ variant: "danger", title: "Couldn’t save", message: res.error });
    }
  }

  return (
    <SectionCard
      icon="gear"
      title="Preferences"
      description="Appearance and which alerts you want to hear about."
    >
      <div className="space-y-6">
        <div>
          <span className="text-[12px] font-semibold text-ink-soft">Theme</span>
          <div className="mt-2 inline-flex rounded-[10px] hairline bg-paper p-1">
            {THEMES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => applyTheme(t.value)}
                className={
                  "px-4 py-1.5 rounded-[8px] text-[13px] font-semibold transition duration-150 " +
                  (prefs.theme === t.value
                    ? "bg-surface text-ink shadow-card"
                    : "text-ink-soft hover:text-ink")
                }
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="hairline-t pt-2">
          <span className="text-[12px] font-semibold text-ink-soft">Notifications</span>
          <div className="mt-1 divide-y divide-[color:var(--hairline,rgba(0,0,0,0.06))]">
            <Toggle
              label="Low-stock alerts"
              description="When a product falls to or below its threshold."
              checked={prefs.notifyLowStock}
              onChange={(v) => set("notifyLowStock", v)}
            />
            <Toggle
              label="Cash variance alerts"
              description="When a cashier's Z-Read drawer count is off."
              checked={prefs.notifyVariance}
              onChange={(v) => set("notifyVariance", v)}
            />
            <Toggle
              label="Daily sales summary"
              description="An end-of-day recap of sales and takings."
              checked={prefs.notifyDailySummary}
              onChange={(v) => set("notifyDailySummary", v)}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <PrimaryButton busy={busy} onClick={submit}>
            Save preferences
          </PrimaryButton>
        </div>
      </div>
    </SectionCard>
  );
}
