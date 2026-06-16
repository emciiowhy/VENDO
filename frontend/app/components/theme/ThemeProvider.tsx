"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/**
 * Light/Dark theme state, persisted to localStorage.
 *
 * The `dark` class is applied by the app shells (DashShell, PosTerminal) onto
 * their own root container — not <html> — so the marketing/login surfaces stay
 * light while the authenticated workspaces theme.
 *
 * The stored theme can't be known during SSR (it lives in localStorage), so we
 * deliberately render the SAME default ("light") on the server and on the first
 * client render, then reconcile to the stored/system preference in a mount
 * effect. The shells' full-screen session loader IS server-rendered (the guard
 * starts unresolved on both sides), so reading localStorage in a lazy useState
 * initializer would hydrate that loader light on the server but dark on the
 * client — a real className mismatch that no amount of suppressHydrationWarning
 * fully papers over in React 19. With the effect, server and first client render
 * agree; a dark-mode user sees at most one loader frame retint before the
 * workspace paints, and the shells need no hydration band-aids.
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
  // Deterministic on the server and the first client render (see file header);
  // the stored/system preference is applied in the mount effect below.
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    const resolved = initialTheme();
    setThemeState((prev) => (prev === resolved ? prev : resolved));
  }, []);

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
