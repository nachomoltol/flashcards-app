'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Zap,
  Infinity,
  Brain,
  X,
  ChevronRight,
  AlertTriangle,
  Ticket,
  CheckCircle2,
  AlertCircle,
  Lock,
  CreditCard,
  Check,
} from 'lucide-react';
import { useProModalStore } from '@/stores/useProModalStore';
import { useAuthStore, useLanguageStore } from '@/stores';
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
  const { t } = useLanguageStore();

  const isOpen = propIsOpen !== undefined ? propIsOpen : store.isOpen;
  const isLimitReached =
    propIsLimitReached !== undefined ? propIsLimitReached : store.isLimitReached;

  // Estado del embudo de ventas: Selección de Plan
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('annual');
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [stripeNotice, setStripeNotice] = useState<string | null>(null);

  // Estado para el canje secundario de código promocional
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

  const handleSubscribe = () => {
    setIsSubscribing(true);
    setStripeNotice(null);
    // Simulación de redirección a checkout Stripe
    setTimeout(() => {
      setIsSubscribing(false);
      setStripeNotice(
        selectedPlan === 'annual'
          ? 'Redirigiendo a pasarela segura de Stripe para el Plan Anual (49.99€/año)... Próximamente activo.'
          : 'Redirigiendo a pasarela segura de Stripe para el Plan Mensual (4.99€/mes)... Próximamente activo.'
      );
    }, 600);
  };

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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
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

      {/* Contenedor del Modal / Embudo de Ventas */}
      <div className="relative w-full max-w-xl max-h-[92vh] overflow-y-auto bg-neutral-900/95 border border-purple-500/30 rounded-3xl shadow-2xl shadow-purple-950/50 p-5 sm:p-7 text-neutral-100 flex flex-col justify-between scrollbar-thin scrollbar-thumb-neutral-800 scrollbar-track-transparent animate-in zoom-in-95 duration-200">
        {/* Glow de fondo morado/violeta */}
        <div
          className="absolute -top-24 -left-24 w-64 h-64 bg-purple-600/20 rounded-full blur-3xl pointer-events-none"
          aria-hidden="true"
        />
        <div
          className="absolute -bottom-24 -right-24 w-64 h-64 bg-violet-600/20 rounded-full blur-3xl pointer-events-none"
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
                <p className="font-semibold text-white">{t('pro_modal.limit_reached_title', 'Has agotado tu cuota diaria gratuita')}</p>
                <p className="text-amber-200/90 text-xs leading-relaxed">
                  {t('pro_modal.limit_reached_desc', 'Has alcanzado el límite de 5 generaciones por día para cuentas gratuitas. Selecciona un plan abajo o canjea un código promocional para continuar.')}
                </p>
              </div>
            </div>
          )}

          {/* Header con Badges */}
          <div className="space-y-2.5 pt-1 text-center sm:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-purple-500/20 via-violet-500/15 to-purple-500/10 border border-purple-500/40 text-purple-300 text-xs font-semibold tracking-wide shadow-sm shadow-purple-500/20">
              <Sparkles className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
              <span>{t('pro_modal.badge', 'FLASHCARDS PRO')}</span>
              <span className="px-1.5 py-0.2 rounded-md bg-purple-500/30 text-[10px] text-purple-200 font-mono">
                PREMIUM
              </span>
            </div>

            <h2
              id="pro-modal-title"
              className="text-xl sm:text-2xl font-extrabold tracking-tight text-white leading-tight"
            >
              {t('pro_modal.title', 'Desbloquea el poder sin límites')}{' '}
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-violet-300 to-indigo-300">
                — Gemini Flash & FSRS-5
              </span>
            </h2>

            <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed max-w-lg">
              {t('pro_modal.subtitle', 'Impulsa tu memoria y aprueba tus exámenes con inteligencia artificial ilimitada y FSRS.')}
            </p>
          </div>

          {/* =========================================================================
              EMBUDO DE VENTAS: PLANES DE PRECIO SELECCIONABLES
              ========================================================================= */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Opción 1: Plan Anual (Destacado con Ahorro) */}
              <button
                type="button"
                onClick={() => setSelectedPlan('annual')}
                className={`relative p-4 rounded-2xl text-left border transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                  selectedPlan === 'annual'
                    ? 'bg-gradient-to-b from-purple-900/40 to-neutral-900 border-purple-500 shadow-lg shadow-purple-900/30 ring-2 ring-purple-500/50'
                    : 'bg-neutral-950/60 border-neutral-800 hover:border-purple-500/40'
                }`}
              >
                {/* Badge Ahorro */}
                <div className="absolute -top-2.5 right-3 px-2 py-0.5 rounded-full bg-gradient-to-r from-purple-600 to-violet-600 text-white font-bold text-[10px] shadow-sm uppercase tracking-wider">
                  {t('pro_modal.plan_annual_badge', 'Ahorra 17% • 2 meses gratis')}
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-neutral-300">
                      {t('pro_modal.plan_annual_title', 'Plan Anual')}
                    </span>
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center transition ${
                        selectedPlan === 'annual'
                          ? 'border-purple-400 bg-purple-500 text-white'
                          : 'border-neutral-700'
                      }`}
                    >
                      {selectedPlan === 'annual' && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </div>

                  <div className="flex items-baseline gap-1 pt-1">
                    <span className="text-2xl font-extrabold text-white">49.99€</span>
                    <span className="text-xs text-neutral-400">/año</span>
                  </div>
                  <p className="text-[10px] text-purple-300 font-medium">Equivale a solo ~4.16€/mes</p>
                </div>

                <p className="text-[11px] text-neutral-400 mt-2 leading-snug">
                  {t('pro_modal.plan_annual_desc', 'La opción preferida por estudiantes y opositores para todo el curso.')}
                </p>
              </button>

              {/* Opción 2: Plan Mensual */}
              <button
                type="button"
                onClick={() => setSelectedPlan('monthly')}
                className={`p-4 rounded-2xl text-left border transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                  selectedPlan === 'monthly'
                    ? 'bg-gradient-to-b from-purple-900/40 to-neutral-900 border-purple-500 shadow-lg shadow-purple-900/30 ring-2 ring-purple-500/50'
                    : 'bg-neutral-950/60 border-neutral-800 hover:border-purple-500/40'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-neutral-300">
                      {t('pro_modal.plan_monthly_title', 'Plan Mensual')}
                    </span>
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center transition ${
                        selectedPlan === 'monthly'
                          ? 'border-purple-400 bg-purple-500 text-white'
                          : 'border-neutral-700'
                      }`}
                    >
                      {selectedPlan === 'monthly' && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </div>

                  <div className="flex items-baseline gap-1 pt-1">
                    <span className="text-2xl font-extrabold text-white">4.99€</span>
                    <span className="text-xs text-neutral-400">/mes</span>
                  </div>
                </div>

                <p className="text-[11px] text-neutral-400 mt-2 leading-snug">
                  {t('pro_modal.plan_monthly_desc', 'Flexibilidad total mes a mes. Cancela cuando quieras sin compromiso.')}
                </p>
              </button>
            </div>

            {/* BOTÓN DE ACCIÓN PRINCIPAL (CTA DE SUSCRIPCIÓN) */}
            <div className="pt-1 space-y-2">
              <button
                type="button"
                onClick={handleSubscribe}
                disabled={isSubscribing}
                className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-violet-600 hover:from-purple-500 hover:via-indigo-500 hover:to-violet-500 text-white font-semibold text-sm shadow-xl shadow-purple-700/30 active:scale-[0.99] transition cursor-pointer disabled:opacity-70 group"
              >
                {isSubscribing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                    <span>Conectando con pasarela segura...</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4 group-hover:scale-110 transition-transform" />
                    <span>
                      {t('pro_modal.cta_subscribe', 'Suscribirse ahora')} —{' '}
                      {selectedPlan === 'annual' ? '49.99€/año' : '4.99€/mes'}
                    </span>
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </>
                )}
              </button>

              {stripeNotice && (
                <div className="p-2.5 rounded-xl bg-purple-950/60 border border-purple-500/30 text-purple-200 text-xs text-center animate-in fade-in">
                  <p>{stripeNotice}</p>
                </div>
              )}

              <div className="flex items-center justify-center gap-2 text-[11px] text-neutral-400 pt-0.5">
                <Lock className="w-3.5 h-3.5 text-emerald-400" />
                <span>{t('pro_modal.stripe_notice', 'Transacción 100% segura y encriptada procesada por Stripe')}</span>
              </div>
            </div>
          </div>

          {/* =========================================================================
              OPCIÓN SECUNDARIA: CANJEAR CÓDIGO PROMOCIONAL O VIP
              ========================================================================= */}
          <div className="p-4 rounded-2xl bg-neutral-950/70 border border-neutral-800/80 space-y-2.5">
            <div className="flex items-center gap-2">
              <Ticket className="w-4 h-4 text-purple-400" />
              <h3 className="text-xs font-semibold text-white">
                {t('pro_modal.promo_title', '¿Tienes un código promocional o VIP?')}
              </h3>
            </div>
            <p className="text-[11px] text-neutral-400">
              {t('pro_modal.promo_desc', 'Canjea tu bono para activar el nivel VIP con generaciones ilimitadas.')}
            </p>

            <form onSubmit={handleRedeemCode} className="space-y-2 pt-1">
              <div className="flex gap-2">
                <input
                  type="text"
                  id="promo-code-input"
                  value={promoCode}
                  onChange={(e) => {
                    setPromoCode(e.target.value.toUpperCase());
                    if (redeemStatus) setRedeemStatus(null);
                  }}
                  placeholder={t('pro_modal.promo_placeholder', 'EJ: ESTUDIANTE2026')}
                  className="flex-1 bg-neutral-900 border border-neutral-700 focus:border-purple-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none uppercase tracking-wider font-mono transition"
                  disabled={isRedeeming}
                />
                <button
                  type="submit"
                  disabled={isRedeeming || !promoCode.trim()}
                  className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  {isRedeeming ? (
                    <div className="w-3.5 h-3.5 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span>{t('pro_modal.promo_button', 'Canjear')}</span>
                  )}
                </button>
              </div>

              {redeemStatus && (
                <div
                  className={`p-2.5 rounded-xl text-xs flex items-center gap-2 animate-in fade-in ${
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
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-purple-300/80">
              {t('pro_modal.benefits_title', 'Lo que incluye el plan PRO:')}
            </p>

            <div className="grid grid-cols-1 gap-2">
              <div className="flex items-start gap-3 p-2.5 rounded-xl bg-neutral-950/40 border border-neutral-800/80">
                <div className="p-1.5 rounded-lg bg-purple-500/15 text-purple-300 shrink-0 mt-0.5">
                  <Infinity className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">
                    {t('pro_modal.benefit_1_title', 'Generación de Tarjetas Ilimitada')}
                  </h4>
                  <p className="text-[11px] text-neutral-400">
                    {t('pro_modal.benefit_1_desc', 'Sube documentos extensos (PDF, Word), enlaces web y vídeos de YouTube sin límites diarios.')}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-2.5 rounded-xl bg-neutral-950/40 border border-neutral-800/80">
                <div className="p-1.5 rounded-lg bg-violet-500/15 text-violet-300 shrink-0 mt-0.5">
                  <Brain className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">
                    {t('pro_modal.benefit_2_title', 'FSRS Avanzado y Modelos Optimizados')}
                  </h4>
                  <p className="text-[11px] text-neutral-400">
                    {t('pro_modal.benefit_2_desc', 'Modelos Gemini ultra-rápidos con anti-duplicados estricto y memoria cognitiva personalizada.')}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-2.5 rounded-xl bg-neutral-950/40 border border-neutral-800/80">
                <div className="p-1.5 rounded-lg bg-indigo-500/15 text-indigo-300 shrink-0 mt-0.5">
                  <Zap className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">
                    {t('pro_modal.benefit_3_title', 'Prioridad Máxima y Procesamiento Rápido')}
                  </h4>
                  <p className="text-[11px] text-neutral-400">
                    {t('pro_modal.benefit_3_desc', 'Extracción y ordenación de conceptos en segundos sin tiempos de espera en servidores.')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer / Botones de Cierre */}
        <div className="pt-5 border-t border-neutral-800/80 mt-5 flex items-center justify-between">
          <span className="text-[11px] text-neutral-500">Cancela en cualquier momento</span>
          <button
            type="button"
            onClick={handleClose}
            className="text-xs text-neutral-400 hover:text-white transition cursor-pointer py-1 px-2"
          >
            {isLimitReached && !redeemStatus?.tier ? 'Cerrar' : 'Volver a repasar'}
          </button>
        </div>
      </div>
    </div>
  );
}
