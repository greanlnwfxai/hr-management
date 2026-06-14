'use client';

import { useState, useEffect, useCallback } from 'react';
import { makeT, type Language, type TranslationKey, LANGUAGE_STORAGE_KEY, DEFAULT_LANGUAGE } from '@/lib/i18n';

const LANG_CHANGE_EVENT = 'hr-lang-change';

export function useLanguage() {
  const [lang, setLangState] = useState<Language>(DEFAULT_LANGUAGE);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY) as Language;
      if (saved === 'en' || saved === 'th') setLangState(saved);
    } catch {}

    function onLangChange(e: Event) {
      setLangState((e as CustomEvent<{ lang: Language }>).detail.lang);
    }
    window.addEventListener(LANG_CHANGE_EVENT, onLangChange);
    return () => window.removeEventListener(LANG_CHANGE_EVENT, onLangChange);
  }, []);

  const setLang = useCallback((newLang: Language) => {
    setLangState(newLang);
    try { localStorage.setItem(LANGUAGE_STORAGE_KEY, newLang); } catch {}
    window.dispatchEvent(new CustomEvent(LANG_CHANGE_EVENT, { detail: { lang: newLang } }));
  }, []);

  const t = useCallback((key: TranslationKey): string => makeT(lang)(key), [lang]);

  return { lang, setLang, t, mounted };
}
