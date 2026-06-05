import { useState, useEffect } from "react";
import { translations, Language, TranslationKey } from "./translations";

const STORAGE_KEY = "flour_mgmt_language";

export function useLanguage() {
  const [language, setLanguage] = useState<Language>(() => {
    return (localStorage.getItem(STORAGE_KEY) as Language) || "en";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  function t(key: TranslationKey): string {
    return translations[language][key] || translations.en[key] || key;
  }

  function toggleLanguage() {
    setLanguage(prev => prev === "en" ? "si" : "en");
  }

  return { language, setLanguage, toggleLanguage, t };
}