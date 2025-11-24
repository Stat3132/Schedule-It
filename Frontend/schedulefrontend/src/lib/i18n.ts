import { useEffect, useState } from "react";
import en from "../locales/en.json";
import es from "../locales/es.json";

type Messages = Record<string, string>;

const MESSAGES: Record<string, Messages> = {
  en,
  es,
};

export function useI18n(defaultLocale = "en") {
  const [locale, setLocale] = useState<string>(() => {
    if (typeof window === "undefined") return defaultLocale;
    try {
      return localStorage.getItem("locale") ?? defaultLocale;
    } catch {
      return defaultLocale;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("locale", locale);
    } catch {}
  }, [locale]);

  function t(key: string) {
    const msgs = MESSAGES[locale] ?? MESSAGES[defaultLocale];
    return (msgs && msgs[key]) || (MESSAGES[defaultLocale] && MESSAGES[defaultLocale][key]) || key;
  }

  return { locale, setLocale, t } as const;
}
