'use client';

import React, { use, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useAtlasStore, useLanguageStore, type AtlasBox } from '@/stores';
import {
  ArrowLeft,
  Map,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  Sparkles,
  CheckCircle2,
  HelpCircle,
} from 'lucide-react';

interface AtlasStudyPageProps {
  params: Promise<{ id: string }>;
}

export default function AtlasStudyPage({ params }: AtlasStudyPageProps) {
  const { id } = use(params);
  const { t } = useLanguageStore();
  const { currentItem, fetchAtlasItemById, isLoading } = useAtlasStore();

  // Estado local de cajas reveladas (Tap to Reveal)
  const [revealedBoxes, setRevealedBoxes] = useState<Set<string>>(new Set());

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
  const revealedCount = useMemo(() => {
    return boxesList.filter((b) => revealedBoxes.has(b.id)).length;
  }, [boxesList, revealedBoxes]);

  const isAllRevealed = totalBoxes > 0 && revealedCount === totalBoxes;
  const progressPct = totalBoxes > 0 ? Math.round((revealedCount / totalBoxes) * 100) : 0;

  // Toggle de revelado por caja
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

  // Revelar todas las cajas
  const handleRevealAll = () => {
    setRevealedBoxes(new Set(boxesList.map((b) => b.id)));
  };

  // Ocultar todas las cajas (reiniciar estudio)
  const handleHideAll = () => {
    setRevealedBoxes(new Set());
  };

  // Estado de carga inicial
  if (isLoading && !currentItem) {
    return (
      <div className="w-full flex-1 flex flex-col justify-center items-center py-20 px-4">
        <div className="flex flex-col items-center space-y-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 dark:text-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/10">
            <Loader2 className="w-7 h-7 animate-spin" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-bold text-neutral-900 dark:text-white">
              {t('atlas.loading_atlas_study', 'Cargando modo estudio para el Atlas...')}
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {t(
                'atlas.loading_atlas_study_desc',
                'Preparando el lienzo de oclusión interactiva...'
              )}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Estado si no se encuentra el Atlas
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
            {t(
              'atlas.atlas_not_found_desc',
              'El atlas que buscas no existe o fue eliminado.'
            )}
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

  return (
    <div className="w-full max-w-5xl mx-auto space-y-5 pb-12 animate-in fade-in duration-200">
      {/* Barra Superior de Controles y Cabecera */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-neutral-200 dark:border-neutral-800">
        {/* Lado Izquierdo: Botón Volver y Título */}
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

            {/* Progreso del Estudio */}
            <div className="flex items-center gap-2 pt-0.5">
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                {t('atlas.study_progress', '{revealed} de {total} reveladas')
                  .replace('{revealed}', String(revealedCount))
                  .replace('{total}', String(totalBoxes))}
              </span>
              <span className="text-neutral-300 dark:text-neutral-700">•</span>
              <span className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400">
                {progressPct}%
              </span>
              {isAllRevealed && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/25">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>100%</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Lado Derecho: Acciones Rápidas (Revelar Todo / Ocultar Todo) */}
        <div className="flex items-center gap-2.5 self-start md:self-auto">
          {/* Botón Revelar Todo */}
          <button
            type="button"
            onClick={handleRevealAll}
            disabled={totalBoxes === 0 || isAllRevealed}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/30 transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
            title={t('atlas.reveal_all', 'Revelar Todo')}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{t('atlas.reveal_all', 'Revelar Todo')}</span>
          </button>

          {/* Botón Ocultar Todo */}
          <button
            type="button"
            onClick={handleHideAll}
            disabled={totalBoxes === 0 || revealedCount === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700 border border-neutral-300 dark:border-neutral-700 transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
            title={t('atlas.hide_all', 'Ocultar Todo')}
          >
            <EyeOff className="w-3.5 h-3.5" />
            <span>{t('atlas.hide_all', 'Ocultar Todo')}</span>
          </button>
        </div>
      </div>

      {/* Barra de Progreso Visual */}
      {totalBoxes > 0 && (
        <div className="w-full bg-neutral-200 dark:bg-neutral-800 h-1.5 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}

      {/* Lienzo de Estudio Responsivo (Preservando Aspect Ratio del Creador) */}
      <div className="w-full flex flex-col justify-center items-center py-2">
        {currentItem?.image_url ? (
          <div className="relative max-w-full rounded-2xl overflow-hidden border-2 border-neutral-300 dark:border-neutral-800 bg-neutral-950 shadow-2xl select-none inline-block">
            {/* Imagen base */}
            <img
              src={currentItem.image_url}
              alt={currentItem.title || 'Atlas'}
              draggable={false}
              className="block max-h-[72vh] w-auto max-w-full object-contain pointer-events-none select-none rounded-2xl"
            />

            {/* Oclusiones Interactivas (Tap to Reveal) */}
            {boxesList.map((box) => {
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
                  title={
                    isRevealed
                      ? t('atlas.tap_to_hide', 'Toca para ocultar')
                      : t('atlas.tap_to_reveal', 'Toca para revelar')
                  }
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
            })}
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-neutral-500">
            {t('atlas.error_no_image', 'No hay imagen disponible para este Atlas.')}
          </div>
        )}
      </div>

      {/* Indicador / Ayuda de Interacción Inferior */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 text-xs text-neutral-600 dark:text-neutral-400">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>
            {t(
              'atlas.tap_to_reveal_hint',
              'Haz clic o toca cualquier recuadro para destapar la respuesta.'
            )}
          </span>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-neutral-500 dark:text-neutral-400">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-black border border-neutral-700 inline-block" />
            <span>{t('atlas.occluded', 'Oculto')}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-transparent border border-dashed border-emerald-400 inline-block" />
            <span>{t('atlas.revealed', 'Revelado')}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

