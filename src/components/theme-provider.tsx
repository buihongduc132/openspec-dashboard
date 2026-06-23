"use client";
import * as React from "react";

type Theme = "light" | "dark" | "system";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const ThemeProviderContext = React.createContext<ThemeProviderState | undefined>(undefined);

export function ThemeProvider({ children, defaultTheme = "system" }: ThemeProviderProps) {
  // Initialize with defaultTheme so server-rendered and hydrated markup
  // match (avoiding a Next.js hydration mismatch when the stored theme
  // differs from defaultTheme). The stored theme is applied in an effect
  // after mount.
  const [theme, setThemeState] = React.useState<Theme>(defaultTheme);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem("openspec-theme") as Theme | null;
      if (stored) {
        setThemeState(stored);
      }
    } catch {
      /* ignore — localStorage may be unavailable (private mode, SSR) */
    }
  }, []);

  React.useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = React.useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem("openspec-theme", t);
    applyTheme(t);
  }, []);

  return (
    <ThemeProviderContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const resolved =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
}

export function useTheme() {
  const ctx = React.useContext(ThemeProviderContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
