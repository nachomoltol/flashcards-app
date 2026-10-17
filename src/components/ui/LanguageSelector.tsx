'use client';

import { useLanguageStore } from '@/stores';
import { Check } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

export function LanguageSelector({ className = '' }: { className?: string }) {
  const { language, setLanguage } = useLanguageStore();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const languages = [
    { code: 'es' as const, label: 'Español', flag: '🇪🇸', short: 'ES' },
    { code: 'en' as const, label: 'English', flag: '🇬🇧', short: 'EN' },
  ];

  const current = languages.find((l) => l.code === language) || languages[0];

  return (
    <div className={`relative inline-block ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Cambiar idioma / Change language"
        aria-expanded={isOpen}
        aria-haspopup="true"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-900/80 dark:hover:bg-neutral-800/90 border border-neutral-300/80 dark:border-neutral-700/60 text-neutral-800 dark:text-neutral-200 hover:text-neutral-950 dark:hover:text-white transition-all shadow-sm text-xs font-semibold cursor-pointer active:scale-95"
      >
        <span className="text-sm leading-none">{current.flag}</span>
        <span className="text-[11px] font-bold tracking-wider">{current.short}</span>
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-36 rounded-2xl bg-white/95 dark:bg-neutral-900/95 backdrop-blur-xl border border-neutral-200 dark:border-neutral-800 shadow-2xl p-1 z-[70] animate-in fade-in zoom-in-95 duration-100"
        >
          {languages.map((item) => (
            <button
              key={item.code}
              type="button"
              onClick={() => {
                setLanguage(item.code);
                setIsOpen(false);
              }}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium transition cursor-pointer ${
                language === item.code
                  ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400 font-semibold'
                  : 'text-neutral-700 hover:text-neutral-950 dark:text-neutral-300 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800/70'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="text-base">{item.flag}</span>
                <span>{item.label}</span>
              </span>
              {language === item.code && <Check className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
