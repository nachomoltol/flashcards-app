'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Zap,
  Infinity,
  Brain,
  X,
  ShieldCheck,
  ChevronRight,
  AlertTriangle,
  Ticket,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useProModalStore } from '@/stores/useProModalStore';
import { useAuthStore } from '@/stores';
import { redeemPromoCodeAction } from '@/app/actions/redeemPromoCode';

interface ProModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  isLimitReached?: boolean;
}

export function ProModal({
  isOpen: propIsOpen,
  onClose: propOnClose,
  isLimitReached: propIsLimitReached,
}: ProModalProps = {}) {
  const store = useProModalStore();
  const { user } = useAuthStore();

  const isOpen = propIsOpen !== undefined ? propIsOpen : store.isOpen;
  const isLimitReached =
    propIsLimitReached !== undefined ? propIsLimitReached : store.isLimitReached;

  // Estado para el canje de código promocional
  const [promoCode, setPromoCode] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [redeemStatus, setRedeemStatus] = useState<{
    type: 'success' | 'error';
    message: string;
    tier?: string;
  } | null>(null);

  const handleClose = useCallback(() => {
    if (propOnClose) {
      propOnClose();
    }
    store.closeProModal();
  }, [propOnClose, store]);

  // Manejo de tecla Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    },
    [handleClose]
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

  const handleRedeemCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = promoCode.trim().toUpperCase();
    if (!clean) return;

    setIsRedeeming(true);
    setRedeemStatus(null);

    try {
      const result = await redeemPromoCodeAction(clean, user?.id);
      if (result.success) {
        setRedeemStatus({
          type: 'success',
          message: result.message || '¡Código canjeado con éxito!',
          tier: result.tier,
        });
        setPromoCode('');
      } else {
        setRedeemStatus({
          type: 'error',
          message: result.message || 'Código no válido o inactivo.',
        });
      }
    } catch {
      setRedeemStatus({
        type: 'error',
        message: 'Ocurrió un error inesperado al canjear el código.',
      });
    } finally {
      setIsRedeeming(false);
    }
  };

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
        onClick={handleClose}
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
          onClick={handleClose}
          aria-label="Cerrar modal de suscripción"
          className="absolute top-4 right-4 sm:top-5 sm:right-5 p-2 rounded-xl text-neutral-400 hover:text-white bg-neutral-800/50 hover:bg-neutral-800 border border-neutral-700/50 transition cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center z-10"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Contenido Principal */}
        <div className="space-y-6">
          {/* Alerta si el usuario agotó su cuota diaria */}
          {isLimitReached && (
            <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs sm:text-sm flex items-start gap-3 animate-in fade-in">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-white">Has agotado tu cuota diaria gratuita</p>
                <p className="text-amber-200/90 text-xs leading-relaxed">
                  Has alcanzado el límite de 5 generaciones de tarjetas por día para cuentas gratuitas. Canjea un código promocional abajo o actualiza a PRO/VIP para continuar sin restricciones.
                </p>
              </div>
            </div>
          )}

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
                — Acceso Ilimitado & Bonos
              </span>
            </h2>

            <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
              La experiencia definitiva de estudio y repetición espaciada potenciada por inteligencia artificial sin restricciones.
            </p>
          </div>

          {/* SECCIÓN INTERACTIVA: CANJEAR CÓDIGO PROMOCIONAL */}
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-b from-purple-950/40 to-neutral-950/80 border border-purple-500/35 shadow-lg space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30">
                <Ticket className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-semibold text-white">
                  ¿Tienes un código promocional o VIP?
                </h3>
                <p className="text-[11px] text-neutral-400">
                  Canjea tu bono para activar el nivel VIP con generaciones ilimitadas.
                </p>
              </div>
            </div>

            <form onSubmit={handleRedeemCode} className="space-y-2.5 pt-1">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    id="promo-code-input"
                    value={promoCode}
                    onChange={(e) => {
                      setPromoCode(e.target.value.toUpperCase());
                      if (redeemStatus) setRedeemStatus(null);
                    }}
                    placeholder="EJ: NACHOVIP"
                    className="w-full bg-neutral-900/90 border border-neutral-700 focus:border-purple-500 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-neutral-500 focus:outline-none uppercase tracking-wider font-mono transition"
                    disabled={isRedeeming}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isRedeeming || !promoCode.trim()}
                  className="px-4 sm:px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 disabled:opacity-50 text-white font-medium text-xs sm:text-sm flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer disabled:cursor-not-allowed shrink-0 shadow-md shadow-purple-600/30"
                >
                  {isRedeeming ? (
                    <div className="w-4 h-4 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span>Canjear</span>
                  )}
                </button>
              </div>

              {redeemStatus && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2.5 animate-in fade-in ${
                    redeemStatus.type === 'success'
                      ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-200'
                      : 'bg-red-500/15 border border-red-500/30 text-red-200'
                  }`}
                >
                  {redeemStatus.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  )}
                  <div className="leading-snug">
                    <p className="font-semibold">{redeemStatus.message}</p>
                    {redeemStatus.tier && (
                      <p className="text-[11px] opacity-90 mt-0.5">
                        Nivel activo: <span className="uppercase font-bold tracking-wider">{redeemStatus.tier}</span> (Generaciones ilimitadas)
                      </p>
                    )}
                  </div>
                </div>
              )}
            </form>
          </div>

          {/* Tarjeta de Beneficios Destacados */}
          <div className="space-y-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-purple-300/80">
              Lo que incluye el plan PRO:
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
                    Modelos Gemini con mayor profundidad de análisis, anti-duplicados estricto y calibración cognitiva personalizada.
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

          {/* Nota informativa de cuotas */}
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-purple-950/30 border border-purple-800/40 text-purple-200">
            <ShieldCheck className="w-5 h-5 text-purple-400 shrink-0" />
            <p className="text-[11px] leading-relaxed text-purple-200/90">
              <strong className="text-white">Sistema de Cuotas:</strong> Las cuentas gratuitas cuentan con 5 generaciones diarias protegidas. Las suscripciones PRO y cuentas VIP disponen de bypass total ilimitado.
            </p>
          </div>
        </div>

        {/* Footer / Botones de Acción */}
        <div className="pt-6 border-t border-neutral-800/80 mt-6 flex flex-col sm:flex-row items-center gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="w-full sm:w-auto flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-purple-500 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white font-medium text-xs sm:text-sm shadow-lg shadow-purple-600/25 active:scale-95 transition cursor-pointer"
          >
            <span>{isLimitReached && !redeemStatus?.tier ? 'Volver al estudio' : 'Entendido, volver a repasar'}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
