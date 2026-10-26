'use client';

import React, { useEffect } from 'react';
import { HelpCircle, X, Sparkles, CheckCircle2, AlertCircle, Clock, Zap } from 'lucide-react';
import { useLanguageStore } from '@/stores';

interface StudyRatingHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function StudyRatingHelpModal({ isOpen, onClose }: StudyRatingHelpModalProps) {
  const { t } = useLanguageStore();

  // Cerrar con la tecla Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/70 dark:bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rating-help-title"
    >
      <div
        className="w-full max-w-lg rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5 sm:p-6 space-y-4 sm:space-y-5 shadow-2xl text-left animate-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header con icono y botón cerrar */}
        <div className="flex items-start justify-between gap-3 border-b border-neutral-200 dark:border-neutral-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-500/30 shrink-0">
              <HelpCircle className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h2 id="rating-help-title" className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white leading-tight">
                {t('study_help.modal_title', 'Regla de Oro de Calificación FSRS')}
              </h2>
              <p className="text-[11px] sm:text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                {t('study_help.modal_subtitle', 'Cómo calificar tus respuestas para optimizar el espaciado')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close', 'Cerrar')}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Banner de la Regla de Oro */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 border border-amber-500/30 text-xs sm:text-sm text-neutral-700 dark:text-neutral-200 flex items-start gap-3">
          <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="leading-snug">
            {t(
              'study_help.golden_rule_tip',
              '💡 Regla de Oro: Sé honesto con tus respuestas. FSRS aprende de tus fallos y éxitos reales para adaptar el espaciado óptimo.'
            )}
          </p>
        </div>

        {/* Las 4 calificaciones explicadas */}
        <div className="space-y-2.5">
          {/* 1. De nuevo / Again (Rojo) */}
          <div className="p-3 sm:p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 dark:bg-rose-950/20 space-y-1 transition hover:border-rose-500/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                <span className="font-bold text-xs sm:text-sm text-rose-700 dark:text-rose-300">
                  {t('study_help.again_title', '1. De nuevo / Again')}
                </span>
              </div>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                {t('study_help.again_badge', 'Fallo Total')} • [1]
              </span>
            </div>
            <p className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed pl-4.5">
              {t(
                'study_help.again_desc',
                'Fallo total o respuesta incorrecta. Selecciona esta opción SIEMPRE que falles para que el algoritmo registre el olvido y repita la tarjeta en la sesión.'
              )}
            </p>
          </div>

          {/* 2. Difícil / Hard (Naranja) */}
          <div className="p-3 sm:p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 dark:bg-amber-950/20 space-y-1 transition hover:border-amber-500/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span className="font-bold text-xs sm:text-sm text-amber-700 dark:text-amber-300">
                  {t('study_help.hard_title', '2. Difícil / Hard')}
                </span>
              </div>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                {t('study_help.hard_badge', 'Acierto con esfuerzo')} • [2]
              </span>
            </div>
            <p className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed pl-4.5">
              {t(
                'study_help.hard_desc',
                'Acierto con mucho esfuerzo. La recordaste por los pelos o tras dudar bastante. NO usar si fallaste la pregunta.'
              )}
            </p>
          </div>

          {/* 3. Bien / Good (Verde) */}
          <div className="p-3 sm:p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 dark:bg-emerald-950/20 space-y-1 transition hover:border-emerald-500/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="font-bold text-xs sm:text-sm text-emerald-700 dark:text-emerald-300">
                  {t('study_help.good_title', '3. Bien / Good')}
                </span>
              </div>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                {t('study_help.good_badge', 'Acierto Estándar')} • [3]
              </span>
            </div>
            <p className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed pl-4.5">
              {t(
                'study_help.good_desc',
                'Acierto normal y esperado. Es la opción estándar tras un esfuerzo mental razonable.'
              )}
            </p>
          </div>

          {/* 4. Fácil / Easy (Azul) */}
          <div className="p-3 sm:p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/30 dark:bg-sky-950/20 space-y-1 transition hover:border-sky-500/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
                <span className="font-bold text-xs sm:text-sm text-sky-700 dark:text-sky-300">
                  {t('study_help.easy_title', '4. Fácil / Easy')}
                </span>
              </div>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/30">
                {t('study_help.easy_badge', 'Acierto Inmediato')} • [4]
              </span>
            </div>
            <p className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed pl-4.5">
              {t(
                'study_help.easy_desc',
                'Acierto inmediato y sin dudar. Amplía el intervalo para espaciarla en el tiempo.'
              )}
            </p>
          </div>
        </div>

        {/* Botón de acción */}
        <div className="pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 px-4 rounded-xl font-semibold text-sm bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-white text-white dark:text-neutral-900 transition-all duration-150 shadow-md active:scale-[0.99] cursor-pointer"
          >
            {t('study_help.got_it_btn', 'Entendido, ¡a repasar!')}
          </button>
        </div>
      </div>
    </div>
  );
}
