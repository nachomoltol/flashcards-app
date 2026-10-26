'use client';

import React, { use, useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Clock,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Flag,
  CheckCircle,
  Layers,
  X,
} from 'lucide-react';
import {
  useDeckStore,
  useCardStore,
  useLanguageStore,
  useExamStore,
  type CardRow,
} from '@/stores';
import { useExamTimer } from '@/hooks/useExamTimer';
import {
  ExamSetup,
  ExamQuestionView,
  ExamQuestionGrid,
  ExamResultsView,
  ExamHelpModal,
  ExamConfirmSubmitModal,
} from '@/components/exam';

interface ExamPageProps {
  params: Promise<{ deckId: string }>;
}

export default function ExamPage({ params }: ExamPageProps) {
  const { deckId } = use(params);
  const router = useRouter();

  const { currentDeck, fetchDeckById } = useDeckStore();
  const { cards: allCards, fetchCardsByDeck, isLoading } = useCardStore();
  const { t } = useLanguageStore();

  const {
    config,
    cards: examCards,
    currentIndex,
    isStarted,
    isFinished,
    answers,
    flagged,
    initExam,
    goToQuestion,
    toggleFlag,
    finishExam,
    resetExam,
  } = useExamStore();

  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isMobileGridOpen, setIsMobileGridOpen] = useState(false);
  const [isConfirmSubmitOpen, setIsConfirmSubmitOpen] = useState(false);

  // Contadores de preguntas con duda y sin responder
  const flaggedCount = examCards.filter((c) => flagged.includes(c.id)).length;
  const unansweredCount = examCards.filter((c) => !answers[c.id] || answers[c.id].trim() === '').length;

  // Cargar el mazo y tarjetas en modo SOLO LECTURA
  useEffect(() => {
    fetchDeckById(deckId);
    fetchCardsByDeck(deckId);
  }, [deckId, fetchDeckById, fetchCardsByDeck]);

  // Manejador definitivo de fin de examen por tiempo o confirmación de entrega
  const handleFinishExam = useCallback(() => {
    setIsConfirmSubmitOpen(false);
    setIsMobileGridOpen(false);
    finishExam();
  }, [finishExam]);

  // Manejador preventivo antes de finalizar
  const handleAttemptFinish = useCallback(() => {
    const fCount = examCards.filter((c) => flagged.includes(c.id)).length;
    const uCount = examCards.filter((c) => !answers[c.id] || answers[c.id].trim() === '').length;

    // Si flaggedCount === 0 y unansweredCount === 0, finaliza normalmente
    if (fCount === 0 && uCount === 0) {
      handleFinishExam();
    } else {
      // Si existe al menos 1 pregunta con duda o sin responder, abre el modal de advertencia preventiva
      setIsConfirmSubmitOpen(true);
    }
  }, [examCards, flagged, answers, handleFinishExam]);

  // Acción: Navegar directamente a la primera pregunta pendiente (con duda o sin responder)
  const handleReviewPending = useCallback(() => {
    setIsConfirmSubmitOpen(false);
    setIsMobileGridOpen(false);
    const targetIdx = examCards.findIndex(
      (c) => (!answers[c.id] || answers[c.id].trim() === '') || flagged.includes(c.id)
    );
    if (targetIdx !== -1) {
      goToQuestion(targetIdx);
    }
  }, [examCards, answers, flagged, goToQuestion]);

  // Hook del temporizador
  const timer = useExamTimer({
    initialMinutes: config.timeLimitMinutes,
    onTimeUp: handleFinishExam,
    autoStart: false,
  });

  // Guardar elapsedSeconds cada vez que se finaliza
  const timerElapsedRef = useRef(timer.elapsedSeconds);
  useEffect(() => {
    timerElapsedRef.current = timer.elapsedSeconds;
  }, [timer.elapsedSeconds]);

  // Iniciar examen
  const handleStartExam = () => {
    if (allCards.length === 0) return;
    initExam(allCards);
    timer.reset(config.timeLimitMinutes);
    timer.start();
  };

  // Reintentar simulacro
  const handleRetry = () => {
    resetExam();
    timer.reset(config.timeLimitMinutes);
  };

  const currentCard = examCards[currentIndex] || null;
  const isCurrentFlagged = currentCard ? flagged.includes(currentCard.id) : false;

  // 1. ESTADO: PREPARACIÓN Y CONFIGURACIÓN PREVIA
  if (!isStarted) {
    return (
      <div className="w-full min-h-screen overflow-y-auto">
        <ExamSetup
          deckTitle={currentDeck?.title || t('deck_detail.untitled_deck', 'Mazo de estudio')}
          deckId={deckId}
          cards={allCards}
          onStartExam={handleStartExam}
        />
      </div>
    );
  }

  // 2. ESTADO: RESULTADOS Y CALIFICACIÓN FINAL
  if (isFinished) {
    return (
      <div className="w-full min-h-screen overflow-y-auto">
        <ExamResultsView
          deckId={deckId}
          deckTitle={currentDeck?.title || t('deck_detail.untitled_deck', 'Mazo de estudio')}
          onRetry={handleRetry}
        />
      </div>
    );
  }

  // 3. ESTADO: SIMULACRO ACTIVO EN CURSO
  return (
    <div className="w-full max-w-5xl mx-auto min-h-screen md:min-h-0 md:h-full flex flex-col justify-between p-2.5 sm:p-4 md:p-6 pb-20 sm:pb-6 overflow-y-auto md:overflow-hidden animate-in fade-in duration-200">
      {/* Top Exam Header */}
      <div className="shrink-0 pb-2 border-b border-neutral-200 dark:border-neutral-800 space-y-2">
        <div className="flex items-center justify-between gap-2">
          {/* Deck Title & Breadcrumb */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={handleAttemptFinish}
              className="text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition flex items-center gap-1 shrink-0"
              title={t('exam.exit_tooltip', 'Salir del simulacro')}
            >
              <X className="w-4 h-4" />
              <span className="hidden sm:inline">{t('exam.exit', 'Salir')}</span>
            </button>
            <span className="text-neutral-300 dark:text-neutral-700 hidden sm:inline">•</span>
            <p className="text-xs sm:text-sm font-bold text-neutral-900 dark:text-white truncate max-w-[130px] sm:max-w-xs">
              {currentDeck?.title}
            </p>
          </div>

          {/* Clock Timer + Question Progress + Help + Finish Button */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Reloj regresivo con alerta en últimos 60 segundos */}
            <div
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs sm:text-sm font-bold font-mono transition-colors border ${
                timer.isUrgent
                  ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/40 animate-pulse'
                  : 'bg-neutral-100 dark:bg-neutral-800/80 text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-neutral-700'
              }`}
              title={
                timer.hasTimeLimit
                  ? t('exam.timer_countdown_tooltip', 'Tiempo restante del simulacro')
                  : t('exam.timer_elapsed_tooltip', 'Tiempo transcurrido')
              }
            >
              <Clock className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${timer.isUrgent ? 'text-rose-500' : 'text-neutral-500'}`} />
              <span>{timer.formattedTime}</span>
            </div>

            {/* Help Button */}
            <button
              type="button"
              onClick={() => setIsHelpOpen(true)}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
              title={t('exam.help_btn', 'Ayuda')}
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            {/* Finalizar Examen button */}
            <button
              type="button"
              onClick={handleAttemptFinish}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs sm:text-sm transition shadow-sm active:scale-95 cursor-pointer"
            >
              {t('exam.finish_btn', 'Terminar')}
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-neutral-200 dark:bg-neutral-800 h-1.5 rounded-full overflow-hidden">
          <div
            className="bg-indigo-600 h-full transition-all duration-300"
            style={{ width: `${Math.round(((currentIndex + 1) / examCards.length) * 100)}%` }}
          />
        </div>
      </div>

      {/* Main Content Area: Responsive Grid (Desktop 2-cols vs Mobile focused 1-col) */}
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-12 gap-4 py-2 sm:py-3 overflow-visible md:overflow-hidden">
        {/* Left / Center Column: Question Card */}
        <div className="md:col-span-8 lg:col-span-9 flex flex-col justify-between rounded-2xl sm:rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 backdrop-blur-xl p-4 sm:p-6 shadow-xl overflow-visible md:overflow-hidden min-h-[380px] md:min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            {currentCard && (
              <ExamQuestionView
                card={currentCard}
                index={currentIndex}
                total={examCards.length}
              />
            )}
          </div>

          {/* Question Card Bottom Navigation Bar */}
          <div className="shrink-0 pt-3 border-t border-neutral-200 dark:border-neutral-800/80 flex items-center justify-between gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => goToQuestion(currentIndex - 1)}
              disabled={currentIndex === 0}
              className="px-2.5 sm:px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white hover:bg-neutral-50 dark:bg-neutral-900 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs sm:text-sm font-semibold transition flex items-center gap-1 sm:gap-1.5 disabled:opacity-30 disabled:pointer-events-none cursor-pointer active:scale-95 shrink-0"
            >
              <ChevronLeft className="w-4 h-4 shrink-0" />
              <span className="hidden min-[380px]:inline">{t('exam.prev', 'Anterior')}</span>
              <span className="min-[380px]:hidden">Ant.</span>
            </button>

            {/* Mobile Controls: Duda 🚩 and Interactive Questions Pill */}
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => toggleFlag(currentCard?.id || '')}
                className={`md:hidden px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-full sm:rounded-xl border text-[11px] sm:text-xs font-bold transition flex items-center gap-1 active:scale-95 cursor-pointer shrink-0 ${
                  isCurrentFlagged
                    ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/40 shadow-xs'
                    : 'bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50'
                }`}
                title={isCurrentFlagged ? t('exam.flag_remove', 'Quitar duda') : t('exam.flag_add', 'Marcar con duda 🚩')}
              >
                <Flag className={`w-3.5 h-3.5 shrink-0 ${isCurrentFlagged ? 'fill-amber-500 text-amber-500' : 'text-neutral-400'}`} />
                <span>Duda 🚩</span>
              </button>

              <button
                type="button"
                onClick={() => setIsMobileGridOpen(true)}
                className="md:hidden inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border border-indigo-200 dark:border-indigo-800/80 bg-indigo-50/90 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-[11px] sm:text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer shrink-0"
                title="Abrir mapa de preguntas"
              >
                <Layers className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span className="hidden min-[390px]:inline">Preguntas ({currentIndex + 1}/{examCards.length})</span>
                <span className="min-[390px]:hidden">({currentIndex + 1}/{examCards.length})</span>
              </button>
            </div>

            {currentIndex === examCards.length - 1 ? (
              <button
                type="button"
                onClick={handleAttemptFinish}
                className="px-2.5 sm:px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold transition flex items-center gap-1 sm:gap-1.5 shadow-md shadow-emerald-600/20 active:scale-95 cursor-pointer shrink-0"
              >
                <span>{t('exam.finish_cta', 'Finalizar')}</span>
                <CheckCircle className="w-4 h-4 shrink-0" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => goToQuestion(currentIndex + 1)}
                className="px-2.5 sm:px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-bold transition flex items-center gap-1 sm:gap-1.5 shadow-md shadow-indigo-600/20 active:scale-95 cursor-pointer shrink-0"
              >
                <span className="hidden min-[390px]:inline">{t('exam.next', 'Siguiente')}</span>
                <span className="min-[390px]:hidden">Sig.</span>
                <ChevronRight className="w-4 h-4 shrink-0" />
              </button>
            )}
          </div>
        </div>

        {/* Right Column: Sticky Question Grid (Desktop only) */}
        <div className="hidden md:flex md:col-span-4 lg:col-span-3 h-full flex-col justify-between rounded-2xl sm:rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 backdrop-blur-xl p-4 sm:p-5 shadow-xl overflow-y-auto">
          <ExamQuestionGrid />
        </div>
      </div>

      {/* Mobile Drawer / Bottom Sheet for Question Grid */}
      {isMobileGridOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs md:hidden animate-in fade-in"
          onClick={() => setIsMobileGridOpen(false)}
        >
          <div
            className="w-full max-h-[80vh] rounded-t-3xl bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 p-5 space-y-4 animate-in slide-in-from-bottom duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-neutral-200 dark:border-neutral-800">
              <span className="text-sm font-bold text-neutral-900 dark:text-white">
                {t('exam.grid_drawer_title', 'Índice de Preguntas')}
              </span>
              <button
                type="button"
                onClick={() => setIsMobileGridOpen(false)}
                className="p-1 rounded text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <ExamQuestionGrid onSelectQuestion={() => setIsMobileGridOpen(false)} />
          </div>
        </div>
      )}

      {/* Modal de Advertencia Preventiva antes de Entregar */}
      <ExamConfirmSubmitModal
        isOpen={isConfirmSubmitOpen}
        onClose={() => setIsConfirmSubmitOpen(false)}
        onReviewPending={handleReviewPending}
        onSubmitAnyway={handleFinishExam}
        flaggedCount={flaggedCount}
        unansweredCount={unansweredCount}
        totalQuestions={examCards.length}
      />

      {/* Help Modal */}
      <ExamHelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </div>
  );
}
