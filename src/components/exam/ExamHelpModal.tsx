'use client';

import { X, HelpCircle, EyeOff, Layers, Scale, ShieldCheck, Flag } from 'lucide-react';
import { useLanguageStore } from '@/stores';

interface ExamHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ExamHelpModal({ isOpen, onClose }: ExamHelpModalProps) {
  const { t } = useLanguageStore();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="exam-help-title"
    >
      <div
        className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl sm:rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xl p-4 sm:p-6 text-neutral-900 dark:text-neutral-100 space-y-4 sm:space-y-5 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 id="exam-help-title" className="text-base sm:text-lg font-bold">
                {t('exam.help_title', 'Guía del Modo Simulacro')}
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {t('exam.help_subtitle', 'Cómo funciona la evaluación independiente')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close', 'Cerrar')}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 4 Cards de explicación */}
        <div className="space-y-3 text-xs sm:text-sm">
          {/* 1. Simulacro a ciegas */}
          <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-800 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
              <EyeOff className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-neutral-900 dark:text-white">
                {t('exam.help_blind_title', '1. Simulacro a Ciegas')}
              </p>
              <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed text-xs">
                {t(
                  'exam.help_blind_desc',
                  'Responde a todas las preguntas sin ver retroalimentación inmediata. La nota y las soluciones explicadas se revelarán al finalizar el examen, simulando condiciones de prueba real.'
                )}
              </p>
            </div>
          </div>

          {/* 2. Soporte Multiformato */}
          <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-800 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 mt-0.5">
              <Layers className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-neutral-900 dark:text-white">
                {t('exam.help_format_title', '2. Soporte Multiformato')}
              </p>
              <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed text-xs">
                {t(
                  'exam.help_format_desc',
                  'En Test y Verdadero/Falso seleccionas tu opción directamente. En tarjetas básicas y con huecos (cloze) puedes redactar tu respuesta; al final compararás tu texto con la solución para confirmar acierto o fallo.'
                )}
              </p>
            </div>
          </div>

          {/* 3. Penalización */}
          <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-800 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
              <Scale className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-neutral-900 dark:text-white">
                {t('exam.help_penalty_title', '3. Penalización por Fallos')}
              </p>
              <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed text-xs">
                {t(
                  'exam.help_penalty_desc',
                  'Puedes activar penalizaciones oficiales (-1/3 o -1/4 por fallo). Las preguntas dejadas en blanco no restan puntuación. La calificación final se calcula sobre 10.'
                )}
              </p>
            </div>
          </div>

          {/* 4. Memoria intacta */}
          <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-emerald-800 dark:text-emerald-300">
                {t('exam.help_integrity_title', '4. Memoria FSRS Intacta')}
              </p>
              <p className="text-emerald-700 dark:text-emerald-400/90 leading-relaxed text-xs">
                {t(
                  'exam.help_integrity_desc',
                  'Este simulacro es un examen de prueba 100% independiente. No altera tus intervalos FSRS, ni tus repasos programados ni tu racha de estudio diaria.'
                )}
              </p>
            </div>
          </div>

          {/* 5. Marcar Duda y Mapa de Preguntas */}
          <div className="p-3.5 rounded-xl bg-amber-500/10 dark:bg-amber-950/20 border border-amber-500/30 dark:border-amber-800/40 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
              <Flag className="w-4 h-4 fill-amber-500" />
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-amber-900 dark:text-amber-300">
                {t('exam.help_flag_title', '5. Marcar Duda 🚩 y Mapa de Preguntas')}
              </p>
              <p className="text-amber-800 dark:text-amber-400/90 leading-relaxed text-xs">
                {t(
                  'exam.help_flag_desc',
                  'Usa el botón "Duda 🚩" para señalar preguntas dudosas y volver a ellas más tarde. Pulsa el botón central "Preguntas" (o el panel lateral en PC) para ver en cualquier momento qué preguntas tienes respondidas, pendientes o marcadas, y saltar directamente a cualquiera de ellas antes de entregar.'
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs sm:text-sm transition shadow-md shadow-indigo-600/20 cursor-pointer"
          >
            {t('common.understood', 'Entendido')}
          </button>
        </div>
      </div>
    </div>
  );
}
