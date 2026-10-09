'use client';

import { use, useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useDeckStore, useCardStore, useSettingsStore, type CardRow } from '@/stores';
import {
  previewNextIntervals,
  type FSRSRating,
} from '@/lib/fsrs';
import { FormattedCardView } from '@/components/cards';

interface StudyPageProps {
  params: Promise<{ deckId: string }>;
}

// Helper para formatear intervalo relativo de próxima revisión
function formatInterval(dueIso: string): string {
  const diffMs = new Date(dueIso).getTime() - Date.now();
  if (diffMs <= 0) return '< 1m';
  const diffMinutes = Math.round(diffMs / (1000 * 60));
  if (diffMinutes < 1) return '< 1m';
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 30) return `${diffDays}d`;
  const diffMonths = Math.round(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo`;
  return `${Math.round(diffDays / 365)}y`;
}

export default function StudyPage({ params }: StudyPageProps) {
  const { deckId } = use(params);

  const { currentDeck, fetchDeckById } = useDeckStore();
  const { cards: allCards, isLoading, fetchCardsByDeck, recordReview } = useCardStore();
  const { settings, fetchSettings } = useSettingsStore();

  const [queue, setQueue] = useState<CardRow[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);
  const [sessionReviews, setSessionReviews] = useState<{ rating: FSRSRating; cardId: string }[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [reviewsTodayCount, setReviewsTodayCount] = useState<number>(0);

  // Consultar cantidad de repasos guardados hoy en este mazo desde Supabase
  const fetchTodayReviewsCount = useCallback(async () => {
    try {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const { data: deckCards } = await supabase
        .from('cards')
        .select('id')
        .eq('deck_id', deckId);

      if (deckCards && deckCards.length > 0) {
        const cardIds = deckCards.map((c) => c.id);
        const { count, error } = await supabase
          .from('reviews')
          .select('*', { count: 'exact', head: true })
          .in('card_id', cardIds)
          .gte('created_at', startOfToday.toISOString());

        if (!error && typeof count === 'number') {
          setReviewsTodayCount(count);
        }
      }
    } catch (err) {
      console.warn('Error al consultar repasos de hoy:', err);
    }
  }, [deckId]);

  // Cargar datos reales de Supabase
  useEffect(() => {
    fetchSettings();
    fetchDeckById(deckId);
    fetchTodayReviewsCount();
    fetchCardsByDeck(deckId).then((loaded) => {
      // Ordenar: primero las pendientes (due <= now()), o todas si no hay vencidas
      const now = new Date();
      const dueCards = loaded.filter((c) => new Date(c.due) <= now);
      const studyQueue = dueCards.length > 0 ? dueCards : loaded;
      setQueue(studyQueue);
      setIsInitialized(true);
    });
  }, [deckId, fetchDeckById, fetchCardsByDeck, fetchSettings, fetchTodayReviewsCount]);

  const isSessionFinished = isInitialized && (queue.length === 0 || currentIndex >= queue.length);
  const currentCard = !isSessionFinished && queue.length > 0 ? queue[currentIndex] : null;

  // Previsualización de los 4 intervalos FSRS calculados para la tarjeta activa
  const nextIntervals = useMemo(() => {
    if (!currentCard) return null;
    return previewNextIntervals(
      {
        due: currentCard.due,
        stability: currentCard.stability,
        difficulty: currentCard.difficulty,
        state: currentCard.state,
        reps: currentCard.reps,
        lapses: currentCard.lapses,
        last_review: currentCard.last_review,
      },
      undefined,
      {
        request_retention: settings.request_retention,
        maximum_interval: settings.maximum_interval,
        enable_fuzz: settings.enable_fuzz,
      }
    );
  }, [currentCard, settings]);

  // Cantidad total de tarjetas repasadas hoy en este mazo
  const cardsReviewedTodayTotal = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const cardsFromStore = allCards.filter(
      (c) => c.last_review && new Date(c.last_review) >= startOfToday
    ).length;

    const uniqueSessionCards = new Set(sessionReviews.map((r) => r.cardId)).size;
    return Math.max(reviewsTodayCount, cardsFromStore, uniqueSessionCards);
  }, [allCards, reviewsTodayCount, sessionReviews]);

  // Manejador de calificación de la tarjeta con FSRS y guardado en Supabase
  const handleRate = useCallback(
    async (rating: FSRSRating) => {
      if (!currentCard) return;

      if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      // Registrar repaso persistente en Supabase (actualiza cards e inserta en reviews)
      const result = await recordReview(currentCard, rating);

      // Registrar en el resumen de la sesión
      setSessionReviews((prev) => [...prev, { rating, cardId: currentCard.id }]);

      // Si califica Again (1), reinsertar al final de la cola para volver a repasarla
      if (result && result.isAgain) {
        setQueue((prev) => [...prev, result.updatedCard]);
      }

      // Avanzar a la siguiente tarjeta
      setIsAnswerRevealed(false);
      setCurrentIndex((prev) => prev + 1);
    },
    [currentCard, recordReview]
  );

  // Atajos de teclado: Espacio/Enter para revelar, 1-4 para calificar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable)
      ) {
        return;
      }

      // Desenfocar cualquier elemento activo para evitar interferencias de foco del navegador
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      if (!isAnswerRevealed) {
        if (e.code === 'Space' || e.key === ' ' || e.code === 'Enter') {
          e.preventDefault();
          setIsAnswerRevealed(true);
        }
      } else {
        if (e.key === '1') {
          e.preventDefault();
          handleRate(1);
        } else if (e.key === '2') {
          e.preventDefault();
          handleRate(2);
        } else if (e.key === '3') {
          e.preventDefault();
          handleRate(3);
        } else if (e.key === '4') {
          e.preventDefault();
          handleRate(4);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAnswerRevealed, handleRate]);

  // Estado de carga inicial
  if (isLoading && !isInitialized) {
    return (
      <div className="p-16 text-center text-neutral-400 text-sm">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        Cargando tarjetas del mazo desde Supabase...
      </div>
    );
  }

  // Si el mazo no tiene tarjetas en la base de datos
  if (isInitialized && allCards.length === 0) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-6 animate-in fade-in">
        <div className="w-16 h-16 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-500 mx-auto">
          <svg className="w-8 h-8 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">El mazo está vacío</h2>
          <p className="text-sm text-neutral-400 mt-1">
            No hay tarjetas registradas en este mazo en Supabase. Añade tarjetas para empezar tu sesión de estudio.
          </p>
        </div>
        <Link
          href={`/decks/${deckId}`}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition shadow-lg shadow-indigo-600/25"
        >
          Ir al editor de tarjetas
        </Link>
      </div>
    );
  }

  // Pantalla de sesión completada (Gamificación: Zero Inbox)
  if (isSessionFinished) {
    const counts = {
      again: sessionReviews.filter((r) => r.rating === 1).length,
      hard: sessionReviews.filter((r) => r.rating === 2).length,
      good: sessionReviews.filter((r) => r.rating === 3).length,
      easy: sessionReviews.filter((r) => r.rating === 4).length,
    };

    return (
      <div className="max-w-2xl mx-auto py-6 sm:py-10 px-4 text-center space-y-6 sm:space-y-7 animate-in fade-in duration-300 overflow-y-auto max-h-[100dvh]">
        {/* Animated Trophy & Emojis Header */}
        <div className="relative inline-block mx-auto">
          {/* Floating celebratory emojis */}
          <div className="absolute -top-3 -left-4 text-2xl animate-bounce duration-1000">🎉</div>
          <div className="absolute -top-4 -right-3 text-xl animate-pulse">✨</div>
          <div className="absolute -bottom-2 -left-3 text-xl animate-pulse">⚡</div>
          <div className="absolute -bottom-2 -right-4 text-2xl animate-bounce duration-700">🏆</div>

          <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-emerald-500/25 via-indigo-500/20 to-teal-500/25 border-2 border-emerald-500/40 mx-auto flex items-center justify-center text-emerald-400 shadow-2xl shadow-emerald-500/20">
            <span className="text-4xl select-none">🏆</span>
          </div>
        </div>

        {/* Motivational Zero Inbox Heading */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-sm">
            <span>🎉</span>
            <span>¡Zero Inbox Alcanzado!</span>
            <span>✨</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Has completado todas las tarjetas pendientes
          </h1>
          <p className="mt-2 text-sm text-neutral-300 max-w-lg mx-auto leading-relaxed">
            ¡Excelente trabajo! No tienes más repasos pendientes por hoy en este mazo. El algoritmo FSRS ha guardado tus nuevas fechas de retención óptima.
          </p>
        </div>

        {/* Key Summary Metric Banner: Tarjetas repasadas hoy en este mazo */}
        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-indigo-950/40 via-violet-950/30 to-emerald-950/40 border border-indigo-500/30 shadow-lg text-left flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-xl shrink-0">
              📊
            </div>
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-300 block">
                Resumen de Repaso Diario
              </span>
              <p className="text-sm sm:text-base font-bold text-white">
                Tarjetas repasadas hoy en este mazo
              </p>
              <span className="text-xs text-neutral-400">
                {sessionReviews.length} {sessionReviews.length === 1 ? 'repaso' : 'repasos'} en esta sesión
              </span>
            </div>
          </div>

          <div className="sm:text-right w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-neutral-800">
            <div className="inline-flex items-baseline gap-1.5 bg-emerald-500/10 border border-emerald-500/25 px-4 py-2 rounded-xl">
              <span className="text-2xl sm:text-3xl font-extrabold text-emerald-400 font-mono">
                {cardsReviewedTodayTotal}
              </span>
              <span className="text-xs font-semibold text-emerald-300">tarjetas</span>
            </div>
          </div>
        </div>

        {/* Resumen de calificaciones de la sesión */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-2xl bg-neutral-900/50 border border-neutral-800 text-left">
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
            <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider block">
              1. Again (Fallo)
            </span>
            <span className="text-2xl font-bold text-white mt-1 block">{counts.again}</span>
          </div>
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider block">
              2. Hard (Difícil)
            </span>
            <span className="text-2xl font-bold text-white mt-1 block">{counts.hard}</span>
          </div>
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider block">
              3. Good (Correcto)
            </span>
            <span className="text-2xl font-bold text-white mt-1 block">{counts.good}</span>
          </div>
          <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20">
            <span className="text-[11px] font-semibold text-sky-400 uppercase tracking-wider block">
              4. Easy (Fácil)
            </span>
            <span className="text-2xl font-bold text-white mt-1 block">{counts.easy}</span>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            onClick={() => {
              setQueue(allCards);
              setCurrentIndex(0);
              setIsAnswerRevealed(false);
              setSessionReviews([]);
            }}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-medium text-sm border border-neutral-700 transition"
          >
            Repasar todo de nuevo
          </button>
          <Link
            href={`/decks/${deckId}`}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 font-medium text-sm border border-neutral-800 transition"
          >
            Ver Mazo
          </Link>
          <Link
            href="/"
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition shadow-lg shadow-indigo-600/25"
          >
            Volver al Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Tarjeta actual
  const remainingCount = queue.length - currentIndex;
  const progressPercent = Math.round((currentIndex / queue.length) * 100);

  const stateLabels = ['Nueva', 'Aprendizaje', 'Repaso', 'Reaprendizaje'];
  const stateBadgeStyles = [
    'bg-blue-500/10 text-blue-400 border-blue-500/20',
    'bg-amber-500/10 text-amber-400 border-amber-500/20',
    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    'bg-rose-500/10 text-rose-400 border-rose-500/20',
  ];

  return (
    <div className="w-full max-w-3xl mx-auto h-[100dvh] md:h-full max-h-[100dvh] flex flex-col justify-between p-2.5 sm:p-4 md:p-6 overflow-hidden animate-in fade-in duration-200">
      {/* Top Header & Session Counters */}
      <div className="shrink-0 space-y-2 pb-2">
        <div className="flex items-center justify-between gap-3">
          <Link
            href={`/decks/${deckId}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-400 hover:text-white transition group py-1"
          >
            <svg
              className="w-4 h-4 transition-transform group-hover:-translate-x-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="truncate max-w-[170px] sm:max-w-none">
              {currentDeck?.title ? `Salir de ${currentDeck.title}` : 'Salir de la sesión'}
            </span>
          </Link>

          {/* Counter of Remaining Cards */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="flex items-center gap-1 text-[11px] sm:text-xs">
              <span className="text-neutral-400 hidden sm:inline">Progreso:</span>
              <span className="font-semibold text-white">
                {currentIndex + 1} / {queue.length}
              </span>
            </div>

            <span className="text-[10px] sm:text-xs px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              {remainingCount} {remainingCount === 1 ? 'restante' : 'restantes'}
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-neutral-900 rounded-full h-1 sm:h-1.5 overflow-hidden">
          <div
            className="bg-gradient-to-r from-indigo-500 to-violet-500 h-full rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Main Isolated Card Container */}
      <div className="flex-1 min-h-0 flex flex-col justify-between rounded-2xl sm:rounded-3xl border border-neutral-800 bg-neutral-900/60 backdrop-blur-xl p-3.5 sm:p-6 md:p-8 shadow-2xl overflow-hidden transition-all my-1.5 sm:my-3">
        {/* Card Header Information */}
        <div className="shrink-0 flex items-center justify-between pb-2 sm:pb-3 border-b border-neutral-800/60">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span
              className={`text-[9px] sm:text-[10px] px-2 py-0.5 rounded-md uppercase tracking-wider font-semibold border ${
                stateBadgeStyles[currentCard?.state ?? 0]
              }`}
            >
              {stateLabels[currentCard?.state ?? 0]}
            </span>
            {(() => {
              const fmt =
                currentCard?.cardFormat ||
                currentCard?.card_format ||
                (currentCard?.card_type === 'cloze' ? 'cloze' : 'basic');
              const badges: Record<string, { label: string; style: string }> = {
                basic: { label: 'Básica', style: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
                multiple_choice: { label: 'Opción Múltiple', style: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
                cloze: { label: 'Cloze [...]', style: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' },
                true_false: { label: 'V / F', style: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
              };
              const item = badges[fmt] || { label: fmt, style: 'bg-neutral-800 text-neutral-400 border-neutral-700' };
              return (
                <span className={`text-[9px] sm:text-[10px] px-2 py-0.5 rounded-md uppercase tracking-wider font-medium border ${item.style}`}>
                  {item.label}
                </span>
              );
            })()}
          </div>

          <div className="text-[10px] sm:text-[11px] text-neutral-500 font-mono">
            Reps: {currentCard?.reps ?? 0} | Lapsos: {currentCard?.lapses ?? 0} | Est.: {currentCard?.stability?.toFixed(1) ?? '0.0'}
          </div>
        </div>

        {/* Dynamic Card Content Rendered according to Format - Internal Scroll for Long Content */}
        {currentCard && (
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 py-1.5 overscroll-contain">
            <FormattedCardView
              front={currentCard.front}
              back={currentCard.back}
              cardFormat={
                currentCard.cardFormat ||
                currentCard.card_format ||
                (currentCard.card_type === 'cloze' ? 'cloze' : 'basic')
              }
              isRevealed={isAnswerRevealed}
              interactive={true}
            />
          </div>
        )}

        {!isAnswerRevealed && (
          <div className="shrink-0 text-center py-1 hidden sm:block">
            <p className="text-xs text-neutral-500">
              Pulsa <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 font-mono text-[10px]">Espacio</kbd> o el botón inferior para ver la respuesta.
            </p>
          </div>
        )}

        {/* Bottom Actions Bar */}
        <div className="shrink-0 pt-2 sm:pt-3 border-t border-neutral-800/60">
          {!isAnswerRevealed ? (
            /* Button: Mostrar respuesta */
            <button
              type="button"
              onClick={(e) => {
                (e.currentTarget as HTMLElement)?.blur();
                setIsAnswerRevealed(true);
              }}
              className="w-full py-3 sm:py-3.5 px-4 min-h-[46px] sm:min-h-[52px] rounded-xl sm:rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm sm:text-base transition-all duration-150 shadow-xl shadow-indigo-600/25 active:scale-[0.99] flex items-center justify-center gap-2 group cursor-pointer"
            >
              <span>Mostrar respuesta</span>
              <kbd className="hidden sm:inline-block px-2 py-0.5 rounded-md bg-indigo-700 text-indigo-200 text-xs font-mono font-normal">
                Espacio
              </kbd>
            </button>
          ) : (
            /* FSRS 4 Rating Buttons */
            <div className="space-y-1.5 sm:space-y-2 animate-in fade-in duration-200">
              <div className="grid grid-cols-4 gap-1.5 sm:gap-2.5">
                {/* 1 = Again (Fallo) */}
                <button
                  type="button"
                  onClick={(e) => {
                    (e.currentTarget as HTMLElement)?.blur();
                    handleRate(1);
                  }}
                  className="p-1 sm:p-2.5 min-h-[52px] sm:min-h-[70px] rounded-xl sm:rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 active:bg-rose-500/30 text-rose-300 border border-rose-500/30 hover:border-rose-500/50 transition-all duration-150 flex flex-col items-center justify-center gap-0.5 sm:gap-1.5 group active:scale-95 shadow-sm cursor-pointer"
                >
                  <span className="text-[10px] sm:text-xs font-mono font-bold px-1.5 sm:px-2 py-0 sm:py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    {nextIntervals ? formatInterval(nextIntervals[1].due) : '10m'}
                  </span>
                  <span className="font-semibold text-[11px] sm:text-xs md:text-sm text-white text-center leading-tight">
                    1. Again
                  </span>
                </button>

                {/* 2 = Hard (Difícil) */}
                <button
                  type="button"
                  onClick={(e) => {
                    (e.currentTarget as HTMLElement)?.blur();
                    handleRate(2);
                  }}
                  className="p-1 sm:p-2.5 min-h-[52px] sm:min-h-[70px] rounded-xl sm:rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 active:bg-amber-500/30 text-amber-300 border border-amber-500/30 hover:border-amber-500/50 transition-all duration-150 flex flex-col items-center justify-center gap-0.5 sm:gap-1.5 group active:scale-95 shadow-sm cursor-pointer"
                >
                  <span className="text-[10px] sm:text-xs font-mono font-bold px-1.5 sm:px-2 py-0 sm:py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {nextIntervals ? formatInterval(nextIntervals[2].due) : '3h'}
                  </span>
                  <span className="font-semibold text-[11px] sm:text-xs md:text-sm text-white text-center leading-tight">
                    2. Hard
                  </span>
                </button>

                {/* 3 = Good (Correcto) */}
                <button
                  type="button"
                  onClick={(e) => {
                    (e.currentTarget as HTMLElement)?.blur();
                    handleRate(3);
                  }}
                  className="p-1 sm:p-2.5 min-h-[52px] sm:min-h-[70px] rounded-xl sm:rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/20 active:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 hover:border-emerald-500/50 transition-all duration-150 flex flex-col items-center justify-center gap-0.5 sm:gap-1.5 group active:scale-95 shadow-sm cursor-pointer"
                >
                  <span className="text-[10px] sm:text-xs font-mono font-bold px-1.5 sm:px-2 py-0 sm:py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {nextIntervals ? formatInterval(nextIntervals[3].due) : '1d'}
                  </span>
                  <span className="font-semibold text-[11px] sm:text-xs md:text-sm text-white text-center leading-tight">
                    3. Good
                  </span>
                </button>

                {/* 4 = Easy (Fácil) */}
                <button
                  type="button"
                  onClick={(e) => {
                    (e.currentTarget as HTMLElement)?.blur();
                    handleRate(4);
                  }}
                  className="p-1 sm:p-2.5 min-h-[52px] sm:min-h-[70px] rounded-xl sm:rounded-2xl bg-sky-500/10 hover:bg-sky-500/20 active:bg-sky-500/30 text-sky-300 border border-sky-500/30 hover:border-sky-500/50 transition-all duration-150 flex flex-col items-center justify-center gap-0.5 sm:gap-1.5 group active:scale-95 shadow-sm cursor-pointer"
                >
                  <span className="text-[10px] sm:text-xs font-mono font-bold px-1.5 sm:px-2 py-0 sm:py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                    {nextIntervals ? formatInterval(nextIntervals[4].due) : '4d'}
                  </span>
                  <span className="font-semibold text-[11px] sm:text-xs md:text-sm text-white text-center leading-tight">
                    4. Easy
                  </span>
                </button>
              </div>

              <div className="hidden sm:block text-center text-[11px] text-neutral-500 pt-1">
                Presiona las teclas <kbd className="text-neutral-400 font-mono">1</kbd>, <kbd className="text-neutral-400 font-mono">2</kbd>, <kbd className="text-neutral-400 font-mono">3</kbd> o <kbd className="text-neutral-400 font-mono">4</kbd> para calificar rápidamente.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
