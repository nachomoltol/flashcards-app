'use client';

import React, { use, useEffect, useState, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useAtlasStore, useLanguageStore, type AtlasBox } from '@/stores';
import { scheduleReview } from '@/lib/fsrs';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  Sparkles,
  HelpCircle,
  Target,
  Check,
  X,
  RotateCcw,
  Trophy,
} from 'lucide-react';

interface AtlasStudyPageProps {
  params: Promise<{ id: string }>;
}

export default function AtlasStudyPage({ params }: AtlasStudyPageProps) {
  const { id } = use(params);
  const { t } = useLanguageStore();
  const { currentItem, fetchAtlasItemById, updateAtlasItem, isLoading } = useAtlasStore();

  // Modo de estudio: 'exam' (Examen Oclusión Clásica FSRS) | 'explore' (Exploración Libre Tap-to-Reveal)
  const [studyMode, setStudyMode] = useState<'exam' | 'explore'>('exam');

  // Carga inicial del Atlas
  useEffect(() => {
    if (id) {
      fetchAtlasItemById(id);
    }
  }, [id, fetchAtlasItemById]);

  // Lista normalizada de cajas del Atlas actual
  const boxesList: AtlasBox[] = useMemo(() => {
    if (!currentItem?.boxes) return [];
    if (Array.isArray(currentItem.boxes)) {
      return currentItem.boxes as unknown as AtlasBox[];
    }
    return [];
  }, [currentItem?.boxes]);

  const totalBoxes = boxesList.length;

  // =========================================================================
  // ESTADOS DEL MODO EXAMEN: OCLUSIÓN CLÁSICA (TIPO ANKI) CON FSRS
  // =========================================================================
  const [examQueue, setExamQueue] = useState<string[]>([]);
  const [currentTargetId, setCurrentTargetId] = useState<string | null>(null);
  const [isTargetRevealed, setIsTargetRevealed] = useState(false);
  const [hitsCount, setHitsCount] = useState(0);
  const [missesCount, setMissesCount] = useState(0);
  const [isExamCompleted, setIsExamCompleted] = useState(false);
  const [examStarted, setExamStarted] = useState(false);

  // Inicialización de la cola de repaso FSRS (cajas pendientes hoy o nuevas)
  const initializeExamQueue = useCallback((forceAll = false) => {
    if (boxesList.length === 0) return;
    const now = Date.now();

    let pending: AtlasBox[] = [];
    if (forceAll) {
      pending = [...boxesList];
    } else {
      pending = boxesList.filter((b) => {
        if (!b.due_date) return true; // Nueva (sin revisar aún)
        return new Date(b.due_date).getTime() <= now; // Vencida para hoy
      });
    }

    // Mezclar aleatoriamente las cajas para evitar memorización posicional
    const shuffledIds = pending.map((b) => b.id).sort(() => Math.random() - 0.5);

    setExamQueue(shuffledIds);
    setHitsCount(0);
    setMissesCount(0);
    setIsTargetRevealed(false);
    setExamStarted(true);

    if (shuffledIds.length > 0) {
      setCurrentTargetId(shuffledIds[0]);
      setIsExamCompleted(false);
    } else {
      setCurrentTargetId(null);
      setIsExamCompleted(true);
    }
  }, [boxesList]);

  // Sincronizar cola al cargar las cajas por primera vez
  useEffect(() => {
    if (boxesList.length > 0 && !examStarted) {
      initializeExamQueue(false);
    }
  }, [boxesList, examStarted, initializeExamQueue]);

  // Caja objetivo actual a adivinar
  const targetBox = useMemo(() => {
    if (!currentTargetId) return null;
    return boxesList.find((b) => b.id === currentTargetId) || null;
  }, [boxesList, currentTargetId]);

  // Paso B: Revelar la caja objetivo
  const handleRevealTarget = useCallback(() => {
    if (!targetBox || isTargetRevealed) return;
    setIsTargetRevealed(true);
  }, [targetBox, isTargetRevealed]);

  // Paso C & D: Calificar y guardar estado FSRS
  const handleGradeReview = useCallback(
    (rating: 1 | 3) => {
      if (!targetBox) return;

      const now = new Date();

      // 1. Calcular nuevo estado FSRS usando ts-fsrs
      const fsrsResult = scheduleReview(
        {
          due: targetBox.due_date,
          stability: targetBox.stability,
          difficulty: targetBox.difficulty,
          state: targetBox.state,
          reps: targetBox.reps,
          lapses: targetBox.lapses,
          last_review: targetBox.last_review,
        },
        rating,
        now
      );

      // 2. Construir caja actualizada con sus nuevos parámetros de memoria
      const updatedTarget: AtlasBox = {
        ...targetBox,
        due_date: fsrsResult.due,
        stability: fsrsResult.stability,
        difficulty: fsrsResult.difficulty,
        state: fsrsResult.state,
        reps: fsrsResult.reps,
        lapses: fsrsResult.lapses,
        last_review: fsrsResult.last_review,
      };

      // 3. Persistir asíncronamente en Supabase (tabla interactive_images.boxes)
      const updatedBoxes = boxesList.map((b) => (b.id === targetBox.id ? updatedTarget : b));
      updateAtlasItem(id, { boxes: updatedBoxes }).catch((err) => {
        console.warn('Error al persistir estado FSRS en Supabase:', err);
      });

      if (rating === 3) {
        // ===== BIEN (Good / Acierto) =====
        setHitsCount((prev) => prev + 1);
        const remainingQueue = examQueue.filter((boxId) => boxId !== targetBox.id);
        setExamQueue(remainingQueue);
        setIsTargetRevealed(false);

        if (remainingQueue.length > 0) {
          setCurrentTargetId(remainingQueue[0]);
        } else {
          setCurrentTargetId(null);
          setIsExamCompleted(true);
        }
      } else {
        // ===== FALLO (Again / Re-encolar) =====
        setMissesCount((prev) => prev + 1);
        // Re-encolar al final de la sesión para consolidar el recuerdo
        const otherIds = examQueue.filter((boxId) => boxId !== targetBox.id);
        const nextQueue = [...otherIds, targetBox.id];
        setExamQueue(nextQueue);
        setIsTargetRevealed(false);

        if (nextQueue.length > 0) {
          setCurrentTargetId(nextQueue[0]);
        }
      }
    },
    [targetBox, boxesList, examQueue, id, updateAtlasItem]
  );

  // Atajos de teclado ergonómicos estilo Anki (Espacio para revelar, 1 Fallo, 2/Espacio Bien)
  useEffect(() => {
    if (studyMode !== 'exam' || isExamCompleted || !targetBox) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorar si el usuario escribe en un campo de texto
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (!isTargetRevealed) {
        if (e.code === 'Space' || e.key === 'Enter') {
          e.preventDefault();
          handleRevealTarget();
        }
      } else {
        if (e.key === '1') {
          e.preventDefault();
          handleGradeReview(1); // Fallo
        } else if (e.key === '2' || e.key === '3' || e.code === 'Space' || e.key === 'Enter') {
          e.preventDefault();
          handleGradeReview(3); // Bien
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [studyMode, isExamCompleted, targetBox, isTargetRevealed, handleRevealTarget, handleGradeReview]);

  // =========================================================================
  // ESTADOS DEL MODO EXPLORACIÓN LIBRE (TAP TO REVEAL MANUAL)
  // =========================================================================
  const [revealedBoxes, setRevealedBoxes] = useState<Set<string>>(new Set());

  const revealedCount = useMemo(() => {
    return boxesList.filter((b) => revealedBoxes.has(b.id)).length;
  }, [boxesList, revealedBoxes]);

  const isAllRevealed = totalBoxes > 0 && revealedCount === totalBoxes;
  const exploreProgressPct = totalBoxes > 0 ? Math.round((revealedCount / totalBoxes) * 100) : 0;

  const handleToggleBox = (boxId: string) => {
    setRevealedBoxes((prev) => {
      const next = new Set(prev);
      if (next.has(boxId)) {
        next.delete(boxId);
      } else {
        next.add(boxId);
      }
      return next;
    });
  };

  const handleRevealAll = () => {
    setRevealedBoxes(new Set(boxesList.map((b) => b.id)));
  };

  const handleHideAll = () => {
    setRevealedBoxes(new Set());
  };

  // =========================================================================
  // PANTALLAS DE CARGA Y ESTADO VACÍO
  // =========================================================================
  if (isLoading && !currentItem) {
    return (
      <div className="w-full flex-1 flex flex-col justify-center items-center py-20 px-4">
        <div className="flex flex-col items-center space-y-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-500 dark:text-amber-400 flex items-center justify-center shadow-lg shadow-amber-500/10">
            <Loader2 className="w-7 h-7 animate-spin" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-bold text-neutral-900 dark:text-white">
              {t('atlas.loading_atlas_study', 'Cargando Atlas Visual...')}
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Preparando motor interactivo de oclusión y repetición espaciada...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!currentItem && !isLoading) {
    return (
      <div className="w-full max-w-md mx-auto py-16 px-4 text-center space-y-5">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-500 shadow-sm">
          <AlertCircle className="w-7 h-7" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
            {t('atlas.atlas_not_found', 'Atlas Visual no encontrado')}
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            El atlas que buscas no existe o fue eliminado.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-semibold hover:bg-neutral-800 dark:hover:bg-neutral-100 transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('atlas.back_to_dashboard', 'Volver al panel principal')}</span>
        </Link>
      </div>
    );
  }

  const accuracy = hitsCount + missesCount > 0 ? Math.round((hitsCount / (hitsCount + missesCount)) * 100) : 100;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-5 pb-12 animate-in fade-in duration-200">
      {/* ===================================================================== */}
      {/* BARRA SUPERIOR: NAVEGACIÓN, TÍTULO Y SELECTOR DE MODO                 */}
      {/* ===================================================================== */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 rounded-xl text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition active:scale-95 cursor-pointer"
            title={t('atlas.back_to_dashboard', 'Volver al panel principal')}
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🗺️</span>
              <h1 className="text-base sm:text-xl font-bold text-neutral-900 dark:text-white tracking-tight truncate max-w-xs sm:max-w-md">
                {currentItem?.title || t('atlas.new_visual_atlas', 'Atlas Visual')}
              </h1>
            </div>

            <div className="flex items-center gap-2 pt-0.5 text-xs text-neutral-500 dark:text-neutral-400 font-medium">
              <span>{totalBoxes} {totalBoxes === 1 ? 'parte' : 'partes'} en total</span>
              <span>•</span>
              <span className="font-mono text-amber-600 dark:text-amber-400">
                FSRS v5 Activo
              </span>
            </div>
          </div>
        </div>

        {/* Selector de Modo: Examen Oclusión vs Exploración Libre */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 self-start md:self-auto text-xs">
          <button
            type="button"
            onClick={() => setStudyMode('exam')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
              studyMode === 'exam'
                ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <Target className="w-3.5 h-3.5 text-amber-500" />
            <span>Modo Examen</span>
          </button>

          <button
            type="button"
            onClick={() => setStudyMode('explore')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
              studyMode === 'explore'
                ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <Eye className="w-3.5 h-3.5 text-emerald-500" />
            <span>Exploración</span>
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* BANNER PRINCIPAL: MODO EXAMEN (OCLUSIÓN CLÁSICA)                      */}
      {/* ===================================================================== */}
      {studyMode === 'exam' ? (
        !isExamCompleted && targetBox ? (
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950 text-white shadow-xl border border-neutral-700/60 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in duration-200">
            <div className="flex items-center gap-3.5">
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-inner ${
                  isTargetRevealed
                    ? 'bg-emerald-500/20 border border-emerald-400/30 text-emerald-300'
                    : 'bg-amber-400/20 border border-amber-400/30 text-amber-300 animate-pulse'
                }`}
              >
                {isTargetRevealed ? (
                  <Eye className="w-6 h-6 text-emerald-300" />
                ) : (
                  <HelpCircle className="w-6 h-6 text-amber-300" />
                )}
              </div>

              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-400/20 text-amber-300 font-mono border border-amber-400/30">
                    Oclusión Clásica
                  </span>
                  <span className="text-xs text-neutral-400 font-mono">
                    Restantes: {examQueue.length}
                  </span>
                </div>

                <h2 className="text-base sm:text-lg font-bold tracking-tight text-white">
                  {isTargetRevealed ? (
                    <span>¿Qué tal te fue? Califica tu recuerdo:</span>
                  ) : (
                    <span>¿Qué se esconde bajo la caja resaltada?</span>
                  )}
                </h2>
                <p className="text-xs text-neutral-400 hidden sm:block">
                  {isTargetRevealed
                    ? 'Compara mentalmente lo que recordabas con la zona revelada.'
                    : 'Piensa la respuesta y pulsa la caja resaltada (o "Mostrar respuesta") para verificar.'}
                </p>
              </div>
            </div>

            {/* Controles de Acción: Revelar o Calificar */}
            <div className="flex items-center gap-2.5 self-stretch md:self-auto justify-end">
              {!isTargetRevealed ? (
                <button
                  type="button"
                  onClick={handleRevealTarget}
                  className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold text-xs shadow-lg shadow-amber-400/20 transition active:scale-95 cursor-pointer"
                >
                  <Eye className="w-4 h-4" />
                  <span>Mostrar respuesta</span>
                  <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.5 rounded bg-amber-500/30 text-[10px] font-mono">
                    Espacio
                  </kbd>
                </button>
              ) : (
                <div className="flex items-center gap-2.5 w-full md:w-auto">
                  {/* Botón Fallo (FSRS Again / 1) */}
                  <button
                    type="button"
                    onClick={() => handleGradeReview(1)}
                    className="flex-1 md:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-600/30 transition active:scale-95 cursor-pointer"
                  >
                    <X className="w-4 h-4 stroke-[3]" />
                    <span>Fallo</span>
                    <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.5 rounded bg-white/20 text-[10px] font-mono">
                      1
                    </kbd>
                  </button>

                  {/* Botón Bien (FSRS Good / 3) */}
                  <button
                    type="button"
                    onClick={() => handleGradeReview(3)}
                    className="flex-1 md:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 transition active:scale-95 cursor-pointer"
                  >
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>Bien</span>
                    <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.5 rounded bg-white/20 text-[10px] font-mono">
                      2
                    </kbd>
                  </button>
                </div>
              )}

              {/* Contador de Aciertos y Fallos */}
              <div className="hidden lg:flex items-center gap-2 pl-3 border-l border-neutral-700 text-xs font-mono">
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30"
                  title="Aciertos en esta sesión"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{hitsCount}</span>
                </span>
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30"
                  title="Fallos re-encolados"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>{missesCount}</span>
                </span>
              </div>
            </div>
          </div>
        ) : (
          /* Pantalla de Finalización del Examen / Repaso al Día */
          <div className="p-6 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-4 text-center sm:text-left">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0 shadow-inner">
                <Trophy className="w-6 h-6 text-amber-300" />
              </div>
              <div>
                <h3 className="text-lg font-bold">
                  {hitsCount + missesCount > 0
                    ? '¡Repaso de Oclusión Completado!'
                    : '¡Estudio al Día (0 Pendientes)!'}
                </h3>
                <p className="text-xs text-emerald-100 mt-0.5">
                  {hitsCount + missesCount > 0
                    ? `Precisión del ${accuracy}% con ${hitsCount} aciertos. Los intervalos han sido recalculados por FSRS.`
                    : 'Todas las partes están afianzadas en tu memoria según el algoritmo FSRS.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => initializeExamQueue(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-emerald-950 font-semibold text-xs shadow-md hover:bg-emerald-50 transition active:scale-95 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Repasar Todo (Modo Intensivo)</span>
              </button>
            </div>
          </div>
        )
      ) : (
        /* Modo Exploración Libre: Barra de Revelado */
        <div className="p-3.5 rounded-2xl bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-neutral-800 dark:text-neutral-200">
              {revealedCount} de {totalBoxes} reveladas ({exploreProgressPct}%)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRevealAll}
              disabled={totalBoxes === 0 || isAllRevealed}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/30 transition active:scale-95 disabled:opacity-40 cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Revelar Todo</span>
            </button>
            <button
              type="button"
              onClick={handleHideAll}
              disabled={totalBoxes === 0 || revealedCount === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-300 dark:hover:bg-neutral-700 transition active:scale-95 disabled:opacity-40 cursor-pointer"
            >
              <EyeOff className="w-3.5 h-3.5" />
              <span>Ocultar Todo</span>
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* LIENZO INTERACTIVO DE OCLUSIÓN DE IMAGEN                              */}
      {/* ===================================================================== */}
      <div className="w-full flex flex-col justify-center items-center py-2">
        {currentItem?.image_url ? (
          <div className="relative max-w-full rounded-2xl overflow-hidden border-2 border-neutral-300 dark:border-neutral-700 bg-white shadow-2xl select-none inline-block">
            {/* Imagen base con fondo blanco explícito */}
            <img
              src={currentItem.image_url}
              alt={currentItem.title || 'Atlas'}
              draggable={false}
              className="block max-h-[70vh] w-auto max-w-full object-contain pointer-events-none select-none rounded-2xl bg-white"
            />

            {/* RENDERIZADO DE CAJAS SEGÚN EL MODO */}
            {studyMode === 'exam' ? (
              /* MODO EXAMEN: OCLUSIÓN CLÁSICA (TIPO ANKI) */
              boxesList.map((box) => {
                const isTarget = targetBox?.id === box.id;

                if (isTarget) {
                  if (isTargetRevealed) {
                    // Paso B: Revelada - borde discontinuo resaltado, transparente para mostrar el texto original
                    return (
                      <div
                        key={box.id}
                        style={{
                          left: `${box.x}%`,
                          top: `${box.y}%`,
                          width: `${box.width}%`,
                          height: `${box.height}%`,
                        }}
                        className="absolute rounded-md border-2 border-dashed border-amber-400 bg-amber-400/10 shadow-lg shadow-amber-500/20 z-30 transition-all duration-200 pointer-events-none ring-2 ring-amber-400/40"
                      />
                    );
                  }

                  // Paso A: Caja objetivo tapada con oclusión 100% opaca y resalte SOLO en borde y anillo
                  return (
                    <div
                      key={box.id}
                      role="button"
                      tabIndex={0}
                      onClick={handleRevealTarget}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleRevealTarget();
                        }
                      }}
                      title="Haz clic para revelar qué hay aquí (o pulsa Espacio)"
                      style={{
                        left: `${box.x}%`,
                        top: `${box.y}%`,
                        width: `${box.width}%`,
                        height: `${box.height}%`,
                      }}
                      className="absolute rounded-md cursor-pointer select-none transition-all duration-200 z-20 bg-black opacity-100 border-4 border-amber-400 ring-4 ring-amber-400 shadow-xl shadow-amber-500/20 hover:scale-[1.02] active:scale-95 flex items-center justify-center text-amber-400 font-bold text-xs"
                    >
                      <HelpCircle className="w-4 h-4 text-amber-400 drop-shadow-sm" />
                    </div>
                  );
                }

                // Cajas no objetivo: Oclusión clásica normal (fondo negro 100% opaco para no dar pistas)
                return (
                  <div
                    key={box.id}
                    style={{
                      left: `${box.x}%`,
                      top: `${box.y}%`,
                      width: `${box.width}%`,
                      height: `${box.height}%`,
                    }}
                    className="absolute rounded-md bg-black opacity-100 border border-neutral-700 shadow-md select-none pointer-events-none z-10 transition-all"
                  />
                );
              })
            ) : (
              /* MODO EXPLORACIÓN LIBRE (Tap to Reveal manual) */
              boxesList.map((box) => {
                const isRevealed = revealedBoxes.has(box.id);

                return (
                  <div
                    key={box.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleToggleBox(box.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleToggleBox(box.id);
                      }
                    }}
                    title={isRevealed ? 'Toca para ocultar' : 'Toca para revelar'}
                    style={{
                      left: `${box.x}%`,
                      top: `${box.y}%`,
                      width: `${box.width}%`,
                      height: `${box.height}%`,
                    }}
                    className={`absolute rounded-md cursor-pointer select-none transition-all duration-300 ease-in-out ${
                      isRevealed
                        ? 'bg-transparent border border-dashed border-emerald-400/50 hover:border-emerald-400 hover:bg-emerald-500/10 shadow-none'
                        : 'bg-black border border-neutral-700 shadow-md hover:border-amber-400 hover:scale-[1.01] active:scale-95'
                    }`}
                  />
                );
              })
            )}
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-neutral-500">
            {t('atlas.error_no_image', 'No hay imagen disponible para este Atlas.')}
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* GUÍA Y PIE INFORMATIVO CON ATAJOS DE TECLADO                           */}
      {/* ===================================================================== */}
      <div className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 text-xs text-neutral-600 dark:text-neutral-400 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-amber-500 shrink-0" />
          <span>
            {studyMode === 'exam'
              ? 'Intenta recordar qué oculta la caja resaltada, pulsa para revelar y califica tu respuesta.'
              : 'Haz clic o toca cualquier recuadro negro para destapar la respuesta.'}
          </span>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-neutral-500 font-mono">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
            <span>[1] Fallo (Again)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
            <span>[2 / Espacio] Bien (Good)</span>
          </span>
        </div>
      </div>
    </div>
  );
}
