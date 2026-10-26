'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  RotateCcw,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Award,
  AlertTriangle,
  Check,
  X,
  Zap,
} from 'lucide-react';
import {
  useLanguageStore,
  useExamStore,
  usePanicStore,
  type CardRow,
  evaluateObjectiveAnswer,
} from '@/stores';
import { formatSeconds } from '@/hooks/useExamTimer';

interface ExamResultsViewProps {
  deckId: string;
  deckTitle: string;
  onRetry: () => void;
}

export function ExamResultsView({ deckId, deckTitle, onRetry }: ExamResultsViewProps) {
  const router = useRouter();
  const { t } = useLanguageStore();
  const {
    cards,
    answers,
    selfEvaluations,
    setSelfEvaluation,
    config,
    elapsedSeconds,
    computeResults,
  } = useExamStore();

  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

  // Identificar tarjetas falladas en el simulacro para acción rápida en Modo Pánico
  const failedCards = cards.filter((card) => {
    const format =
      card.cardFormat ||
      card.card_format ||
      (card.card_type === 'cloze' ? 'cloze' : 'basic');
    const isObjective = format === 'multiple_choice' || format === 'true_false';
    const userAnswer = (answers[card.id] || '').trim();

    if (isObjective) {
      return evaluateObjectiveAnswer(card, userAnswer) === 'incorrect';
    } else {
      return selfEvaluations[card.id] === 'incorrect' || (!selfEvaluations[card.id] && userAnswer !== '');
    }
  });

  const failedCardIds = failedCards.map((c) => c.id);

  const handleLaunchPanicWithErrors = () => {
    usePanicStore.getState().initPanicSession(cards, 'exam_errors', deckId, failedCardIds);
    router.push(`/panic/${deckId}?mode=exam_errors`);
  };

  // 1. Identificar si hay tarjetas abiertas o de huecos que requieran auto-evaluación
  const openCardsPendingReview = cards.filter((card) => {
    const fmt =
      card.cardFormat ||
      card.card_format ||
      (card.card_type === 'cloze' ? 'cloze' : 'basic');
    const isObjective = fmt === 'multiple_choice' || fmt === 'true_false';
    if (isObjective) return false;
    // Solo si el alumno no ha marcado aún si acertó o falló
    return !selfEvaluations[card.id];
  });

  const [showSelfEvaluationPhase, setShowSelfEvaluationPhase] = useState<boolean>(() => {
    return openCardsPendingReview.length > 0;
  });

  const toggleExpand = (id: string) => {
    setExpandedCards((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // FASE 1: AUTO-EVALUACIÓN DE PREGUNTAS ABIERTAS / HUECOS
  if (showSelfEvaluationPhase && openCardsPendingReview.length > 0) {
    return (
      <div className="min-h-screen w-full overflow-y-auto py-6 sm:py-10 px-4 pb-28 sm:pb-36 text-left animate-in fade-in duration-200">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="p-5 sm:p-7 rounded-2xl sm:rounded-3xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-500/30 shadow-lg space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-600 text-white shadow-sm">
            <span>✍️</span>
            <span>{t('exam.self_eval_badge', 'Paso Previo: Auto-evaluación')}</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-neutral-900 dark:text-white">
            {t('exam.self_eval_title', 'Revisa tus respuestas abiertas')}
          </h2>
          <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-300">
            {t(
              'exam.self_eval_desc',
              'Compara lo que escribiste con la solución oficial de cada tarjeta para decidir con honestidad si tu respuesta fue correcta.'
            )}
          </p>
        </div>

        <div className="space-y-4">
          {openCardsPendingReview.map((card, idx) => {
            const userAnswer = (answers[card.id] || '').trim();
            const currentEval = selfEvaluations[card.id];

            return (
              <div
                key={card.id}
                className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-neutral-900/70 border border-neutral-200 dark:border-neutral-800 shadow-md space-y-3"
              >
                <div className="flex items-center justify-between pb-2 border-b border-neutral-200 dark:border-neutral-800">
                  <span className="text-xs font-bold text-neutral-500 font-mono">
                    {t('exam.question_num', { num: idx + 1 })}
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded font-semibold bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                    {card.cardFormat === 'cloze' ? 'Cloze' : 'Básica'}
                  </span>
                </div>

                {/* Pregunta */}
                <div>
                  <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                    {t('exam.question_statement', 'Enunciado:')}
                  </p>
                  <p className="text-sm font-bold text-neutral-900 dark:text-white mt-1 whitespace-pre-wrap">
                    {card.front}
                  </p>
                </div>

                {/* Lo que escribió el alumno */}
                <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-950/60 border border-neutral-200 dark:border-neutral-800">
                  <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 block mb-1">
                    {t('exam.your_typed_answer', 'Tu respuesta:')}
                  </span>
                  <p className="text-xs sm:text-sm text-neutral-800 dark:text-neutral-200 italic">
                    {userAnswer ? `"${userAnswer}"` : t('exam.unanswered_placeholder', '(En blanco)')}
                  </p>
                </div>

                {/* Solución oficial */}
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
                  <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 block mb-1">
                    {t('exam.official_solution', 'Solución oficial:')}
                  </span>
                  <p className="text-xs sm:text-sm text-neutral-900 dark:text-neutral-100 font-medium whitespace-pre-wrap">
                    {card.back}
                  </p>
                </div>

                {/* Botones de veredicto: Acerté vs Fallé */}
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelfEvaluation(card.id, 'correct')}
                    className={`py-2 px-3 rounded-xl border text-xs sm:text-sm font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      currentEval === 'correct'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-500/30'
                        : 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100'
                    }`}
                  >
                    <Check className="w-4 h-4" />
                    <span>{t('exam.i_was_right', 'Acerté')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelfEvaluation(card.id, 'incorrect')}
                    className={`py-2 px-3 rounded-xl border text-xs sm:text-sm font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      currentEval === 'incorrect'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-md ring-2 ring-rose-500/30'
                        : 'bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-800 hover:bg-rose-100'
                    }`}
                  >
                    <X className="w-4 h-4" />
                    <span>{t('exam.i_was_wrong', 'Fallé')}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-2">
          <button
            type="button"
            onClick={() => setShowSelfEvaluationPhase(false)}
            className="w-full py-3.5 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-sm sm:text-base transition shadow-xl shadow-indigo-600/25 active:scale-[0.99] cursor-pointer"
          >
            {t('exam.see_final_results', 'Ver Calificación Final')}
          </button>
        </div>
      </div>
    </div>
  );
  }

  // FASE 2: PANTALLA DE CALIFICACIÓN Y DIAGNÓSTICO FINAL
  const results = computeResults();
  const isPassed = results.passed;

  return (
    <div className="min-h-screen w-full overflow-y-auto py-6 sm:py-10 px-4 pb-28 sm:pb-36 text-center animate-in fade-in duration-300">
      <div className="max-w-3xl mx-auto space-y-6 sm:space-y-8">
        {/* Hero Grade Card */}
      <div
        className={`p-6 sm:p-8 rounded-3xl border shadow-2xl relative overflow-hidden text-center space-y-3 ${
          isPassed
            ? 'bg-gradient-to-b from-emerald-500/15 via-emerald-500/5 to-transparent border-emerald-500/40'
            : 'bg-gradient-to-b from-rose-500/15 via-rose-500/5 to-transparent border-rose-500/40'
        }`}
      >
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border shadow-sm">
          <span>{isPassed ? '🎉' : '⚠️'}</span>
          <span>
            {isPassed ? t('exam.result_passed', 'APROBADO') : t('exam.result_failed', 'SUSPENSO')}
          </span>
        </div>

        {/* Large Grade Display */}
        <div className="py-2">
          <span
            className={`text-5xl sm:text-7xl font-black tracking-tight font-mono ${
              isPassed ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {results.scoreOutOf10.toFixed(2)}
          </span>
          <span className="text-xl sm:text-2xl font-bold text-neutral-400 ml-2">/ 10</span>
        </div>

        <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-300 max-w-md mx-auto">
          {isPassed
            ? t(
                'exam.passed_comment',
                '¡Excelente dominio! Has superado el simulacro evaluativo con éxito.'
              )
            : t(
                'exam.failed_comment',
                'No has alcanzado el 5.0 en esta ocasión. Revisa las soluciones detalladas a continuación para reforzar los conceptos.'
              )}
        </p>

        {config.penaltyFormula !== 'none' && (
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 font-mono">
            {t('exam.penalty_applied_note', {
              formula: config.penaltyFormula === 'one_third' ? '-1/3' : '-1/4',
              points: results.penaltyPoints.toFixed(2),
            })}
          </p>
        )}
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Aciertos */}
        <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 text-left">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
              {t('exam.metric_correct', 'Aciertos')}
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-neutral-900 dark:text-white mt-1 font-mono">
            {results.correctCount}
          </p>
        </div>

        {/* Fallos */}
        <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 text-left">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
              {t('exam.metric_incorrect', 'Fallos')}
            </span>
            <XCircle className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-neutral-900 dark:text-white mt-1 font-mono">
            {results.incorrectCount}
          </p>
        </div>

        {/* En Blanco */}
        <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 text-left">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
              {t('exam.metric_blank', 'En Blanco')}
            </span>
            <HelpCircle className="w-4 h-4 text-neutral-400" />
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-neutral-900 dark:text-white mt-1 font-mono">
            {results.blankCount}
          </p>
        </div>

        {/* Tiempo */}
        <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 text-left">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
              {t('exam.metric_time', 'Tiempo')}
            </span>
            <Clock className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-neutral-900 dark:text-white mt-1 font-mono">
            {formatSeconds(elapsedSeconds)}
          </p>
        </div>
      </div>

      {/* Acciones Rápidas */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
        {failedCardIds.length > 0 && (
          <button
            type="button"
            onClick={handleLaunchPanicWithErrors}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-white font-bold text-sm transition shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            <Zap className="w-4 h-4 fill-current" />
            <span>
              {t('exam.drill_errors_panic_btn', 'Machacar fallos en Modo Pánico ⚡')} ({failedCardIds.length})
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={onRetry}
          className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
          <span>{t('exam.retry_btn', 'Repetir Simulacro')}</span>
        </button>

        <Link
          href={`/decks/${deckId}`}
          className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-white font-semibold text-sm transition flex items-center justify-center gap-2 border border-neutral-300 dark:border-neutral-700"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('common.back_to_deck', 'Volver al mazo')}</span>
        </Link>
      </div>

      {/* Listado de Revisión Pregunta por Pregunta */}
      <div className="space-y-4 text-left pt-6 border-t border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center justify-between">
          <h3 className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white">
            {t('exam.review_title', 'Revisión Detallada de Preguntas')}
          </h3>
          <span className="text-xs text-neutral-400">
            {cards.length} {t('common.questions_count', 'preguntas')}
          </span>
        </div>

        <div className="space-y-3">
          {cards.map((card, idx) => {
            const isExpanded = Boolean(expandedCards[card.id]);
            const userAnswer = (answers[card.id] || '').trim();

            const format =
              card.cardFormat ||
              card.card_format ||
              (card.card_type === 'cloze' ? 'cloze' : 'basic');

            const isObjective = format === 'multiple_choice' || format === 'true_false';

            let status: 'correct' | 'incorrect' | 'blank' = 'blank';
            if (isObjective) {
              status = evaluateObjectiveAnswer(card, userAnswer);
            } else {
              const selfEval = selfEvaluations[card.id];
              if (selfEval === 'correct') status = 'correct';
              else if (selfEval === 'incorrect') status = 'incorrect';
              else if (!userAnswer) status = 'blank';
              else status = 'incorrect';
            }

            return (
              <div
                key={card.id}
                className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 shadow-sm overflow-hidden transition"
              >
                {/* Accordion Header */}
                <button
                  type="button"
                  onClick={() => toggleExpand(card.id)}
                  className="w-full p-4 flex items-center justify-between gap-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-bold text-neutral-400 font-mono shrink-0">
                      #{idx + 1}
                    </span>

                    {/* Status Badge */}
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                        status === 'correct'
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          : status === 'incorrect'
                          ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                          : 'bg-neutral-200/70 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                      }`}
                    >
                      {status === 'correct'
                        ? t('exam.status_correct', 'Acierto')
                        : status === 'incorrect'
                        ? t('exam.status_incorrect', 'Fallo')
                        : t('exam.status_blank', 'En blanco')}
                    </span>

                    <p className="text-xs sm:text-sm font-semibold text-neutral-900 dark:text-white truncate">
                      {card.front}
                    </p>
                  </div>

                  <div className="shrink-0 text-neutral-400">
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </button>

                {/* Accordion Body */}
                {isExpanded && (
                  <div className="p-4 pt-1 sm:pt-2 border-t border-neutral-100 dark:border-neutral-800/60 space-y-3 text-xs sm:text-sm bg-neutral-50/50 dark:bg-neutral-900/30">
                    {/* Enunciado Completo */}
                    <div>
                      <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider block mb-0.5">
                        {t('exam.full_statement', 'Enunciado:')}
                      </span>
                      <p className="font-medium text-neutral-900 dark:text-white whitespace-pre-wrap">
                        {card.front}
                      </p>
                    </div>

                    {/* Respuesta dada por el usuario */}
                    <div className="p-3 rounded-xl bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800">
                      <span className="text-[11px] font-semibold text-neutral-500 block mb-1">
                        {t('exam.your_answer_label', 'Tu respuesta:')}
                      </span>
                      <p className="font-semibold text-neutral-900 dark:text-white">
                        {userAnswer ? userAnswer : t('exam.unanswered_placeholder', '(En blanco)')}
                      </p>
                    </div>

                    {/* Solución Oficial */}
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
                      <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 block mb-1">
                        {t('exam.official_solution', 'Solución oficial:')}
                      </span>
                      <p className="font-medium text-neutral-900 dark:text-white whitespace-pre-wrap">
                        {card.back}
                      </p>
                    </div>

                    {/* Notas explicativas si existen */}
                    {card.notes && (
                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25">
                        <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 block mb-1">
                          💡 {t('study.note_tooltip_title', 'Nota Aclaratoria')}
                        </span>
                        <p className="text-xs text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap">
                          {card.notes}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  </div>
);
}
