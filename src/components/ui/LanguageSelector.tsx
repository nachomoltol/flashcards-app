'use client';

import { useLanguageStore } from '@/stores';
import { Check } from 'lucide-react';
import { useState, useRef, useEffect, useId } from 'react';

// Bandera oficial de España en formato vectorial SVG nítido y compatible con todos los navegadores/OS
function SpainFlag({ className = 'w-4 h-3' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 60 40"
      className={`${className} rounded-[2px] shadow-xs shrink-0 inline-block overflow-hidden ring-1 ring-black/10 dark:ring-white/10`}
      aria-hidden="true"
    >
      <rect width="60" height="10" fill="#AA151B" />
      <rect y="10" width="60" height="20" fill="#F1BF00" />
      <rect y="30" width="60" height="10" fill="#AA151B" />
      {/* Escudo simplificado elegante y nítido */}
      <g transform="translate(18, 20) scale(0.65)">
        {/* Corona */}
        <path d="M-8 -11 L-10 -7 L-5 -8 L0 -12 L5 -8 L10 -7 L8 -11 Z" fill="#AA151B" stroke="#F1BF00" strokeWidth="0.8" />
        <circle cx="0" cy="-13" r="1.2" fill="#F1BF00" />
        {/* Columnas de Hércules */}
        <rect x="-14" y="-8" width="2" height="18" rx="0.5" fill="#E2E8F0" />
        <rect x="12" y="-8" width="2" height="18" rx="0.5" fill="#E2E8F0" />
        {/* Cuerpo del escudo */}
        <path d="M-7 -6 H7 V6 C7 11 0 14 0 14 C0 14 -7 11 -7 6 Z" fill="#AA151B" stroke="#F1BF00" strokeWidth="1" />
        <path d="M-5 -4 H5 V5 C5 9 0 12 0 12 C0 12 -5 9 -5 5 Z" fill="#F1BF00" />
        <line x1="0" y1="-4" x2="0" y2="11" stroke="#AA151B" strokeWidth="0.8" />
        <line x1="-5" y1="2" x2="5" y2="2" stroke="#AA151B" strokeWidth="0.8" />
        <circle cx="0" cy="2" r="1.5" fill="#1D4ED8" stroke="#F1BF00" strokeWidth="0.6" />
      </g>
    </svg>
  );
}

// Bandera oficial de Reino Unido (Union Jack) en formato vectorial SVG
function UKFlag({ className = 'w-4 h-3' }: { className?: string }) {
  const id = useId();
  const safeId = id.replace(/[^a-zA-Z0-9]/g, '');
  return (
    <svg
      viewBox="0 0 60 36"
      className={`${className} rounded-[2px] shadow-xs shrink-0 inline-block overflow-hidden ring-1 ring-black/10 dark:ring-white/10`}
      aria-hidden="true"
    >
      <clipPath id={`uk-diag-${safeId}`}>
        <path d="M0,0 L30,18 H0 Z M60,0 V18 L30,18 Z M60,36 L30,18 H60 Z M0,36 V18 L30,18 Z" />
      </clipPath>
      {/* Fondo azul */}
      <rect width="60" height="36" fill="#012169" />
      {/* Aspas blancas (San Andrés) */}
      <path d="M0 0 L60 36 M60 0 L0 36" stroke="#FFFFFF" strokeWidth="6" />
      {/* Aspas rojas contracambiadas (San Patricio) */}
      <path
        d="M0 0 L60 36 M60 0 L0 36"
        clipPath={`url(#uk-diag-${safeId})`}
        stroke="#C8102E"
        strokeWidth="4"
      />
      {/* Cruz blanca (San Jorge fondo) */}
      <path d="M30 0 V36 M0 18 H60" stroke="#FFFFFF" strokeWidth="10" />
      {/* Cruz roja (San Jorge) */}
      <path d="M30 0 V36 M0 18 H60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  );
}

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
    {
      code: 'es' as const,
      label: 'Español',
      flag: <SpainFlag className="w-4 h-3" />,
      dropdownFlag: <SpainFlag className="w-4.5 h-3.5" />,
      short: 'ES',
    },
    {
      code: 'en' as const,
      label: 'English',
      flag: <UKFlag className="w-4 h-3" />,
      dropdownFlag: <UKFlag className="w-4.5 h-3.5" />,
      short: 'EN',
    },
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
        <span className="flex items-center justify-center shrink-0">{current.flag}</span>
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
                <span className="flex items-center justify-center shrink-0">{item.dropdownFlag}</span>
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
