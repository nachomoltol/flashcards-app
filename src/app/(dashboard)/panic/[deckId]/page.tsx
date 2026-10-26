'use client';

import React, { use, useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Zap,
  ArrowLeft,
  RotateCcw,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Layers,
  Sparkles,
  AlertOctagon,
  Flame,
  Check,
  X,
  Volume2,
} from 'lucide-react';
import {
  useDeckStore,
  useCardStore,
  useLanguageStore,
  usePanicStore,
  filterPanicCards,
  type PanicFilter,
} from '@/stores';
import { FormattedCardView } from '@/components/cards';

interface PanicPageProps {
  params: Promise<{ deckId: string }>;
}

export default function PanicPage({ params }: PanicPageProps) {
  const { deckId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();

  const { currentDeck, fetchDeckById } = useDeckStore();
  const { cards: allCards, fetchCardsByDeck, isLoading } = useCardStore();
  const { t } = useLanguageStore();

  const {
    queue,
    initialCount,
    completedCount,
    failedCount,
    selectedFilter,
    isStarted,
    isFinished,
    deckId: storeDeckId,
    customCardIds,
    initPanicSession,
    markKnown,
    markFailed,
    resetSession,
  } = usePanicStore();

  const [activeFilter, setActiveFilter] = useState<PanicFilter>(() => {
    const urlMode = searchParams.get('mode') as PanicFilter | null;
    if (urlMode === 'exam_errors' || urlMode === 'weak_points' || urlMode === 'at_risk' || urlMode === 'all') {
      return urlMode;
    }
    return 'weak_points';
  });

  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);

  // Cargar el mazo y las tarjetas si aún no están cargados
  useEffect(() => {
    fetchDeckById(deckId);
    fetchCardsByDeck(deckId);
  }, [deckId, fetchDeckById, fetchCardsByDeck]);

  // Si se inicializó desde otra pantalla (ej. examen) para este mismo mazo, sincronizar
  useEffect(() => {
    const urlMode = searchParams.get('mode') as PanicFilter | null;
    if (urlMode === 'exam_errors' && customCardIds.length > 0 && storeDeckId === deckId) {
      setActiveFilter('exam_errors');
    }
  }, [searchParams, customCardIds, storeDeckId, deckId]);

  // Conteo previo para cada filtro
  const weakCount = useMemo(() => filterPanicCards(allCards, 'weak_points').length, [allCards]);
  const atRiskCount = useMemo(() => filterPanicCards(allCards, 'at_risk').length, [allCards]);
  const totalCount = allCards.length;
  const examErrorsCount = useMemo(
    () => (customCardIds.length > 0 ? filterPanicCards(allCards, 'exam_errors', customCardIds).length : 0),
    [allCards, customCardIds]
  );

  // Conteo del filtro actualmente seleccionado
  const activeCount = useMemo(() => {
    switch (activeFilter) {
      case 'weak_points':
        return weakCount;
      case 'at_risk':
        return atRiskCount;
      case 'all':
        return totalCount;
      case 'exam_errors':
        return examErrorsCount;
      default:
        return 0;
    }
  }, [activeFilter, weakCount, atRiskCount, totalCount, examErrorsCount]);

  // Iniciar la sesión rápida
  const handleStartSession = useCallback(
    (filter: PanicFilter) => {
      initPanicSession(allCards, filter, deckId, customCardIds);
      setIsAnswerRevealed(false);
    },
    [allCards, deckId, customCardIds, initPanicSession]
  );

  // Acciones de calificación
  const handleKnown = useCallback(() => {
    setIsAnswerRevealed(false);
    markKnown();
  }, [markKnown]);

  const handleFailed = useCallback(() => {
    setIsAnswerRevealed(false);
    markFailed();
  }, [markFailed]);

  // Atajos de teclado: Espacio para voltear, 1/Izq para Fallé, 2/Der para Lo sabía
  useEffect(() => {
    if (!isStarted || isFinished || queue.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorar si el usuario está en un input o textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsAnswerRevealed((prev) => !prev);
      } else if (isAnswerRevealed) {
        if (e.key === '1' || e.key === 'ArrowLeft') {
          e.preventDefault();
          handleFailed();
        } else if (e.key === '2' || e.key === 'ArrowRight') {
          e.preventDefault();
          handleKnown();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isStarted, isFinished, queue.length, isAnswerRevealed, handleFailed, handleKnown]);

  const currentCard = queue.length > 0 ? queue[0] : null;

  // 1. ESTADO: PREPARACIÓN Y SELECTOR DE FILTRO
  if (!isStarted || queue.length === 0 && !isFinished) {
    return (
      <div className="w-full min-h-screen overflow-y-auto p-4 sm:p-6 md:p-8 flex items-center justify-center">
        <div className="w-full max-w-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-left animate-in fade-in duration-200">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-neutral-100 dark:border-neutral-800/80 pb-4">
            <Link
              href={`/decks/${deckId}`}
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{t('common.back', 'Volver')}</span>
            </Link>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>{t('panic.badge', 'Repaso de Emergencia')}</span>
            </div>
          </div>

          {/* Title & Description */}
          <div className="space-y-1.5">
            <h1 className="text-xl sm:text-2xl font-extrabold text-neutral-900 dark:text-white tracking-tight flex items-center gap-2">
              <span>{t('panic.title', 'Modo Pánico ⚡')}</span>
              <span className="text-sm font-medium text-neutral-400 dark:text-neutral-500">
                • {currentDeck?.title || t('deck_detail.untitled_deck', 'Mazo')}
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
              {t(
                'panic.description',
                'Repaso intensivo de última hora 100% en memoria. Las tarjetas falladas vuelven al final de la cola hasta que las domines todas, sin afectar tus algoritmos FSRS.'
              )}
            </p>
          </div>

          {/* Filter Selector Grid */}
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 font-mono">
              {t('panic.choose_filter', 'Selecciona qué quieres repasar:')}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Opción 1: Puntos Débiles */}
              <button
                type="button"
                onClick={() => setActiveFilter('weak_points')}
                className={`p-4 rounded-2xl border text-left transition-all duration-150 flex flex-col justify-between gap-3 active:scale-[0.98] cursor-pointer ${
                  activeFilter === 'weak_points'
                    ? 'border-rose-500 bg-rose-500/10 ring-2 ring-rose-500/30 dark:bg-rose-500/15 shadow-md'
                    : 'border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/40 hover:border-neutral-300 dark:hover:border-neutral-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold">
                    🔴
                  </div>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400">
                    {weakCount}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-bold text-neutral-900 dark:text-white">
                    {t('panic.filter_weak', 'Puntos Débiles')}
                  </p>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-tight mt-0.5">
                    {t('panic.filter_weak_desc', 'Tarjetas con fallos históricos registrados')}
                  </p>
                </div>
              </button>

              {/* Opción 2: Memoria en Riesgo */}
              <button
                type="button"
                onClick={() => setActiveFilter('at_risk')}
                className={`p-4 rounded-2xl border text-left transition-all duration-150 flex flex-col justify-between gap-3 active:scale-[0.98] cursor-pointer ${
                  activeFilter === 'at_risk'
                    ? 'border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/30 dark:bg-amber-500/15 shadow-md'
                    : 'border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/40 hover:border-neutral-300 dark:hover:border-neutral-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                    🟡
                  </div>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                    {atRiskCount}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-bold text-neutral-900 dark:text-white">
                    {t('panic.filter_at_risk', 'Memoria en Riesgo')}
                  </p>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-tight mt-0.5">
                    {t('panic.filter_at_risk_desc', 'Tarjetas vencidas hoy o en reaprendizaje')}
                  </p>
                </div>
              </button>

              {/* Opción 3: Todo el Mazo */}
              <button
                type="button"
                onClick={() => setActiveFilter('all')}
                className={`p-4 rounded-2xl border text-left transition-all duration-150 flex flex-col justify-between gap-3 active:scale-[0.98] cursor-pointer ${
                  activeFilter === 'all'
                    ? 'border-indigo-500 bg-indigo-500/10 ring-2 ring-indigo-500/30 dark:bg-indigo-500/15 shadow-md'
                    : 'border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/40 hover:border-neutral-300 dark:hover:border-neutral-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
                    ⚪
                  </div>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
                    {totalCount}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-bold text-neutral-900 dark:text-white">
                    {t('panic.filter_all', 'Todo el Mazo')}
                  </p>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-tight mt-0.5">
                    {t('panic.filter_all_desc', 'Todas las tarjetas en orden aleatorio')}
                  </p>
                </div>
              </button>
            </div>

            {/* Opción 4 Opcional: Fallos del Examen si viene de un simulacro */}
            {examErrorsCount > 0 && (
              <button
                type="button"
                onClick={() => setActiveFilter('exam_errors')}
                className={`w-full p-4 rounded-2xl border text-left transition-all duration-150 flex items-center justify-between gap-3 active:scale-[0.99] cursor-pointer ${
                  activeFilter === 'exam_errors'
                    ? 'border-purple-500 bg-purple-500/15 ring-2 ring-purple-500/30 dark:bg-purple-500/20 shadow-md'
                    : 'border-neutral-200 dark:border-neutral-800 bg-purple-50/50 dark:bg-purple-950/20 hover:border-purple-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold shrink-0">
                    🎯
                  </div>
                  <div>
                    <p className="text-sm font-bold text-neutral-900 dark:text-white">
                      {t('panic.filter_exam_errors', 'Fallos del Último Simulacro')}
                    </p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      {t('panic.filter_exam_errors_desc', 'Tarjetas específicas falladas en el examen reciente')}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-700 dark:text-purple-300">
                  {examErrorsCount} {t('panic.cards_label', 'tarjetas')}
                </span>
              </button>
            )}

            {/* Mensajes Informativos cuando el filtro seleccionado tiene 0 tarjetas */}
            {activeFilter === 'weak_points' && weakCount === 0 && (
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-3 text-xs text-emerald-800 dark:text-emerald-300 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>
                  {t(
                    'panic.empty_weak_points_notice',
                    '¡Enhorabuena! No tienes puntos débiles registrados en este mazo.'
                  )}
                </span>
              </div>
            )}

            {activeFilter === 'at_risk' && atRiskCount === 0 && (
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-3 text-xs text-emerald-800 dark:text-emerald-300 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>
                  {t(
                    'panic.empty_at_risk_notice',
                    'Tu memoria está al día para este mazo: no hay tarjetas vencidas ni en reaprendizaje.'
                  )}
                </span>
              </div>
            )}

            {activeFilter === 'exam_errors' && examErrorsCount === 0 && (
              <div className="p-3.5 rounded-2xl bg-neutral-100 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 flex items-center gap-3 text-xs text-neutral-600 dark:text-neutral-400 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-neutral-400 shrink-0" />
                <span>
                  {t(
                    'panic.empty_exam_errors_notice',
                    'No hay tarjetas falladas del último simulacro para este mazo.'
                  )}
                </span>
              </div>
            )}

            {activeFilter === 'all' && totalCount === 0 && (
              <div className="p-3.5 rounded-2xl bg-neutral-100 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 flex items-center gap-3 text-xs text-neutral-600 dark:text-neutral-400 animate-in fade-in">
                <HelpCircle className="w-4 h-4 text-neutral-400 shrink-0" />
                <span>
                  {t('panic.empty_deck_notice', 'Este mazo aún no contiene tarjetas creadas.')}
                </span>
              </div>
            )}
          </div>

          {/* Action CTA */}
          <div className="pt-2">
            <button
              type="button"
              disabled={isLoading || activeCount === 0}
              onClick={() => handleStartSession(activeFilter)}
              className={`w-full py-4 px-6 rounded-2xl font-extrabold text-sm sm:text-base tracking-wide transition shadow-lg flex items-center justify-center gap-2 ${
                activeCount > 0
                  ? 'bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-white shadow-amber-500/25 active:scale-[0.99] cursor-pointer'
                  : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500 cursor-not-allowed opacity-60 shadow-none'
              }`}
            >
              <Zap className={`w-5 h-5 ${activeCount > 0 ? 'fill-current' : 'text-neutral-400 dark:text-neutral-500'}`} />
              <span>
                {activeCount > 0
                  ? t('panic.start_cta', 'Iniciar Repaso Rápido ⚡')
                  : t('panic.start_cta_disabled', 'Sin tarjetas para repasar')}
              </span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. ESTADO: FINALIZACIÓN CON ÉXITO (COLA VACIADA)
  if (isFinished) {
    return (
      <div className="w-full min-h-screen overflow-y-auto p-4 sm:p-6 md:p-8 flex items-center justify-center">
        <div className="w-full max-w-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-center space-y-6 animate-in zoom-in-95 duration-200">
          <div className="w-16 h-16 rounded-3xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/30">
            <Sparkles className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-extrabold text-neutral-900 dark:text-white">
              {t('panic.finished_title', '¡Repaso de Emergencia Completado!')}
            </h2>
            <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400">
              {t(
                'panic.finished_desc',
                'Has superado con éxito todas las tarjetas de la cola. Tu memoria para estos conceptos clave está al máximo para tu prueba.'
              )}
            </p>
          </div>

          {/* Metrics Card */}
          <div className="grid grid-cols-2 gap-3 p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-800">
            <div>
              <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider font-mono">
                {t('panic.cards_mastered', 'Dominadas')}
              </p>
              <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {completedCount}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider font-mono">
                {t('panic.recycled_count', 'Reintentos')}
              </p>
              <p className="text-2xl font-black text-amber-600 dark:text-amber-400">
                {failedCount}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={() => handleStartSession(activeFilter)}
              className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-bold text-xs sm:text-sm transition shadow-md shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer active:scale-95"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{t('panic.retry_session', 'Repetir Sesión')}</span>
            </button>

            <Link
              href={`/decks/${deckId}`}
              onClick={() => resetSession()}
              className="w-full py-2.5 px-4 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white hover:bg-neutral-100 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 font-semibold text-xs sm:text-sm transition flex items-center justify-center gap-2 cursor-pointer active:scale-95"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{t('panic.back_to_deck', 'Volver al Mazo')}</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 3. ESTADO: SESIÓN ACTIVA DE REPASO RÁPIDO
  return (
    <div className="w-full max-w-4xl mx-auto min-h-screen md:min-h-0 md:h-full flex flex-col justify-between p-3 sm:p-5 md:p-6 pb-24 sm:pb-8 overflow-y-auto md:overflow-hidden animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="shrink-0 pb-3 border-b border-neutral-200 dark:border-neutral-800 space-y-2">
        <div className="flex items-center justify-between gap-2">
          {/* Breadcrumb & Exit */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => resetSession()}
              className="text-xs font-semibold text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition flex items-center gap-1 shrink-0 cursor-pointer"
              title={t('panic.exit_tooltip', 'Salir del repaso')}
            >
              <X className="w-4 h-4" />
              <span className="hidden sm:inline">{t('common.exit', 'Salir')}</span>
            </button>
            <span className="text-neutral-300 dark:text-neutral-700 hidden sm:inline">•</span>
            <p className="text-xs sm:text-sm font-bold text-neutral-900 dark:text-white truncate max-w-[140px] sm:max-w-xs">
              {currentDeck?.title}
            </p>
          </div>

          {/* Status Badge: Remaining and Mastered */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold font-mono bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>
                {t('panic.remaining_label', { count: queue.length }, `Quedan ${queue.length}`)}
              </span>
            </span>

            <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
              <Check className="w-3.5 h-3.5 text-emerald-500" />
              <span>{completedCount}</span>
            </span>
          </div>
        </div>

        {/* Progress Bar (Remaining Queue vs Initial) */}
        <div className="w-full bg-neutral-200 dark:bg-neutral-800 h-1.5 rounded-full overflow-hidden">
          <div
            className="bg-gradient-to-r from-amber-500 to-rose-500 h-full transition-all duration-300"
            style={{
              width: `${
                initialCount > 0
                  ? Math.min(100, Math.round((completedCount / initialCount) * 100))
                  : 0
              }%`,
            }}
          />
        </div>
      </div>

      {/* Main Flashcard Card Container */}
      <div className="flex-1 min-h-0 flex flex-col justify-center py-3 sm:py-5">
        {currentCard && (
          <div
            onClick={() => !isAnswerRevealed && setIsAnswerRevealed(true)}
            className={`w-full max-w-2xl mx-auto rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/70 backdrop-blur-xl p-5 sm:p-7 shadow-xl flex flex-col justify-between transition-all duration-200 min-h-[340px] sm:min-h-[400px] ${
              !isAnswerRevealed ? 'cursor-pointer hover:border-amber-400/50' : ''
            }`}
          >
            {/* Flashcard Content */}
            <div className="flex-1 min-h-0 overflow-y-auto pr-1">
              <FormattedCardView
                cardId={currentCard.id}
                front={currentCard.front}
                back={currentCard.back}
                notes={currentCard.notes}
                noteImageUrl={currentCard.note_image_url}
                cardFormat={
                  currentCard.cardFormat ||
                  currentCard.card_format ||
                  (currentCard.card_type === 'cloze' ? 'cloze' : 'basic')
                }
                isRevealed={isAnswerRevealed}
                interactive={true}
              />
            </div>

            {/* Tap to flip hint */}
            {!isAnswerRevealed && (
              <div className="pt-3 text-center border-t border-neutral-100 dark:border-neutral-800/60 mt-3">
                <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1.5">
                  <span>💡</span>
                  <span>{t('panic.tap_to_flip', 'Toca la tarjeta o pulsa Espacio para ver la solución')}</span>
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Sticky Action Bar */}
      <div className="shrink-0 pt-2 pb-1 max-w-2xl mx-auto w-full">
        {!isAnswerRevealed ? (
          <button
            type="button"
            onClick={() => setIsAnswerRevealed(true)}
            className="w-full py-4 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm sm:text-base tracking-wide transition shadow-lg shadow-indigo-600/25 active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2"
          >
            <span>{t('panic.show_answer', 'Mostrar Respuesta')}</span>
            <span className="hidden sm:inline text-xs font-mono opacity-70">
              ({t('study.space_key', 'Espacio')})
            </span>
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 animate-in fade-in duration-150">
            {/* Botón Fallé (vuelve al final de la cola) */}
            <button
              type="button"
              onClick={handleFailed}
              className="py-3.5 sm:py-4 px-4 sm:px-6 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs sm:text-sm tracking-wide transition shadow-lg shadow-rose-600/25 active:scale-95 cursor-pointer flex items-center justify-center gap-2"
            >
              <XCircle className="w-5 h-5 shrink-0" />
              <div className="text-left">
                <span className="block">{t('panic.failed_btn', 'Fallé ❌')}</span>
                <span className="hidden sm:block text-[10px] font-normal opacity-80 leading-none">
                  {t('panic.failed_sub', 'Repetir al final')}
                </span>
              </div>
            </button>

            {/* Botón Lo Sabía (se retira de la cola) */}
            <button
              type="button"
              onClick={handleKnown}
              className="py-3.5 sm:py-4 px-4 sm:px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm tracking-wide transition shadow-lg shadow-emerald-600/25 active:scale-95 cursor-pointer flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <div className="text-left">
                <span className="block">{t('panic.known_btn', 'Lo sabía ✅')}</span>
                <span className="hidden sm:block text-[10px] font-normal opacity-80 leading-none">
                  {t('panic.known_sub', 'Retirar de cola')}
                </span>
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
