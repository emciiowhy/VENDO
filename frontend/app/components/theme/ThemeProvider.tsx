"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

/**
 * Light/Dark theme state, persisted to localStorage.
 *
 * The `dark` class is applied by the app shells (DashShell, PosTerminal) onto
 * their own root container — not <html> — so the marketing/login surfaces stay
 * light while the authenticated workspaces theme. Those shells only render
 * their themed markup after the client-side session guard resolves (post-mount),
 * so reading the stored theme in a lazy initializer never causes a hydration
 * mismatch and never needs a setState-in-effect.
 */
type Theme = "light" | "dark";
const STORAGE_KEY = "vendopos_theme";

const ThemeContext = createContext<{
  theme: Theme;
  toggle: () => void;
  setTheme: (theme: Theme) => void;
}>({
  theme: "light",
  toggle: () => {},
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function initialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    /* private mode / disabled storage */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  const persist = useCallback((next: Theme) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      persist(next);
      return next;
    });
  }, [persist]);

  /** Set a specific theme (used by Account → Preferences to apply a saved choice). */
  const setTheme = useCallback(
    (next: Theme) => {
      persist(next);
      setThemeState(next);
    },
    [persist],
  );

  return (
    <ThemeContext.Provider value={{ theme, toggle, setTheme }}>{children}</ThemeContext.Provider>
  );
}
