'use client';

import { useLanguage } from '@/hooks/useLanguage';

export default function LanguageToggle() {
  const { lang, setLang, mounted } = useLanguage();

  if (!mounted) return <div className="h-7 w-16" aria-hidden />;

  return (
    <div
      data-testid="language-toggle"
      className="flex items-center rounded-md border border-zinc-200 dark:border-zinc-600 overflow-hidden"
    >
      <button
        data-testid="language-toggle-th"
        onClick={() => setLang('th')}
        aria-label="Switch to Thai"
        className={`px-2 py-1 text-xs font-medium transition-colors ${
          lang === 'th'
            ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
            : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700'
        }`}
      >
        🇹🇭 TH
      </button>
      <button
        data-testid="language-toggle-en"
        onClick={() => setLang('en')}
        aria-label="Switch to English"
        className={`px-2 py-1 text-xs font-medium transition-colors ${
          lang === 'en'
            ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
            : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700'
        }`}
      >
        🇬🇧 EN
      </button>
    </div>
  );
}
