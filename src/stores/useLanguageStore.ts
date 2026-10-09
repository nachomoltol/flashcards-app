import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import esDict from '@/locales/es.json';
import enDict from '@/locales/en.json';

export type Language = 'es' | 'en';

type TranslationDict = Record<string, unknown>;

const translations: Record<Language, TranslationDict> = {
  es: esDict as TranslationDict,
  en: enDict as TranslationDict,
};

export type TranslationParams = Record<string, string | number>;

interface LanguageState {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, paramsOrFallback?: string | TranslationParams, fallback?: string) => string;
}

interface NavigatorWithUserLanguage extends Navigator {
  userLanguage?: string;
}

const getBrowserLanguage = (): Language => {
  if (typeof window === 'undefined') return 'es';
  const nav = navigator as NavigatorWithUserLanguage;
  const navLang = nav.language || nav.userLanguage || '';
  return navLang.toLowerCase().startsWith('en') ? 'en' : 'es';
};

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set, get) => ({
      language: 'es',
      setLanguage: (lang: Language) => {
        set({ language: lang });
        if (typeof document !== 'undefined') {
          document.documentElement.lang = lang;
        }
      },
      t: (key: string, paramsOrFallback?: string | TranslationParams, fallback?: string): string => {
        const lang = get().language || 'es';
        const dict = translations[lang] || translations.es;
        const keys = key.split('.');
        let current: unknown = dict;
        for (const k of keys) {
          if (current && typeof current === 'object' && k in (current as Record<string, unknown>)) {
            current = (current as Record<string, unknown>)[k];
          } else {
            current = undefined;
            break;
          }
        }

        const defaultString =
          typeof paramsOrFallback === 'string'
            ? paramsOrFallback
            : fallback || key;
        let result = typeof current === 'string' ? current : defaultString;

        if (paramsOrFallback && typeof paramsOrFallback === 'object') {
          Object.entries(paramsOrFallback).forEach(([paramKey, paramVal]) => {
            result = result.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramVal));
          });
        }

        return result;
      },
    }),
    {
      name: 'flashcards-language-storage',
      onRehydrateStorage: () => (state) => {
        if (state) {
          if (typeof window !== 'undefined' && !localStorage.getItem('flashcards-language-storage')) {
            const detected = getBrowserLanguage();
            state.setLanguage(detected);
          } else if (typeof document !== 'undefined' && state.language) {
            document.documentElement.lang = state.language;
          }
        }
      },
    }
  )
);
