"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import en from "../locales/en.json";
import es from "../locales/es.json";

type Messages = Record<string, string>;
type TranslationVars = Record<string, string | number>;

const DEFAULT_LOCALE = "en";
const SUPPORTED_LOCALES = new Set(["en", "es"]);

const MESSAGES: Record<string, Messages> = {
  en,
  es,
};

function formatMessage(template: string, vars?: TranslationVars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, token: string) => {
    const value = vars[token];
    if (value === undefined || value === null) return `{${token}}`;
    return String(value);
  });
}

type I18nContextValue = {
  locale: string;
  setLocale: (next: string) => void;
  t: (key: string, vars?: TranslationVars) => string;
};

const FALLBACK_TRANSLATOR = (key: string, vars?: TranslationVars) =>
  formatMessage(MESSAGES[DEFAULT_LOCALE]?.[key] ?? key, vars);

const I18nContext = createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: FALLBACK_TRANSLATOR,
});

const resolveLocale = (candidate?: string | null) =>
  candidate && SUPPORTED_LOCALES.has(candidate) ? candidate : DEFAULT_LOCALE;

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<string>(() => {
    if (typeof window === "undefined") return DEFAULT_LOCALE;
    try {
      return resolveLocale(localStorage.getItem("locale"));
    } catch {
      return DEFAULT_LOCALE;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("locale", locale);
    } catch {}
  }, [locale]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const setLocale = (next: string) => setLocaleState(resolveLocale(next));

  const value = useMemo<I18nContextValue>(() => {
    const activeMessages = MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE];
    const fallbackMessages = MESSAGES[DEFAULT_LOCALE];
    const translate = (key: string, vars?: TranslationVars) => {
      const template = activeMessages[key] ?? fallbackMessages[key] ?? key;
      return formatMessage(template, vars);
    };
    return { locale, setLocale, t: translate };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
