"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

// Always start React state on "dark" — server and first client render must agree
// to avoid hydration mismatch. The bootstrap <script> in <head> reads
// localStorage and applies the saved theme to <html> *before* React paints, so
// there is no flash. The mount effect below syncs React state with whatever
// data-theme the bootstrap script applied.
const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  toggle: () => {},
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");

  // On mount, pick up the theme that the head bootstrap script already
  // applied to <html>. If no saved value exists, the default "dark" stays.
  useEffect(() => {
    const applied = document.documentElement.dataset.theme;
    if ((applied === "light" || applied === "dark") && applied !== theme) {
      setThemeState(applied as Theme);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply to <html> so css variables cascade, and persist.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("dropify-theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const toggle = useCallback(() => {
    setThemeState((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);

  return (
    <ThemeContext.Provider value={{ theme, toggle, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}