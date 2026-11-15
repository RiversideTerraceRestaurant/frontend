import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type Language = "en" | "ko" | "ja" | "cn" | "vi" | "ru" | "kz" | "es" | "fr" | "it";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  languageLabels: Record<Language, string>;
}

const languageLabels: Record<Language, string> = {
  en: "English",
  ko: "한국어",
  ja: "日本語",
  cn: "中文",
  vi: "Tiếng Việt",
  ru: "Русский",
  kz: "Қазақша",
  es: "Español",
  fr: "Français",
  it: "Italiano",
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = "rtr_language";
const SUPPORTED: Language[] = ["en", "ko", "ja", "cn", "vi", "ru", "kz", "es", "fr", "it"];
// Browser language codes that differ from ours.
const ALIASES: Record<string, Language> = { zh: "cn", kk: "kz" };

/** First supported language from the visitor's device settings, else English. */
export function detectDeviceLanguage(preferred: readonly string[] = typeof navigator === "undefined" ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]): Language {
  for (const tag of preferred) {
    const base = tag?.toLowerCase().split("-")[0];
    const language = ALIASES[base] ?? base;
    if (SUPPORTED.includes(language as Language)) return language as Language;
  }
  return "en";
}

function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED.includes(saved as Language)) return saved as Language;
  } catch { /* storage may be unavailable */ }
  return detectDeviceLanguage();
}

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguageState] = useState<Language>(initialLanguage);
  // A choice made on the site (selector or chat) wins over the device language next time.
  const setLanguage = (next: Language) => {
    setLanguageState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* storage may be unavailable */ }
  };
  useEffect(() => {
    document.documentElement.lang = language === "cn" ? "zh" : language === "kz" ? "kk" : language;
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, languageLabels }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};
