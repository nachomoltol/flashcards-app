'use client';

import React from 'react';
import { AlertTriangle, Flag, HelpCircle, ArrowLeft, CheckCircle2, X } from 'lucide-react';
import { useLanguageStore } from '@/stores';

interface ExamConfirmSubmitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReviewPending: () => void;
  onSubmitAnyway: () => void;
  flaggedCount: number;
  unansweredCount: number;
  totalQuestions: number;
}

export function ExamConfirmSubmitModal({
  isOpen,
  onClose,
  onReviewPending,
  onSubmitAnyway,
  flaggedCount,
  unansweredCount,
  totalQuestions,
}: ExamConfirmSubmitModalProps) {
  const { t } = useLanguageStore();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-submit-title"
    >
      <div
        className="w-full max-w-md rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5 sm:p-6 space-y-5 shadow-2xl text-left animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/30 shrink-0">
            <AlertTriangle className="w-6 h-6" />
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

        {/* Title and Subtitle */}
        <div className="space-y-1">
          <h3 id="confirm-submit-title" className="text-lg sm:text-xl font-bold text-neutral-900 dark:text-white">
            {t('exam.confirm_modal_title', '¿Entregar el simulacro de examen?')}
          </h3>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
            {t('exam.confirm_modal_subtitle', 'Tienes preguntas pendientes antes de calificar tu prueba:')}
          </p>
        </div>

        {/* Warning Cards List */}
        <div className="space-y-2.5">
          {/* Card: Unanswered */}
          {unansweredCount > 0 && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 mt-0.5">
                <HelpCircle className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-xs sm:text-sm font-bold text-rose-700 dark:text-rose-300">
                  {unansweredCount === 1
                    ? t('exam.confirm_modal_unanswered', { count: unansweredCount }, `Tienes ${unansweredCount} pregunta sin responder`)
                    : t('exam.confirm_modal_unanswered_plural', { count: unansweredCount }, `Tienes ${unansweredCount} preguntas sin responder`)}
                </p>
                <p className="text-[11px] text-rose-600/80 dark:text-rose-400/80 leading-snug">
                  {t('exam.confirm_modal_unanswered_desc', 'Las preguntas sin responder se computarán en blanco.')}
                </p>
              </div>
            </div>
          )}

          {/* Card: Flagged with Doubt */}
          {flaggedCount > 0 && (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                <Flag className="w-4 h-4 fill-amber-500" />
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-xs sm:text-sm font-bold text-amber-700 dark:text-amber-300">
                  {flaggedCount === 1
                    ? t('exam.confirm_modal_flagged', { count: flaggedCount }, `Tienes ${flaggedCount} pregunta marcada con duda 🚩`)
                    : t('exam.confirm_modal_flagged_plural', { count: flaggedCount }, `Tienes ${flaggedCount} preguntas marcadas con duda 🚩`)}
                </p>
                <p className="text-[11px] text-amber-600/80 dark:text-amber-400/80 leading-snug">
                  {t('exam.confirm_modal_flagged_desc', 'Marcaste estas tarjetas para revisarlas antes de finalizar.')}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 pt-2">
          {/* Action a) Revisar pendientes */}
          <button
            type="button"
            onClick={onReviewPending}
            className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs sm:text-sm transition-all shadow-md shadow-indigo-600/25 flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t('exam.review_pending_btn', 'Revisar pendientes')}</span>
          </button>

          {/* Action b) Entregar de todos modos */}
          <button
            type="button"
            onClick={onSubmitAnyway}
            className="w-full py-2.5 px-4 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white hover:bg-neutral-100 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 font-semibold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            <CheckCircle2 className="w-4 h-4 text-neutral-400" />
            <span>{t('exam.submit_anyway_btn', 'Entregar de todos modos')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
