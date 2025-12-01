"use client";

import { useCallback, useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

type ThemeMode = "light" | "dark";

type ThemeModeSliderProps = {
  positionClass?: string;
};

export default function ThemeModeSlider({ positionClass = "fixed bottom-4 right-4" }: ThemeModeSliderProps) {
  const [mode, setMode] = useState<ThemeMode>("light");
  const [mounted, setMounted] = useState(false);

  const applyTheme = useCallback((next: ThemeMode) => {
    setMode(next);
    const root = document.documentElement;
    root.classList.toggle("dark", next === "dark");
    try {
      window.localStorage.setItem("theme", next);
    } catch {}
    const maxAge = 60 * 60 * 24 * 365;
    document.cookie = `theme=${next}; Max-Age=${maxAge}; Path=/; SameSite=Lax`;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let initial: ThemeMode = document.documentElement.classList.contains("dark") ? "dark" : "light";
    try {
      const saved = window.localStorage.getItem("theme");
      if (saved === "dark" || saved === "light") {
        initial = saved;
      }
    } catch {}
    if (!initial && window.matchMedia) {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      initial = prefersDark ? "dark" : "light";
    }
    applyTheme(initial);
    setMounted(true);
  }, [applyTheme]);

  if (!mounted) {
    return null;
  }

  const handleToggle = () => {
    applyTheme(mode === "dark" ? "light" : "dark");
  };

  return (
    <div className={cn("z-50", positionClass)}>
      <button
        type="button"
        onClick={handleToggle}
        className="flex items-center gap-3 rounded-full border border-border bg-card/90 px-4 py-2 text-xs font-semibold shadow-lg backdrop-blur hover:shadow-xl transition"
        aria-label="Toggle color theme"
      >
        <span className={cn("flex items-center gap-1", mode === "light" ? "text-primary" : "text-muted-foreground")}
        >
          <Sun className="h-4 w-4" />
          Light
        </span>
        <span className="relative h-6 w-12 rounded-full bg-muted">
          <span
            className={cn(
              "absolute left-1 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-background shadow transition-transform",
              mode === "dark" ? "translate-x-5" : "translate-x-0",
            )}
          />
        </span>
        <span className={cn("flex items-center gap-1", mode === "dark" ? "text-primary" : "text-muted-foreground")}
        >
          <Moon className="h-4 w-4" />
          Dark
        </span>
      </button>
    </div>
  );
}
