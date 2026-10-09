'use client';

import { useEffect, useCallback } from 'react';
import {
  Sparkles,
  Zap,
  Infinity,
  Brain,
  X,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';

interface ProModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProModal({ isOpen, onClose }: ProModalProps) {
  // Manejo de tecla Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pro-modal-title"
    >
      {/* Fondo oscuro para cerrar al hacer clic */}
      <div
        className="fixed inset-0 -z-10"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Contenedor del Modal */}
      <div className="relative w-full max-w-lg max-h-[92vh] overflow-y-auto bg-neutral-900/95 border border-purple-500/30 rounded-3xl shadow-2xl shadow-purple-950/40 p-5 sm:p-7 text-neutral-100 flex flex-col justify-between scrollbar-thin scrollbar-thumb-neutral-800 scrollbar-track-transparent animate-in zoom-in-95 duration-200">
        {/* Glow de fondo morado/violeta */}
        <div
          className="absolute -top-24 -left-24 w-60 h-60 bg-purple-600/20 rounded-full blur-3xl pointer-events-none"
          aria-hidden="true"
        />
        <div
          className="absolute -bottom-24 -right-24 w-60 h-60 bg-violet-600/20 rounded-full blur-3xl pointer-events-none"
          aria-hidden="true"
        />

        {/* Botón de Cierre */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar modal de suscripción"
          className="absolute top-4 right-4 sm:top-5 sm:right-5 p-2 rounded-xl text-neutral-400 hover:text-white bg-neutral-800/50 hover:bg-neutral-800 border border-neutral-700/50 transition cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center z-10"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Contenido Principal */}
        <div className="space-y-6">
          {/* Header con Badges */}
          <div className="space-y-3 pt-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-purple-500/20 via-violet-500/15 to-purple-500/10 border border-purple-500/40 text-purple-300 text-xs font-semibold tracking-wide shadow-sm shadow-purple-500/20">
              <Sparkles className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
              <span>FLASHCARDS PRO</span>
              <span className="px-1.5 py-0.2 rounded-md bg-purple-500/30 text-[10px] text-purple-200 font-mono">
                BETA
              </span>
            </div>

            <h2
              id="pro-modal-title"
              className="text-xl sm:text-2xl font-bold tracking-tight text-white leading-tight"
            >
              Desbloquea el poder sin límites{' '}
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-violet-300 to-indigo-300">
                — Próximamente
              </span>
            </h2>

            <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
              Estamos preparando la experiencia de estudio definitiva impulsada por inteligencia artificial sin restricciones.
            </p>
          </div>

          {/* Tarjeta de Beneficios Destacados */}
          <div className="space-y-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-purple-300/80">
              Lo que incluirá el plan PRO:
            </p>

            <div className="grid grid-cols-1 gap-2.5">
              {/* Beneficio 1 */}
              <div className="flex items-start gap-3 p-3 rounded-2xl bg-neutral-950/60 border border-purple-500/20 hover:border-purple-500/40 transition">
                <div className="p-2 rounded-xl bg-purple-500/15 text-purple-300 shrink-0">
                  <Infinity className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-white">Generación de Tarjetas Ilimitada</h3>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Sube documentos extensos (PDFs, Word), vídeos de YouTube y notas sin preocuparte por cuotas diarias de IA.
                  </p>
                </div>
              </div>

              {/* Beneficio 2 */}
              <div className="flex items-start gap-3 p-3 rounded-2xl bg-neutral-950/60 border border-purple-500/20 hover:border-purple-500/40 transition">
                <div className="p-2 rounded-xl bg-violet-500/15 text-violet-300 shrink-0">
                  <Brain className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-white">FSRS Avanzado y Modelos Superiores</h3>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Modelos Gemini 2.5 con mayor profundidad de análisis, anti-duplicados estricto y calibración cognitiva personalizada.
                  </p>
                </div>
              </div>

              {/* Beneficio 3 */}
              <div className="flex items-start gap-3 p-3 rounded-2xl bg-neutral-950/60 border border-purple-500/20 hover:border-purple-500/40 transition">
                <div className="p-2 rounded-xl bg-indigo-500/15 text-indigo-300 shrink-0">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-white">Prioridad Máxima y Procesamiento Rápido</h3>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Extracción de conceptos en segundos y sincronización en tiempo real sin tiempos de espera.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Nota informativa de la Fase 24 */}
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-purple-950/30 border border-purple-800/40 text-purple-200">
            <ShieldCheck className="w-5 h-5 text-purple-400 shrink-0" />
            <p className="text-[11px] leading-relaxed text-purple-200/90">
              <strong className="text-white">Acceso Anticipado:</strong> Durante esta fase actual, todos los usuarios tienen acceso completo a las funciones base. El control de cuotas y activación PRO estará disponible en la Fase 24.
            </p>
          </div>
        </div>

        {/* Footer / Botones de Acción */}
        <div className="pt-6 border-t border-neutral-800/80 mt-6 flex flex-col sm:flex-row items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-purple-500 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white font-medium text-xs sm:text-sm shadow-lg shadow-purple-600/25 active:scale-95 transition cursor-pointer"
          >
            <span>Entendido, volver a repasar</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
