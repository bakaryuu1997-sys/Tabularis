import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import ja from './locales/ja.json';
import vi from './locales/vi.json';

/**
 * Single source of truth for supported languages.
 * This personal fork ships only English, Japanese and Vietnamese.
 * To add a new language: drop a locale JSON in ./locales, import it above,
 * then add an entry here.
 */
export const SUPPORTED_LANGUAGES = [
  { id: "en", label: "English", translation: en },
  { id: "ja", label: "日本語", translation: ja },
  { id: "vi", label: "Tiếng Việt", translation: vi },
] as const;

export type AppLanguage = "auto" | (typeof SUPPORTED_LANGUAGES)[number]["id"];

const resources = Object.fromEntries(
  SUPPORTED_LANGUAGES.map(({ id, translation }) => [id, { translation }]),
);

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['querystring', 'cookie', 'localStorage', 'navigator', 'htmlTag', 'path', 'subdomain'],
      caches: ['localStorage', 'cookie'],
    },
  });

/**
 * Keep <html lang> in step with the UI language. Browsers use it to pick fallback fonts, so Vietnamese or
 * Japanese text is drawn with a font suited to that language instead of the system's default one.
 */
function syncHtmlLang(language: string | undefined) {
  if (typeof document !== "undefined" && language) document.documentElement.lang = language;
}

i18n.on("initialized", () => syncHtmlLang(i18n.language));
i18n.on("languageChanged", syncHtmlLang);
syncHtmlLang(i18n.language);
