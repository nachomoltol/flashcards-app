'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores';
import type { Database } from '@/types/database';

type CardItem = Database['public']['Tables']['cards']['Row'];
type ReviewItem = Database['public']['Tables']['reviews']['Row'];
type DeckItem = Database['public']['Tables']['decks']['Row'];

export default function StatsPage() {
  const { user, isLoading: authLoading } = useAuthStore();
  const [cards, setCards] = useState<CardItem[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [decks, setDecks] = useState<DeckItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) {
        setCards([]);
        setReviews([]);
        setDecks([]);
        setIsLoading(false);
        return;
      }

      // 1. Obtener los mazos del usuario actual
      const { data: userDecks, error: decksErr } = await supabase
        .from('decks')
        .select('*')
        .eq('user_id', currentUser.id);

      if (decksErr) throw decksErr;
      const loadedDecks = userDecks || [];
      setDecks(loadedDecks);

      if (loadedDecks.length === 0) {
        // Si el usuario no tiene mazos, no tiene tarjetas ni repasos
        setCards([]);
        setReviews([]);
        setIsLoading(false);
        return;
      }

      // 2. Obtener solo las tarjetas pertenecientes a los mazos del usuario
      const deckIds = loadedDecks.map((d) => d.id);
      const { data: userCards, error: cardsErr } = await supabase
        .from('cards')
        .select('*')
        .in('deck_id', deckIds);

      if (cardsErr) throw cardsErr;
      const loadedCards = userCards || [];
      setCards(loadedCards);

      if (loadedCards.length === 0) {
        setReviews([]);
        setIsLoading(false);
        return;
      }

      // 3. Obtener solo los repasos pertenecientes a las tarjetas del usuario
      const cardIds = loadedCards.map((c) => c.id);
      const { data: userReviews, error: reviewsErr } = await supabase
        .from('reviews')
        .select('*')
        .in('card_id', cardIds)
        .order('created_at', { ascending: false });

      if (reviewsErr) throw reviewsErr;
      setReviews(userReviews || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cargar las estadísticas';
      console.error('Error fetching stats:', err);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading) {
      fetchData();
    }
  }, [authLoading, user?.id, fetchData]);

  // Cálculos de métricas FSRS
  const totalCards = cards.length;
  const cardsStudied = useMemo(
    () => cards.filter((c) => (c.reps ?? 0) > 0 || c.last_review !== null).length,
    [cards]
  );

  const dueCardsCount = useMemo(() => {
    const now = new Date();
    return cards.filter((c) => new Date(c.due) <= now).length;
  }, [cards]);

  // Estados FSRS:
  // 0 = New (Nuevas)
  // 1 = Learning (En Aprendizaje)
  // 2 = Review (En Repaso / Maduras)
  // 3 = Relearning (En Reaprendizaje)
  const stateCounts = useMemo(() => {
    let newCards = 0;
    let learningCards = 0;
    let reviewCards = 0;

    cards.forEach((c) => {
      const s = c.state ?? 0;
      if (s === 0) newCards++;
      else if (s === 1 || s === 3) learningCards++;
      else if (s === 2) reviewCards++;
      else newCards++;
    });

    return {
      newCards,
      learningCards,
      reviewCards,
    };
  }, [cards]);

  // Porcentaje de retención estimado
  // En FSRS se calcula a partir de los repasos exitosos (ratings 2, 3, 4 vs rating 1 Again)
  const retentionStats = useMemo(() => {
    if (reviews.length === 0) {
      // Si no hay reviews aún, estimar basado en tarjetas sin lapsos o meta predeterminada (90%)
      return {
        retentionRate: 90.0,
        totalReviews: 0,
        successfulReviews: 0,
        failedReviews: 0,
        isEstimated: true,
      };
    }

    let success = 0;
    let fail = 0;

    reviews.forEach((r) => {
      if (r.rating === 1) fail++;
      else success++;
    });

    const total = success + fail;
    const rate = total > 0 ? (success / total) * 100 : 90.0;

    return {
      retentionRate: Number(rate.toFixed(1)),
      totalReviews: total,
      successfulReviews: success,
      failedReviews: fail,
      isEstimated: false,
    };
  }, [reviews]);

  // Desglose de calificaciones de los reviews
  const ratingDistribution = useMemo(() => {
    const counts = { again: 0, hard: 0, good: 0, easy: 0 };
    reviews.forEach((r) => {
      if (r.rating === 1) counts.again++;
      else if (r.rating === 2) counts.hard++;
      else if (r.rating === 3) counts.good++;
      else if (r.rating === 4) counts.easy++;
    });

    const total = reviews.length || 1;
    return {
      again: { count: counts.again, pct: Math.round((counts.again / total) * 100) },
      hard: { count: counts.hard, pct: Math.round((counts.hard / total) * 100) },
      good: { count: counts.good, pct: Math.round((counts.good / total) * 100) },
      easy: { count: counts.easy, pct: Math.round((counts.easy / total) * 100) },
    };
  }, [reviews]);

  // Repasos de los últimos 7 días
  const last7DaysData = useMemo(() => {
    const days: { label: string; dateStr: string; count: number }[] = [];
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const label = dayNames[d.getDay()];

      const count = reviews.filter((r) => {
        const reviewDateStr = new Date(r.created_at).toISOString().split('T')[0];
        return reviewDateStr === dateStr;
      }).length;

      days.push({ label, dateStr, count });
    }

    const maxCount = Math.max(...days.map((d) => d.count), 1);
    return { days, maxCount };
  }, [reviews]);

  // Estabilidad y dificultad media
  const averageMetrics = useMemo(() => {
    const studied = cards.filter((c) => (c.reps ?? 0) > 0);
    if (studied.length === 0) return { stability: 0, difficulty: 0, totalLapses: 0 };

    const totalStability = studied.reduce((sum, c) => sum + (c.stability ?? 0), 0);
    const totalDifficulty = studied.reduce((sum, c) => sum + (c.difficulty ?? 0), 0);
    const totalLapses = cards.reduce((sum, c) => sum + (c.lapses ?? 0), 0);

    return {
      stability: Number((totalStability / studied.length).toFixed(1)),
      difficulty: Number((totalDifficulty / studied.length).toFixed(1)),
      totalLapses,
    };
  }, [cards]);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-neutral-800/80">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <span>Panel de Estadísticas FSRS</span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono font-medium">
              Datos en Vivo
            </span>
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Análisis de retención de memoria, volumen de estudio y estados cognitivos del algoritmo FSRS.
          </p>
        </div>

        <button
          onClick={fetchData}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-300 hover:text-white text-xs font-medium transition active:scale-95 shrink-0"
        >
          <svg
            className={`w-3.5 h-3.5 text-indigo-400 ${isLoading ? 'animate-spin' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>Sincronizar Datos</span>
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={fetchData} className="underline hover:text-rose-300 font-medium ml-2">
            Reintentar
          </button>
        </div>
      )}

      {/* KPI Cards: Métricas Principales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Tarjetas Estudiadas */}
        <div className="p-5 rounded-2xl bg-neutral-900/50 border border-neutral-800/80 backdrop-blur-sm relative overflow-hidden group hover:border-neutral-700/80 transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
              Tarjetas Estudiadas
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white">{cardsStudied}</span>
            <span className="text-xs text-neutral-500">de {totalCards} tarjetas</span>
          </div>
          <div className="mt-2 text-xs text-neutral-400 flex items-center justify-between font-medium">
            <span>{totalCards > 0 ? Math.round((cardsStudied / totalCards) * 100) : 0}% de tu biblioteca</span>
            <span className="text-indigo-400 font-mono text-[11px]">{reviews.length} sesiones</span>
          </div>
          {/* Progress bar */}
          <div className="mt-2.5 h-1.5 w-full bg-neutral-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-500"
              style={{ width: `${totalCards > 0 ? Math.round((cardsStudied / totalCards) * 100) : 0}%` }}
            />
          </div>
        </div>

        {/* KPI 2: Retención Estimada */}
        <div className="p-5 rounded-2xl bg-neutral-900/50 border border-neutral-800/80 backdrop-blur-sm relative overflow-hidden group hover:border-neutral-700/80 transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
              Retención Estimada
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white">
              {retentionStats.retentionRate}%
            </span>
            <span className="text-xs text-neutral-500">
              {retentionStats.isEstimated ? 'meta' : 'observada'}
            </span>
          </div>
          <div className="mt-2 text-xs flex items-center justify-between font-medium">
            <span className={retentionStats.retentionRate >= 85 ? 'text-emerald-400' : 'text-amber-400'}>
              {retentionStats.retentionRate >= 90 ? '🌟 Excelente retención' : '👍 Nivel adecuado'}
            </span>
            <span className="text-neutral-500 text-[11px] font-mono">Meta: 90%</span>
          </div>
          <div className="mt-2.5 h-1.5 w-full bg-neutral-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, retentionStats.retentionRate)}%` }}
            />
          </div>
        </div>

        {/* KPI 3: Pendientes Hoy */}
        <div className="p-5 rounded-2xl bg-neutral-900/50 border border-neutral-800/80 backdrop-blur-sm relative overflow-hidden group hover:border-neutral-700/80 transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
              Pendientes Hoy
            </span>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              dueCardsCount > 0
                ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
            }`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white">{dueCardsCount}</span>
            <span className="text-xs text-neutral-500">listas para repasar</span>
          </div>
          <div className="mt-2 text-xs flex items-center justify-between font-medium">
            <span className={dueCardsCount > 0 ? 'text-rose-400' : 'text-emerald-400'}>
              {dueCardsCount > 0 ? `${dueCardsCount} para consolidar hoy` : 'Al día con tus repasos'}
            </span>
            <Link href="/" className="text-xs text-indigo-400 hover:text-indigo-300 transition">
              Repasar →
            </Link>
          </div>
        </div>

        {/* KPI 4: Total de Repasos Realizados */}
        <div className="p-5 rounded-2xl bg-neutral-900/50 border border-neutral-800/80 backdrop-blur-sm relative overflow-hidden group hover:border-neutral-700/80 transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
              Total de Repasos
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white">{reviews.length}</span>
            <span className="text-xs text-neutral-500">evaluaciones</span>
          </div>
          <div className="mt-2 text-xs text-neutral-400 flex items-center justify-between font-medium">
            <span>{retentionStats.successfulReviews} aciertos</span>
            <span className="text-rose-400 font-mono text-[11px]">{retentionStats.failedReviews} fallos</span>
          </div>
        </div>
      </div>

      {/* Desglose del Estado FSRS de las Tarjetas (Nuevas, En Aprendizaje, A Revisar) */}
      <div className="p-6 rounded-2xl bg-neutral-900/60 border border-neutral-800 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <span>Desglose del Estado FSRS</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 font-mono font-normal">
                {totalCards} tarjetas en {decks.length} {decks.length === 1 ? 'mazo' : 'mazos'}
              </span>
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Distribución de tus flashcards según su fase en el ciclo de repetición espaciada FSRS.
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-medium">
            <span className="flex items-center gap-1.5 text-blue-400">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              Nuevas ({stateCounts.newCards})
            </span>
            <span className="flex items-center gap-1.5 text-amber-400">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              En Aprendizaje ({stateCounts.learningCards})
            </span>
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              A Revisar / Maduras ({stateCounts.reviewCards})
            </span>
          </div>
        </div>

        {/* Stacked Distribution Bar */}
        <div className="h-4 w-full bg-neutral-800 rounded-xl overflow-hidden flex shadow-inner">
          {totalCards > 0 ? (
            <>
              <div
                title={`Nuevas: ${stateCounts.newCards} (${Math.round((stateCounts.newCards / totalCards) * 100)}%)`}
                className="bg-blue-500 h-full transition-all duration-500 hover:opacity-90"
                style={{ width: `${(stateCounts.newCards / totalCards) * 100}%` }}
              />
              <div
                title={`En Aprendizaje: ${stateCounts.learningCards} (${Math.round((stateCounts.learningCards / totalCards) * 100)}%)`}
                className="bg-amber-500 h-full transition-all duration-500 hover:opacity-90"
                style={{ width: `${(stateCounts.learningCards / totalCards) * 100}%` }}
              />
              <div
                title={`A Revisar: ${stateCounts.reviewCards} (${Math.round((stateCounts.reviewCards / totalCards) * 100)}%)`}
                className="bg-emerald-500 h-full transition-all duration-500 hover:opacity-90"
                style={{ width: `${(stateCounts.reviewCards / totalCards) * 100}%` }}
              />
            </>
          ) : (
            <div className="w-full h-full bg-neutral-800 text-neutral-500 text-[10px] flex items-center justify-center font-mono">
              Sin tarjetas registradas
            </div>
          )}
        </div>

        {/* Three FSRS Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 1. Nuevas */}
          <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                Nuevas (State 0)
              </span>
              <span className="text-xs font-mono font-bold text-white">
                {totalCards > 0 ? Math.round((stateCounts.newCards / totalCards) * 100) : 0}%
              </span>
            </div>
            <p className="text-2xl font-black text-white">{stateCounts.newCards}</p>
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              Tarjetas pendientes de su primera sesión de estudio. FSRS aún no ha calculado estabilidad ni dificultad personalizada.
            </p>
          </div>

          {/* 2. En Aprendizaje */}
          <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                En Aprendizaje (State 1/3)
              </span>
              <span className="text-xs font-mono font-bold text-white">
                {totalCards > 0 ? Math.round((stateCounts.learningCards / totalCards) * 100) : 0}%
              </span>
            </div>
            <p className="text-2xl font-black text-white">{stateCounts.learningCards}</p>
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              En proceso de fijación a corto plazo o recuperación tras un fallo (&ldquo;Again&rdquo;). Repasos en intervalos breves.
            </p>
          </div>

          {/* 3. A Revisar / Maduras */}
          <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                A Revisar (State 2)
              </span>
              <span className="text-xs font-mono font-bold text-white">
                {totalCards > 0 ? Math.round((stateCounts.reviewCards / totalCards) * 100) : 0}%
              </span>
            </div>
            <p className="text-2xl font-black text-white">{stateCounts.reviewCards}</p>
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              Consolidadas en memoria a largo plazo. Programadas en intervalos expansivos optimizados según su estabilidad.
            </p>
          </div>
        </div>
      </div>

      {/* Row: Distribución de Calificaciones & Actividad de Repasos */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Distribución de Calificaciones (FSRS Ratings 1..4) */}
        <div className="lg:col-span-6 p-6 rounded-2xl bg-neutral-900/60 border border-neutral-800 space-y-5">
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">
              Distribución de Calificaciones FSRS
            </h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              Respuestas otorgadas en el botón de calificación durante tus sesiones de estudio.
            </p>
          </div>

          <div className="space-y-3.5">
            {/* Again */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-rose-400 flex items-center gap-1.5">
                  <span>1. Again (Fallo / Olvido)</span>
                </span>
                <span className="font-mono text-neutral-300">
                  {ratingDistribution.again.count} ({ratingDistribution.again.pct}%)
                </span>
              </div>
              <div className="h-2 w-full bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-rose-500 rounded-full transition-all duration-500"
                  style={{ width: `${ratingDistribution.again.pct}%` }}
                />
              </div>
            </div>

            {/* Hard */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-amber-400 flex items-center gap-1.5">
                  <span>2. Hard (Difícil)</span>
                </span>
                <span className="font-mono text-neutral-300">
                  {ratingDistribution.hard.count} ({ratingDistribution.hard.pct}%)
                </span>
              </div>
              <div className="h-2 w-full bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-500"
                  style={{ width: `${ratingDistribution.hard.pct}%` }}
                />
              </div>
            </div>

            {/* Good */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-indigo-400 flex items-center gap-1.5">
                  <span>3. Good (Bueno / Correcto)</span>
                </span>
                <span className="font-mono text-neutral-300">
                  {ratingDistribution.good.count} ({ratingDistribution.good.pct}%)
                </span>
              </div>
              <div className="h-2 w-full bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                  style={{ width: `${ratingDistribution.good.pct}%` }}
                />
              </div>
            </div>

            {/* Easy */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                  <span>4. Easy (Fácil)</span>
                </span>
                <span className="font-mono text-neutral-300">
                  {ratingDistribution.easy.count} ({ratingDistribution.easy.pct}%)
                </span>
              </div>
              <div className="h-2 w-full bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${ratingDistribution.easy.pct}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Actividad de Repasos de los Últimos 7 Días */}
        <div className="lg:col-span-6 p-6 rounded-2xl bg-neutral-900/60 border border-neutral-800 space-y-5">
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">
              Actividad Semanal de Repaso
            </h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              Volumen de tarjetas repasadas durante los últimos 7 días.
            </p>
          </div>

          <div className="h-44 flex items-end justify-between gap-3 pt-4 px-2">
            {last7DaysData.days.map((day, idx) => {
              const heightPct = Math.max(8, Math.round((day.count / last7DaysData.maxCount) * 100));
              const isToday = idx === 6;

              return (
                <div key={day.dateStr} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                  <span className="text-[10px] font-mono text-neutral-400 group-hover:text-white transition">
                    {day.count}
                  </span>
                  <div className="w-full max-w-[2.25rem] bg-neutral-800/80 rounded-lg overflow-hidden flex items-end h-28">
                    <div
                      className={`w-full rounded-t-lg transition-all duration-500 ${
                        isToday
                          ? 'bg-gradient-to-t from-indigo-600 to-violet-500 shadow-lg shadow-indigo-600/30'
                          : day.count > 0
                          ? 'bg-neutral-600 group-hover:bg-indigo-500'
                          : 'bg-neutral-800'
                      }`}
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                  <span className={`text-[11px] font-medium ${isToday ? 'text-indigo-400 font-bold' : 'text-neutral-400'}`}>
                    {day.label}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="pt-2 border-t border-neutral-800/60 flex items-center justify-between text-xs text-neutral-400">
            <span>Racha activa y constancia</span>
            <span className="font-mono text-indigo-400">
              {reviews.length > 0 ? `${reviews.length} repasos registrados` : 'Sin actividad aún'}
            </span>
          </div>
        </div>
      </div>

      {/* Tarjetas Informativas FSRS: Estabilidad y Dificultad */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-neutral-900/40 border border-neutral-800 space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Estabilidad Media FSRS
          </span>
          <p className="text-2xl font-black text-white">
            {averageMetrics.stability} <span className="text-xs font-normal text-neutral-400">días</span>
          </p>
          <p className="text-[11px] text-neutral-500">
            Tiempo estimado en que una tarjeta mantiene al menos el 90% de probabilidad de recuerdo.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-neutral-900/40 border border-neutral-800 space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Dificultad Media FSRS
          </span>
          <p className="text-2xl font-black text-white">
            {averageMetrics.difficulty} <span className="text-xs font-normal text-neutral-400">/ 10</span>
          </p>
          <p className="text-[11px] text-neutral-500">
            Complejidad intrínseca calculada dinámicamente según tus calificaciones individuales.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-neutral-900/40 border border-neutral-800 space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Lapsos Totales (Olvidos)
          </span>
          <p className="text-2xl font-black text-white">
            {averageMetrics.totalLapses} <span className="text-xs font-normal text-neutral-400">veces</span>
          </p>
          <p className="text-[11px] text-neutral-500">
            Frecuencia con que tarjetas consolidadas fueron olvidadas y reprogramadas con FSRS.
          </p>
        </div>
      </div>
    </div>
  );
}
