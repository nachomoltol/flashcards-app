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
  Smartphone,
  PlayCircle,
  Tv,
} from 'lucide-react';
import { useProModalStore } from '@/stores/useProModalStore';
import { useAuthStore, useLanguageStore } from '@/stores';
import { redeemPromoCodeAction } from '@/app/actions/redeemPromoCode';
import { claimAdRewardAction } from '@/app/actions/claimAdReward';
import { usePlatform } from '@/lib/platform';
import { showAdMobRewardedAd } from '@/lib/admob';

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
  const platform = usePlatform();

  const isOpen = propIsOpen !== undefined ? propIsOpen : store.isOpen;
  const isLimitReached =
    propIsLimitReached !== undefined ? propIsLimitReached : store.isLimitReached;

  // Estado del embudo de ventas: Plan Mensual único (3,50€/mes)
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [stripeNotice, setStripeNotice] = useState<string | null>(null);

  // Estado para visualización de anuncios bonificados de Google AdMob (Android)
  const [isWatchingAd, setIsWatchingAd] = useState(false);
  const [adRewardNotice, setAdRewardNotice] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

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

  const handleSubscribe = async () => {
    setIsSubscribing(true);
    setStripeNotice(null);

    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          plan: 'monthly',
          userId: user?.id,
          email: user?.email,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.url) {
        setStripeNotice(
          data.error ||
            t(
              'pro_modal.gateway_error',
              'No se pudo conectar con la pasarela de Stripe. Verifica la configuración.'
            )
        );
        setIsSubscribing(false);
        return;
      }

      // Redirigir a la pasarela de pago segura de Stripe
      window.location.href = data.url;
    } catch (err: unknown) {
      console.error('Error al iniciar suscripción con Stripe:', err);
      setStripeNotice(
        t(
          'pro_modal.gateway_error',
          'Error al conectar con la pasarela de pago segura de Stripe.'
        )
      );
      setIsSubscribing(false);
    }
  };

  // Flujo Android: Visualización de anuncio bonificado de AdMob (+1 crédito)
  const handleWatchAd = async () => {
    setIsWatchingAd(true);
    setAdRewardNotice(null);

    try {
      const result = await showAdMobRewardedAd();

      if (result.completed) {
        // Acreditar +1 crédito atómicamente en Supabase
        const claim = await claimAdRewardAction(user?.id);

        if (claim.success) {
          setAdRewardNotice({
            type: 'success',
            message:
              claim.message ||
              t(
                'pro_modal.admob_reward_success',
                '¡+1 Crédito añadido con éxito! Ya puedes generar tu mazo.'
              ),
          });

          // Cerrar modal automáticamente tras breve confirmación
          setTimeout(() => {
            handleClose();
          }, 1600);
        } else {
          setAdRewardNotice({
            type: 'error',
            message: claim.message || 'Error al acreditar la bonificación en tu cuenta.',
          });
        }
      } else {
        setAdRewardNotice({
          type: 'error',
          message:
            result.error ||
            'No se completó la reproducción del anuncio requerida para la recompensa.',
        });
      }
    } catch (err) {
      console.error('Error al mostrar anuncio bonificado de AdMob:', err);
      setAdRewardNotice({
        type: 'error',
        message: 'Ocurrió un error al cargar el anuncio bonificado.',
      });
    } finally {
      setIsWatchingAd(false);
    }
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

      {/* Contenedor del Modal */}
      <div className="relative w-full max-w-xl max-h-[92vh] overflow-y-auto bg-white dark:bg-neutral-900/95 border border-purple-500/30 rounded-3xl shadow-2xl shadow-purple-950/20 dark:shadow-purple-950/50 p-5 sm:p-7 text-neutral-900 dark:text-neutral-100 flex flex-col justify-between scrollbar-thin scrollbar-thumb-neutral-300 dark:scrollbar-thumb-neutral-800 scrollbar-track-transparent animate-in zoom-in-95 duration-200">
        {/* Glow de fondo morado/violeta */}
        <div
          className="absolute -top-24 -left-24 w-64 h-64 bg-purple-600/15 dark:bg-purple-600/20 rounded-full blur-3xl pointer-events-none"
          aria-hidden="true"
        />
        <div
          className="absolute -bottom-24 -right-24 w-64 h-64 bg-violet-600/15 dark:bg-violet-600/20 rounded-full blur-3xl pointer-events-none"
          aria-hidden="true"
        />

        {/* Botón de Cierre */}
        <button
          type="button"
          onClick={handleClose}
          aria-label="Cerrar modal de suscripción"
          className="absolute top-4 right-4 sm:top-5 sm:right-5 p-2 rounded-xl text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white bg-neutral-100 dark:bg-neutral-800/50 hover:bg-neutral-200 dark:hover:bg-neutral-800 border border-neutral-200 dark:border-neutral-700/50 transition cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center z-10"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Contenido Principal */}
        <div className="space-y-6">
          {/* Alerta de Cuota Agotada (10 generaciones mensuales) */}
          {isLimitReached && (
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs sm:text-sm flex items-start gap-3 animate-in fade-in">
              <AlertTriangle className="w-5 h-5 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-amber-950 dark:text-white">
                  {t(
                    'pro_modal.limit_reached_title',
                    'Has agotado tu cuota de 10 generaciones mensuales'
                  )}
                </p>
                <p className="text-amber-800 dark:text-amber-200/90 text-xs leading-relaxed">
                  {t(
                    'pro_modal.limit_reached_desc',
                    'Has completado las 10 generaciones gratuitas de este mes. Elige una alternativa para continuar:'
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Header con Badges */}
          <div className="space-y-2.5 pt-1 text-center sm:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-100/80 dark:bg-gradient-to-r dark:from-purple-500/20 dark:via-violet-500/15 dark:to-purple-500/10 border border-purple-200 dark:border-purple-500/40 text-purple-700 dark:text-purple-300 text-xs font-semibold tracking-wide shadow-sm shadow-purple-500/10 dark:shadow-purple-500/20">
              <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 animate-pulse" />
              <span>{t('pro_modal.badge', 'FLASHCARDS PRO')}</span>
              <span className="px-1.5 py-0.2 rounded-md bg-purple-200/80 dark:bg-purple-500/30 text-[10px] text-purple-800 dark:text-purple-200 font-mono">
                {platform.isNativeAndroid ? 'ANDROID APP' : 'WEB & DESKTOP'}
              </span>
            </div>

            <h2
              id="pro-modal-title"
              className="text-xl sm:text-2xl font-extrabold tracking-tight text-neutral-900 dark:text-white leading-tight"
            >
              {t('pro_modal.title', 'Desbloquea el poder sin límites')}{' '}
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-purple-600 via-indigo-600 to-violet-600 dark:from-purple-400 dark:via-violet-300 dark:to-indigo-300">
                — Gemini Flash & FSRS-5
              </span>
            </h2>

            <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed max-w-lg">
              {t(
                'pro_modal.subtitle',
                'Impulsa tu memoria y aprueba tus exámenes con inteligencia artificial ilimitada y FSRS.'
              )}
            </p>
          </div>

          {/* =========================================================================
              BIFURCACIÓN DE ENTORNOS: ANDROID NATIVO vs. WEB / PC
              ========================================================================= */}
          {platform.isNativeAndroid && isLimitReached ? (
            /* =======================================================
               FLUJO 1: ANDROID NATIVO (ADMOB REWARDED VIDEO + PLAN PRO)
               ======================================================= */
            <div className="space-y-3 animate-in fade-in">
              {/* Opción Destacada AdMob: Ver vídeo bonificado */}
              <div className="relative p-4 rounded-2xl bg-gradient-to-b from-amber-50/80 to-white dark:from-amber-950/30 dark:to-neutral-900 border border-amber-200 dark:border-amber-500/40 shadow-lg shadow-amber-500/5 dark:shadow-amber-950/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300">
                      <Tv className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-bold text-amber-800 dark:text-amber-200 uppercase tracking-wider">
                      Google AdMob • Recompensa Inmediata
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-300 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-300 font-bold text-[10px]">
                    +1 CRÉDITO GRATIS
                  </span>
                </div>

                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                    {t(
                      'pro_modal.admob_reward_title',
                      'Obtén +1 Generación Gratis con AdMob'
                    )}
                  </h3>
                  <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
                    {t(
                      'pro_modal.admob_reward_desc',
                      'Mira un vídeo corto patrocinado para recibir +1 crédito de generación inmediatamente.'
                    )}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleWatchAd}
                  disabled={isWatchingAd}
                  className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-neutral-950 font-bold text-xs sm:text-sm shadow-md shadow-amber-600/30 active:scale-[0.99] transition cursor-pointer disabled:opacity-60"
                >
                  {isWatchingAd ? (
                    <>
                      <div className="w-4 h-4 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin" />
                      <span>{t('pro_modal.admob_watching', 'Reproduciendo anuncio...')}</span>
                    </>
                  ) : (
                    <>
                      <PlayCircle className="w-4 h-4 fill-neutral-950 text-amber-400" />
                      <span>
                        {t('pro_modal.admob_watch_btn', 'Ver Anuncio (+1 Crédito)')}
                      </span>
                    </>
                  )}
                </button>

                {adRewardNotice && (
                  <div
                    className={`p-2.5 rounded-xl text-xs flex items-center gap-2 animate-in fade-in ${
                      adRewardNotice.type === 'success'
                        ? 'bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
                        : 'bg-red-50 dark:bg-red-500/15 border border-red-200 dark:border-red-500/30 text-red-800 dark:text-red-200'
                    }`}
                  >
                    {adRewardNotice.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                    )}
                    <span className="font-medium">{adRewardNotice.message}</span>
                  </div>
                )}
              </div>

              {/* Opción Secundaria en Android: Suscripción Mensual Sin Anuncios (3,50€/mes) */}
              <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-950/70 border border-neutral-200 dark:border-neutral-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                    <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                      ¿Prefieres no ver anuncios?
                    </span>
                  </div>
                  <span className="text-xs font-extrabold text-neutral-900 dark:text-white">3,50€/mes</span>
                </div>
                <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
                  Desbloquea generaciones ilimitadas con Gemini Flash sin esperas ni pausas publicitarias.
                </p>
                <button
                  type="button"
                  onClick={handleSubscribe}
                  disabled={isSubscribing}
                  className="w-full py-2.5 px-4 rounded-xl bg-purple-100 hover:bg-purple-200 dark:bg-purple-600/30 dark:hover:bg-purple-600/50 border border-purple-300 dark:border-purple-500/40 text-purple-800 dark:text-purple-200 hover:text-purple-950 dark:hover:text-white text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>
                    {isSubscribing
                      ? t('pro_modal.connecting_gateway', 'Conectando con pasarela segura...')
                      : 'Activar Plan PRO Ilimitado — 3,50€/mes'}
                  </span>
                </button>
              </div>
            </div>
          ) : (
            /* =======================================================
               FLUJO 2: WEB / PC (2 ALTERNATIVAS CLARAS: STRIPE 3,50€ vs APP ANDROID)
               ======================================================= */
            <div className="space-y-3.5">
              {/* Tarjeta Plan Mensual Ilimitado (3,50€/mes) */}
              <div className="relative p-5 rounded-2xl bg-gradient-to-b from-purple-50/70 via-white to-purple-50/30 dark:from-purple-900/40 dark:to-neutral-900 border-2 border-purple-500 shadow-xl shadow-purple-500/10 dark:shadow-purple-950/40 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-500/30 border border-purple-300 dark:border-purple-400/50 text-purple-800 dark:text-purple-200 text-[10px] font-bold uppercase tracking-wider">
                      <Sparkles className="w-3 h-3 text-purple-600 dark:text-purple-300" />
                      ACCESO TOTAL ILIMITADO
                    </div>
                    <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                      {t('pro_modal.plan_monthly_title', 'Plan Mensual Ilimitado')}
                    </h3>
                    <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-snug">
                      {t(
                        'pro_modal.plan_monthly_desc',
                        'Generaciones con IA ilimitadas. Sin anuncios, máxima velocidad y cancelación flexible en cualquier momento.'
                      )}
                    </p>
                  </div>

                  <div className="text-right pl-3 shrink-0">
                    <div className="flex items-baseline justify-end gap-0.5">
                      <span className="text-3xl font-black text-neutral-900 dark:text-white tracking-tight">3,50€</span>
                      <span className="text-xs font-semibold text-purple-600 dark:text-purple-300">/mes</span>
                    </div>
                    <span className="text-[10px] text-neutral-500 dark:text-neutral-400 block mt-0.5">Sin permanencia</span>
                  </div>
                </div>

                {/* BOTÓN DE CHECKOUT DIRECTO STRIPE */}
                <button
                  type="button"
                  onClick={handleSubscribe}
                  disabled={isSubscribing}
                  className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-violet-600 hover:from-purple-500 hover:via-indigo-500 hover:to-violet-500 text-white font-bold text-sm shadow-xl shadow-purple-700/30 active:scale-[0.99] transition cursor-pointer disabled:opacity-70 group"
                >
                  {isSubscribing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                      <span>{t('pro_modal.connecting_gateway', 'Conectando con pasarela segura...')}</span>
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4 group-hover:scale-110 transition-transform" />
                      <span>{t('pro_modal.cta_subscribe', 'Suscribirse ahora')} — 3,50€/mes</span>
                      <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </>
                  )}
                </button>

                {stripeNotice && (
                  <div className="p-2.5 rounded-xl bg-purple-100 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-500/30 text-purple-800 dark:text-purple-200 text-xs text-center animate-in fade-in">
                    <p>{stripeNotice}</p>
                  </div>
                )}

                <div className="flex items-center justify-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                  <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>{t('pro_modal.stripe_notice', 'Transacción 100% segura y encriptada procesada por Stripe')}</span>
                </div>
              </div>

              {/* Si es Web/PC y se agotó la cuota, mostrar Alternativa 2 (App Android) */}
              {isLimitReached && (
                <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-950/80 border border-neutral-200 dark:border-neutral-800 space-y-2.5 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                        <Smartphone className="w-4 h-4" />
                      </div>
                      <h4 className="text-xs font-bold text-neutral-900 dark:text-white">
                        {t(
                          'pro_modal.web_option_mobile_title',
                          'Opción 2: Generaciones Gratis en la App Android'
                        )}
                      </h4>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 font-bold text-[9px] uppercase tracking-wider">
                      {t('pro_modal.web_option_mobile_badge', '100% GRATIS')}
                    </span>
                  </div>

                  <p className="text-[11px] text-neutral-600 dark:text-neutral-300 leading-relaxed">
                    {t(
                      'pro_modal.web_option_mobile_desc',
                      '¿Prefieres no suscribirte? Abre Flashmente en tu dispositivo Android y desbloquea generaciones gratuitas viendo anuncios cortos de vídeo.'
                    )}
                  </p>

                  <div className="pt-1 flex items-center justify-between text-[11px] text-neutral-600 dark:text-neutral-400 bg-white dark:bg-neutral-900/60 p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800/80">
                    <span className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      Sincronización instantánea de tus mazos en la nube
                    </span>
                    <span className="text-neutral-500 font-mono text-[10px]">Google AdMob</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
              OPCIÓN SECUNDARIA: CANJEAR CÓDIGO PROMOCIONAL O VIP
              ========================================================================= */}
          <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-950/70 border border-neutral-200 dark:border-neutral-800/80 space-y-2.5">
            <div className="flex items-center gap-2">
              <Ticket className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <h3 className="text-xs font-semibold text-neutral-900 dark:text-white">
                {t('pro_modal.promo_title', '¿Tienes un código promocional o VIP?')}
              </h3>
            </div>
            <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
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
                  className="flex-1 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 focus:border-purple-500 rounded-xl px-3.5 py-2 text-xs text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none uppercase tracking-wider font-mono transition"
                  disabled={isRedeeming}
                />
                <button
                  type="submit"
                  disabled={isRedeeming || !promoCode.trim()}
                  className="px-4 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-white font-medium text-xs flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  {isRedeeming ? (
                    <div className="w-3.5 h-3.5 border-2 border-neutral-600 dark:border-white/80 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span>{t('pro_modal.promo_button', 'Canjear')}</span>
                  )}
                </button>
              </div>

              {redeemStatus && (
                <div
                  className={`p-2.5 rounded-xl text-xs flex items-center gap-2 animate-in fade-in ${
                    redeemStatus.type === 'success'
                      ? 'bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
                      : 'bg-red-50 dark:bg-red-500/15 border border-red-200 dark:border-red-500/30 text-red-800 dark:text-red-200'
                  }`}
                >
                  {redeemStatus.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                  )}
                  <div className="leading-snug">
                    <p className="font-semibold">{redeemStatus.message}</p>
                    {redeemStatus.tier && (
                      <p className="text-[11px] opacity-90 mt-0.5">
                        {t('pro_modal.active_tier', 'Nivel activo:')}{' '}
                        <span className="uppercase font-bold tracking-wider">
                          {redeemStatus.tier}
                        </span>{' '}
                        {t('pro_modal.unlimited_gens', '(Generaciones ilimitadas)')}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </form>
          </div>

          {/* Tarjeta de Beneficios Destacados */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-purple-700 dark:text-purple-300/80">
              {t('pro_modal.benefits_title', 'LO QUE INCLUYE EL PLAN PRO')}
            </p>

            <div className="grid grid-cols-1 gap-2">
              <div className="flex items-start gap-3 p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-950/40 border border-neutral-200 dark:border-neutral-800/80">
                <div className="p-1.5 rounded-lg bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 shrink-0 mt-0.5">
                  <Infinity className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-neutral-900 dark:text-white">
                    {t('pro_modal.benefit_1_title', 'Generación de Tarjetas Ilimitada')}
                  </h4>
                  <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
                    {t(
                      'pro_modal.benefit_1_desc',
                      'Sube documentos extensos (PDF, Word), enlaces web y vídeos de YouTube sin límites mensuales.'
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-950/40 border border-neutral-200 dark:border-neutral-800/80">
                <div className="p-1.5 rounded-lg bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 shrink-0 mt-0.5">
                  <Brain className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-neutral-900 dark:text-white">
                    {t('pro_modal.benefit_2_title', 'FSRS Avanzado y Modelos Optimizados')}
                  </h4>
                  <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
                    {t(
                      'pro_modal.benefit_2_desc',
                      'Modelos Gemini ultra-rápidos con anti-duplicados estricto y memoria cognitiva personalizada.'
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-950/40 border border-neutral-200 dark:border-neutral-800/80">
                <div className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 shrink-0 mt-0.5">
                  <Zap className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-neutral-900 dark:text-white">
                    {t('pro_modal.benefit_3_title', 'Prioridad Máxima y Procesamiento Rápido')}
                  </h4>
                  <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
                    {t(
                      'pro_modal.benefit_3_desc',
                      'Extracción y ordenación de conceptos en segundos sin tiempos de espera en servidores.'
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer / Botones de Cierre */}
        <div className="pt-5 border-t border-neutral-200 dark:border-neutral-800/80 mt-5 flex items-center justify-between">
          <span className="text-[11px] text-neutral-500">
            {t('pro_modal.cancel_anytime', 'Cancela en cualquier momento')}
          </span>
          <button
            type="button"
            onClick={handleClose}
            className="text-xs text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition cursor-pointer py-1 px-2"
          >
            {isLimitReached && !redeemStatus?.tier
              ? t('pro_modal.close_btn', 'Cerrar')
              : t('pro_modal.back_to_review', 'Volver a repasar')}
          </button>
        </div>
      </div>
    </div>
  );
}
