'use client';

import Link from 'next/link';
import { Flame } from 'lucide-react';
import { useStreakStore, useLanguageStore } from '@/stores';

interface StreakBadgeProps {
  className?: string;
}

/** Indicador de racha para la cabecera. Navega a /stats al pulsarlo. */
export function StreakBadge({ className = '' }: StreakBadgeProps) {
  const current = useStreakStore((s) => s.current);
  const studiedToday = useStreakStore((s) => s.studiedToday);
  const { t } = useLanguageStore();

  const tooltip = studiedToday
    ? t('dashboard.streak_header_active', { days: current })
    : t('dashboard.streak_header_inactive');

  return (
    <Link
      href="/stats"
      id="header-streak-badge"
      title={tooltip}
      aria-label={tooltip}
      className={`inline-flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full border text-xs sm:text-sm font-bold transition active:scale-95 select-none shrink-0 ${
        studiedToday
          ? 'bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.35)] hover:bg-amber-500/20'
          : 'bg-zinc-100 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700/70 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800'
      } ${className}`}
    >
      <Flame
        className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${
          studiedToday
            ? 'text-amber-500 fill-amber-500 drop-shadow-[0_0_4px_rgba(245,158,11,0.8)]'
            : 'text-zinc-500'
        }`}
        aria-hidden="true"
      />
      <span className="tabular-nums leading-none">{current}</span>
    </Link>
  );
}
