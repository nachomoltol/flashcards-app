'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Zap,
  Brain,
  X,
  ChevronRight,
  AlertTriangle,
  Ticket,
  CheckCircle2,
  AlertCircle,
  Lock,
  CreditCard,
  PlayCircle,
  Tv,
  Volume2,
  Video,
  Printer,
  Download,
  Mail,
  Globe,
} from 'lucide-react';
import { useProModalStore, ProFeatureName } from '@/stores/useProModalStore';
import { useAuthStore, useLanguageStore } from '@/stores';
import { supabase } from '@/lib/supabase';
import { redeemPromoCodeAction } from '@/app/actions/redeemPromoCode';
import { claimAdRewardAction } from '@/app/actions/claimAdReward';
import { usePlatform } from '@/lib/platform';
import { showAdMobRewardedAd, preloadRewardedAd } from '@/lib/admob';

interface ProModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  isLimitReached?: boolean;
  featureName?: ProFeatureName;
}

export function ProModal({
  isOpen: propIsOpen,
  onClose: propOnClose,
  isLimitReached: propIsLimitReached,
  featureName: propFeatureName,
}: ProModalProps = {}) {
  const store = useProModalStore();
  const { user } = useAuthStore();
  const { language, t } = useLanguageStore();
  const platform = usePlatform();
  const isEn = language === 'en';

  const isOpen = propIsOpen !== undefined ? propIsOpen : store.isOpen;
  const isLimitReached =
    propIsLimitReached !== undefined ? propIsLimitReached : store.isLimitReached;
  const featureName =
    propFeatureName !== undefined ? propFeatureName : store.featureName;

  // Estado del embudo de ventas: Plan Mensual único (3,50€/mes)
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [stripeNotice, setStripeNotice] = useState<string | null>(null);

  // Estado para visualización de anuncios bonificados de Google AdMob (Android)
  const [isWatchingAd, setIsWatchingAd] = useState(false);
  const [adLoadingPhase, setAdLoadingPhase] = useState<'idle' | 'preparing' | 'claiming'>('idle');
  const [adRewardNotice, setAdRewardNotice] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Precarga proactiva en segundo plano del anuncio bonificado al abrir el modal en Android nativo
  useEffect(() => {
    if (isOpen && platform.isNativeAndroid) {
      preloadRewardedAd().catch((err) => {
        console.warn('Fallo en precarga reactiva de ProModal:', err);
      });
    }
  }, [isOpen, platform.isNativeAndroid]);

  // Estado para el canje secundario de código promocional
  const [promoCode, setPromoCode] = useState('');
  const [showPromoCode, setShowPromoCode] = useState(false);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [redeemStatus, setRedeemStatus] = useState<{
    type: 'success' | 'error';
    message: string;
    tier?: string;
  } | null>(null);

  // Estado de nivel y consumo para mensajes de límite duros (50 Free / 120 Pro)
  const [userLimits, setUserLimits] = useState<{
    tier: 'free' | 'pro' | 'vip';
    count: number;
    bonusCredits: number;
    welcomeGenerations: number;
  } | null>(null);

  useEffect(() => {
    if (isOpen && user?.id) {
      import('@/lib/supabase').then(({ supabase }) => {
        supabase
          .from('api_limits')
          .select('tier, generations_count, last_generation_date, bonus_credits, welcome_generations')
          .eq('user_id', user.id)
          .maybeSingle()
          .then(({ data }) => {
            if (data) {
              const currentMonth = new Date().toISOString().slice(0, 7);
              const lastMonth = data.last_generation_date
                ? String(data.last_generation_date).slice(0, 7)
                : null;
              const isSameMonth = lastMonth === currentMonth;

              setUserLimits({
                tier: (data.tier as 'free' | 'pro' | 'vip') || 'free',
                count: isSameMonth ? (data.generations_count || 0) : 0,
                bonusCredits: typeof data.bonus_credits === 'number' ? data.bonus_credits : 0,
                welcomeGenerations: typeof data.welcome_generations === 'number' ? data.welcome_generations : 0,
              });
            }
          });
      });
    }
  }, [isOpen, user?.id]);

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
    if (isWatchingAd) return; // Bloqueo de pulsaciones repetidas
    setIsWatchingAd(true);
    setAdLoadingPhase('preparing');
    setAdRewardNotice(null);

    try {
      const result = await showAdMobRewardedAd();

      if (result.completed) {
        setAdLoadingPhase('claiming');
        let accessToken: string | undefined;
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          accessToken = sessionData?.session?.access_token;
        } catch (sessionErr) {
          console.warn('[ProModal] No se pudo obtener el token de sesión:', sessionErr);
        }
        const claim = await claimAdRewardAction(user?.id, accessToken);

        if (claim.success) {
          setAdRewardNotice({
            type: 'success',
            message:
              claim.message ||
              t(
                'pro_modal.admob_reward_success',
                '¡+1 Generación añadida con éxito! Reanudando generación...'
              ),
          });

          // Auto-reanudación con desacoplamiento visual: persistir feedback visual 500ms antes de cerrar y reanudar
          const resumeAction = store.onRewardSuccess;
          setTimeout(() => {
            handleClose();
            setIsWatchingAd(false);
            setAdLoadingPhase('idle');
            if (typeof resumeAction === 'function') {
              setTimeout(() => {
                try {
                  resumeAction();
                } catch (resumeErr) {
                  console.error('Error al auto-reanudar la acción pendiente:', resumeErr);
                }
              }, 50);
            }
          }, 500);
        } else {
          setAdRewardNotice({
            type: 'error',
            message: claim.message || 'Error al acreditar la bonificación en tu cuenta.',
          });
          setIsWatchingAd(false);
          setAdLoadingPhase('idle');
        }
      } else {
        setAdRewardNotice({
          type: 'error',
          message:
            result.error ||
            'No se completó la reproducción del anuncio requerida para la recompensa.',
        });
        setIsWatchingAd(false);
        setAdLoadingPhase('idle');
      }
    } catch (err) {
      console.error('Error al mostrar anuncio bonificado de AdMob:', err);
      setAdRewardNotice({
        type: 'error',
        message: 'Ocurrió un error al cargar el anuncio bonificado.',
      });
      setIsWatchingAd(false);
      setAdLoadingPhase('idle');
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

  // Información contextual del encabezado según si fue disparado por una función PRO específica
  const getFeatureHeadline = () => {
    switch (featureName) {
      case 'audio':
        return {
          icon: Volume2,
          badge: isEn ? 'PRO EXCLUSIVE • AUDIO & VOICE' : 'EXCLUSIVO PRO • AUDIO Y GRABACIONES',
          title: isEn ? 'Master Any Subject from Audio' : 'Domina tus asignaturas desde audio',
          subtitle: isEn
            ? 'Convert recorded lectures, voice notes and podcasts into high-retention flashcards in seconds.'
            : 'Convierte tus clases grabadas, notas de voz y conferencias en flashcards de alta retención al instante.',
        };
      case 'video':
        return {
          icon: Video,
          badge: isEn ? 'PRO EXCLUSIVE • VIDEO PROCESSING' : 'EXCLUSIVO PRO • VÍDEO Y CLASES',
          title: isEn ? 'Master Any Topic from Video' : 'Domina cualquier tema desde vídeo',
          subtitle: isEn
            ? 'Transform recorded classes and video files (.mp4, .mov, .webm) into flashcards without manual typing.'
            : 'Transforma clases grabadas y archivos de vídeo (.mp4, .mov, .webm) en tarjetas de estudio sin perder tiempo transcribiendo a mano.',
        };
      case 'youtube':
        return {
          icon: Video,
          badge: isEn ? 'PRO EXCLUSIVE • YOUTUBE AI' : 'EXCLUSIVO PRO • VÍDEOS DE YOUTUBE',
          title: isEn ? 'Learn Faster with YouTube' : 'Aprende más rápido con YouTube',
          subtitle: isEn
            ? 'Turn lectures and educational masterclasses from YouTube into smart study cards in one click.'
            : 'Convierte clases magistrales y tutoriales de YouTube en tarjetas de estudio inteligentes con un solo clic.',
        };
      case 'print':
      case 'pdf':
        return {
          icon: Printer,
          badge: isEn ? 'PRO EXCLUSIVE • PDF EXPORT' : 'EXCLUSIVO PRO • EXPORTACIÓN A PDF',
          title: isEn ? 'Ace Your Exams Anywhere' : 'Aprueba tus exámenes en papel y digital',
          subtitle: isEn
            ? 'Generate ready-to-print compact exam sheets and official answer keys for realistic exam prep.'
            : 'Genera exámenes oficiales listos para imprimir y hojas de estudio compactas para preparar tus pruebas con éxito.',
        };
      default:
        return {
          icon: Sparkles,
          badge: isEn ? 'FLASHMENTE PRO' : 'FLASHMENTE PRO',
          title: isEn ? 'Master Any Subject' : 'Domina cualquier tema',
          subtitle: isEn
            ? 'Study smarter, memorize faster, and ace your exams with advanced AI assistance.'
            : 'Estudia de forma más inteligente, memoriza el doble de rápido y aprueba con mejores notas gracias a la IA avanzada.',
        };
    }
  };

  const featureInfo = getFeatureHeadline();
  const FeatureIcon = featureInfo.icon;

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
      <div className={`relative w-full max-w-xl max-h-[94vh] overflow-y-auto bg-white dark:bg-neutral-900/95 border border-purple-500/30 rounded-3xl shadow-2xl shadow-purple-950/20 dark:shadow-purple-950/50 ${isLimitReached ? 'p-4 sm:p-6' : 'p-5 sm:p-7'} text-neutral-900 dark:text-neutral-100 flex flex-col justify-between scrollbar-thin scrollbar-thumb-neutral-300 dark:scrollbar-thumb-neutral-800 scrollbar-track-transparent animate-in zoom-in-95 duration-200`}>
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
          className="absolute top-3.5 right-3.5 sm:top-5 sm:right-5 p-2 rounded-xl text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white bg-zinc-100 dark:bg-zinc-800/70 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/60 transition cursor-pointer min-w-[34px] min-h-[34px] flex items-center justify-center z-10"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Contenido Principal */}
        <div className={isLimitReached ? 'space-y-3 sm:space-y-3.5' : 'space-y-6'}>
          {/* =========================================================================
              ENCABEZADO: COMPACTO SI ES LÍMITE AGOTADO (CERO SCROLL) / HERO SI ES HARD PAYWALL
             ========================================================================= */}
          {isLimitReached ? (
            <div className="space-y-1 text-center sm:text-left pr-8 pt-0.5">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/25 border border-amber-300 dark:border-amber-500/40 text-amber-900 dark:text-amber-200 text-[10px] sm:text-xs font-extrabold uppercase tracking-wider">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-700 dark:text-amber-300 shrink-0" />
                <span>{t('pro_modal.limit_reached_pill', 'Saldo de Generaciones Agotado')}</span>
              </div>
              <h2
                id="pro-modal-title"
                className="text-base sm:text-lg font-extrabold tracking-tight text-zinc-900 dark:text-white leading-tight"
              >
                {userLimits?.tier === 'pro' || userLimits?.tier === 'vip'
                  ? 'Límite mensual del Plan PRO alcanzado'
                  : '¿Cómo prefieres continuar?'}
              </h2>
              <p className="text-xs sm:text-sm font-medium text-zinc-600 dark:text-zinc-300 leading-normal">
                {userLimits?.tier === 'pro' || userLimits?.tier === 'vip'
                  ? 'Has completado 120 generaciones este mes. Tu cuota se reinicia el día 1.'
                  : 'Elige una de las dos opciones para continuar generando flashcards:'}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 pt-1 text-center sm:text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-100/80 dark:bg-gradient-to-r dark:from-purple-500/20 dark:via-violet-500/15 dark:to-purple-500/10 border border-purple-200 dark:border-purple-500/40 text-purple-700 dark:text-purple-300 text-xs font-semibold tracking-wide shadow-sm shadow-purple-500/10 dark:shadow-purple-500/20">
                <FeatureIcon className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 animate-pulse" />
                <span>{featureInfo.badge}</span>
                <span className="px-1.5 py-0.2 rounded-md bg-purple-200/80 dark:bg-purple-500/30 text-[10px] text-purple-800 dark:text-purple-200 font-mono">
                  {platform.isNativeAndroid ? 'ANDROID' : platform.isIOS ? 'IOS' : 'WEB'}
                </span>
              </div>

              <h2
                id="pro-modal-title"
                className="text-xl sm:text-2xl font-extrabold tracking-tight text-neutral-900 dark:text-white leading-tight"
              >
                {featureInfo.title}{' '}
                <span className="block text-transparent bg-clip-text bg-gradient-to-r from-purple-600 via-indigo-600 to-violet-600 dark:from-purple-400 dark:via-violet-300 dark:to-indigo-300">
                  {isEn ? 'Study Smarter, Not Harder' : 'Estudia de forma inteligente'}
                </span>
              </h2>

              <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed max-w-lg">
                {featureInfo.subtitle}
              </p>
            </div>
          )}

          {/* =========================================================================
              CASO 1: MODAL DE LÍMITE AGOTADO (isLimitReached === true)
              Estructura jerárquica: Nivel 1 Stripe PRO vs. Nivel 2 Rewarded Ads / Info
             ========================================================================= */}
          {isLimitReached ? (
            <div className="space-y-2.5 sm:space-y-3 animate-in fade-in">
              {/* =======================================================
                  ANDORID NATIVO: NIVEL 1 (PRO STRIPE) + NIVEL 2 (ADMOB)
                 ======================================================= */}
              {platform.isNativeAndroid ? (
                <div className="space-y-2.5 sm:space-y-3">
                  {/* NIVEL 1 (PRIORITARIO / BOTÓN PRINCIPAL): PLAN PRO STRIPE */}
                  <div className="relative p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-neutral-900 border-2 border-purple-600 dark:border-purple-500 shadow-md shadow-purple-500/10 dark:shadow-purple-950/40 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-500/25 border border-purple-300 dark:border-purple-400/40 text-purple-900 dark:text-purple-200 text-[9px] font-bold uppercase tracking-wider">
                          <Sparkles className="w-2.5 h-2.5 text-purple-600 dark:text-purple-300" />
                          OPCIÓN 1 • RECOMENDADA
                        </div>
                        <h3 className="text-sm sm:text-base font-bold text-neutral-900 dark:text-white">
                          Flashmente PRO — Alta Capacidad
                        </h3>
                      </div>

                      <div className="text-right pl-2 shrink-0">
                        <div className="flex items-baseline justify-end gap-1">
                          <span className="text-xl sm:text-2xl font-black text-neutral-950 dark:text-white tracking-tight">3,50€</span>
                          <span className="text-xs font-bold text-purple-700 dark:text-purple-300">/mes</span>
                        </div>
                        <span className="text-[10px] font-medium text-neutral-600 dark:text-neutral-300 block -mt-0.5">Sin permanencia</span>
                      </div>
                    </div>

                    <p className="text-xs text-neutral-700 dark:text-neutral-300 leading-snug">
                      Alta Capacidad: Hasta 120 generaciones de mazos al mes (¡suficiente para todo tu temario!), sin pausas por anuncios y con acceso total.
                    </p>

                    {/* CUMPLIMIENTO GOOGLE PLAY: EN APP NATIVA ANDROID NO SE MUESTRA CHECKOUT DE PAGO DIRECTO */}
                    <div className="p-3 sm:p-3.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-500/30 text-purple-900 dark:text-purple-200 text-xs flex items-start gap-2.5 shadow-sm">
                      <Globe className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
                      <p className="leading-relaxed font-medium">
                        Gestiona o activa tu suscripción PRO desde nuestra web oficial <strong className="font-bold underline decoration-purple-400 underline-offset-2">flashmente.com</strong> iniciando sesión con esta misma cuenta.
                      </p>
                    </div>
                  </div>

                  {/* NIVEL 2 (ALTERNATIVA GRATUITA POR ANUNCIO): BOTÓN GRANDE Y VISTOSO */}
                  {(() => {
                    const isFreeTier = !userLimits || userLimits.tier === 'free';
                    const isZeroBalance = isFreeTier && (userLimits?.bonusCredits ?? 0) <= 0;
                    const remainingAds = Math.max(0, 45 - (userLimits?.count || 0));

                    return (
                      <div
                        className={`relative p-3.5 sm:p-4 rounded-2xl bg-gradient-to-b from-amber-50/90 via-white to-amber-50/40 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-950 border-2 ${
                          isZeroBalance
                            ? 'border-amber-500 ring-2 ring-amber-400/50 shadow-lg shadow-amber-500/20'
                            : 'border-amber-400 dark:border-amber-500/60 shadow-md shadow-amber-500/10'
                        } space-y-2.5`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/25 border border-amber-300 dark:border-amber-400/60 text-amber-950 dark:text-amber-200 text-[10px] font-extrabold uppercase tracking-wider">
                              <Tv className="w-3 h-3 text-amber-700 dark:text-amber-300" />
                              {isZeroBalance ? 'OPCIÓN RECOMENDADA EN MÓVIL • GRATIS' : 'OPCIÓN 2 • GRATUITA'}
                            </div>
                            <h3 className="text-sm sm:text-base font-extrabold text-zinc-950 dark:text-white tracking-tight">
                              Obtén saldo con un vídeo corto
                            </h3>
                          </div>

                          <div className="text-right pl-2 shrink-0">
                            <span className="inline-block px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-300 dark:border-emerald-500/40 text-emerald-950 dark:text-emerald-300 font-extrabold text-[10px]">
                              +1 GRATIS
                            </span>
                          </div>
                        </div>

                        <p className="text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-200 leading-snug">
                          Mira un vídeo patrocinado de AdMob y tu generación se reanudará de inmediato.
                        </p>

                        <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-900 dark:text-amber-300 font-mono">
                          <span>Cupo mensual: hasta 45 anuncios</span>
                          <strong className="font-bold">
                            {remainingAds > 0 ? `${remainingAds} disponibles este mes` : 'Cupo mensual completado'}
                          </strong>
                        </div>

                        {/* BOTÓN 2: GRANDE, VISTOSO Y CON ICONO DE REPRODUCCIÓN */}
                        <button
                          type="button"
                          onClick={handleWatchAd}
                          disabled={isWatchingAd || remainingAds <= 0}
                          className="w-full min-h-[44px] sm:min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:via-orange-400 hover:to-amber-500 text-neutral-950 font-bold text-xs sm:text-sm shadow-md shadow-amber-600/20 active:scale-[0.99] transition cursor-pointer disabled:opacity-80 disabled:cursor-not-allowed group"
                        >
                          {isWatchingAd ? (
                            <>
                              <div className="w-4 h-4 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin shrink-0" />
                              <span>
                                {adLoadingPhase === 'claiming' || adRewardNotice?.type === 'success'
                                  ? t('pro_modal.admob_resuming', '¡Recompensa añadida! Reanudando...')
                                  : t('pro_modal.admob_preparing', 'Preparando anuncio...')}
                              </span>
                            </>
                          ) : remainingAds <= 0 ? (
                            <span>Cupo mensual de 50 generaciones completado</span>
                          ) : (
                            <>
                              <PlayCircle className="w-4 h-4 fill-neutral-950 text-amber-300 group-hover:scale-110 transition-transform shrink-0" />
                              <span>Ver vídeo corto (+1 generación gratis)</span>
                            </>
                          )}
                        </button>

                        {adRewardNotice && (
                          <div
                            className={`p-2 rounded-xl text-xs flex items-center gap-2 animate-in fade-in ${
                              adRewardNotice.type === 'success'
                                ? 'bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
                                : 'bg-red-50 dark:bg-red-500/15 border border-red-200 dark:border-red-500/30 text-red-800 dark:text-red-200'
                            }`}
                          >
                            {adRewardNotice.type === 'success' ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            ) : (
                              <AlertCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0" />
                            )}
                            <span className="font-medium text-[11px]">{adRewardNotice.message}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ) : platform.isIOS ? (
                /* =======================================================
                   IPHONE / IOS: BOTÓN STRIPE + OPCIÓN GRATUITA (AVISO IOS)
                   ======================================================= */
                <div className="space-y-2.5 sm:space-y-3">
                  {/* Tarjeta Plan Mensual Alta Capacidad (3,50€/mes) */}
                  <div className="relative p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-neutral-900 border-2 border-purple-600 dark:border-purple-500 shadow-md shadow-purple-500/10 dark:shadow-purple-950/40 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-500/25 border border-purple-300 dark:border-purple-400/40 text-purple-900 dark:text-purple-200 text-[9px] font-bold uppercase tracking-wider">
                          <Sparkles className="w-2.5 h-2.5 text-purple-600 dark:text-purple-300" />
                          OPCIÓN 1 • RECOMENDADA
                        </div>
                        <h3 className="text-sm sm:text-base font-bold text-neutral-900 dark:text-white">
                          Flashmente PRO — Alta Capacidad
                        </h3>
                      </div>

                      <div className="text-right pl-2 shrink-0">
                        <div className="flex items-baseline justify-end gap-1">
                          <span className="text-xl sm:text-2xl font-black text-neutral-950 dark:text-white tracking-tight">3,50€</span>
                          <span className="text-xs font-bold text-purple-700 dark:text-purple-300">/mes</span>
                        </div>
                        <span className="text-[10px] font-medium text-neutral-600 dark:text-neutral-300 block -mt-0.5">Sin permanencia</span>
                      </div>
                    </div>

                    <p className="text-xs text-neutral-700 dark:text-neutral-300 leading-snug">
                      Alta Capacidad: Hasta 120 generaciones de mazos al mes (¡suficiente para todo tu temario!), sin pausas ni esperas con acceso a todas las funciones premium.
                    </p>

                    <button
                      type="button"
                      onClick={handleSubscribe}
                      disabled={isSubscribing}
                      className="w-full min-h-[44px] sm:min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-violet-600 hover:from-purple-500 hover:via-indigo-500 hover:to-violet-500 text-white font-bold text-xs sm:text-sm shadow-md shadow-purple-700/25 active:scale-[0.99] transition cursor-pointer disabled:opacity-70 group"
                    >
                      {isSubscribing ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                          <span>{t('pro_modal.connecting_gateway', 'Conectando con pasarela segura...')}</span>
                        </>
                      ) : (
                        <>
                          <CreditCard className="w-4 h-4 group-hover:scale-110 transition-transform" />
                          <span>Hacerme PRO (3,50 €/mes)</span>
                          <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                        </>
                      )}
                    </button>

                    {stripeNotice && (
                      <div className="p-2 rounded-xl bg-purple-100 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-500/30 text-purple-800 dark:text-purple-200 text-xs text-center animate-in fade-in">
                        <p>{stripeNotice}</p>
                      </div>
                    )}
                  </div>

                  {/* NIVEL 2: OPCIÓN GRATUITA (DISPOSITIVOS APPLE IOS) */}
                  <div className="relative p-3.5 sm:p-4 rounded-2xl bg-gradient-to-b from-amber-50/90 via-white to-amber-50/40 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-950 border-2 border-amber-400 dark:border-amber-500/60 shadow-md shadow-amber-500/10 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/25 border border-amber-300 dark:border-amber-400/60 text-amber-950 dark:text-amber-200 text-[10px] font-extrabold uppercase tracking-wider">
                          <PlayCircle className="w-3 h-3 text-amber-700 dark:text-amber-300" />
                          Opción Gratuita
                        </div>
                        <h3 className="text-sm sm:text-base font-extrabold text-zinc-950 dark:text-white tracking-tight">
                          Dispositivos Apple iOS
                        </h3>
                      </div>

                      <div className="text-right pl-2 shrink-0">
                        <span className="inline-block px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-500/20 border border-purple-300 dark:border-purple-500/40 text-purple-900 dark:text-purple-300 font-extrabold text-[10px] uppercase tracking-wider">
                          Próximamente en iOS
                        </span>
                      </div>
                    </div>

                    <p className="text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-200 leading-snug">
                      Actualmente los anuncios bonificados solo están disponibles en la App de Android. Estamos preparando el lanzamiento en la App Store de Apple.
                    </p>

                    <a
                      href="mailto:nachomoltol@gmail.com?subject=Aviso%20disponibilidad%20iOS%20-%20Flashmente&body=Hola,%20deseo%20que%20me%20avises%20cuando%20Flashmente%20est%C3%A9%20disponible%20en%20la%20App%20Store%20de%20Apple."
                      className="w-full min-h-[44px] sm:min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-neutral-900 font-bold text-xs sm:text-sm shadow-md active:scale-[0.99] transition cursor-pointer group"
                    >
                      <Mail className="w-4 h-4 text-purple-400 dark:text-purple-600 group-hover:scale-110 transition-transform" />
                      <span>Avísame cuando esté disponible en iPhone</span>
                      <ChevronRight className="w-3.5 h-3.5 text-neutral-400 dark:text-neutral-600 group-hover:translate-x-0.5 transition-transform" />
                    </a>
                  </div>
                </div>
              ) : (
                /* =======================================================
                   PC / MAC / WEB: BOTÓN STRIPE + OPCIÓN GRATUITA (APP ANDROID)
                   ======================================================= */
                <div className="space-y-2.5 sm:space-y-3">
                  {/* Tarjeta Plan Mensual Alta Capacidad (3,50€/mes) */}
                  <div className="relative p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-neutral-900 border-2 border-purple-600 dark:border-purple-500 shadow-md shadow-purple-500/10 dark:shadow-purple-950/40 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-500/25 border border-purple-300 dark:border-purple-400/40 text-purple-900 dark:text-purple-200 text-[9px] font-bold uppercase tracking-wider">
                          <Sparkles className="w-2.5 h-2.5 text-purple-600 dark:text-purple-300" />
                          OPCIÓN 1 • RECOMENDADA
                        </div>
                        <h3 className="text-sm sm:text-base font-bold text-neutral-900 dark:text-white">
                          Flashmente PRO — Alta Capacidad
                        </h3>
                      </div>

                      <div className="text-right pl-2 shrink-0">
                        <div className="flex items-baseline justify-end gap-1">
                          <span className="text-xl sm:text-2xl font-black text-neutral-950 dark:text-white tracking-tight">3,50€</span>
                          <span className="text-xs font-bold text-purple-700 dark:text-purple-300">/mes</span>
                        </div>
                        <span className="text-[10px] font-medium text-neutral-600 dark:text-neutral-300 block -mt-0.5">Sin permanencia</span>
                      </div>
                    </div>

                    <p className="text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-200 leading-snug">
                      Alta Capacidad: Hasta 120 generaciones de mazos al mes (¡suficiente para todo tu temario!). Sin anuncios, máxima velocidad y cancelación flexible.
                    </p>

                    <button
                      type="button"
                      onClick={handleSubscribe}
                      disabled={isSubscribing}
                      className="w-full min-h-[44px] sm:min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-violet-600 hover:from-purple-500 hover:via-indigo-500 hover:to-violet-500 text-white font-bold text-xs sm:text-sm shadow-md shadow-purple-700/25 active:scale-[0.99] transition cursor-pointer disabled:opacity-70 group"
                    >
                      {isSubscribing ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                          <span>{t('pro_modal.connecting_gateway', 'Conectando con pasarela segura...')}</span>
                        </>
                      ) : (
                        <>
                          <CreditCard className="w-4 h-4 group-hover:scale-110 transition-transform" />
                          <span>Hacerme PRO (3,50 €/mes)</span>
                          <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                        </>
                      )}
                    </button>

                    {stripeNotice && (
                      <div className="p-2 rounded-xl bg-purple-100 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-500/30 text-purple-800 dark:text-purple-200 text-xs text-center animate-in fade-in">
                        <p>{stripeNotice}</p>
                      </div>
                    )}
                  </div>

                  {/* NIVEL 2: OPCIÓN GRATUITA (DISPONIBLE EN APP ANDROID) */}
                  <div className="relative p-3.5 sm:p-4 rounded-2xl bg-gradient-to-b from-amber-50/90 via-white to-amber-50/40 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-950 border-2 border-amber-400 dark:border-amber-500/60 shadow-md shadow-amber-500/10 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/25 border border-amber-300 dark:border-amber-400/60 text-amber-950 dark:text-amber-200 text-[10px] font-extrabold uppercase tracking-wider">
                          <PlayCircle className="w-3 h-3 text-amber-700 dark:text-amber-300" />
                          Opción Gratuita
                        </div>
                        <h3 className="text-sm sm:text-base font-extrabold text-zinc-950 dark:text-white tracking-tight">
                          Disponible en la App de Android
                        </h3>
                      </div>

                      <div className="text-right pl-2 shrink-0">
                        <span className="inline-block px-2.5 py-0.5 rounded-full bg-amber-200/90 dark:bg-amber-500/30 border border-amber-400 dark:border-amber-400/70 text-amber-950 dark:text-amber-100 font-extrabold text-[10px] uppercase tracking-wider shadow-sm">
                          Exclusivo en Android App
                        </span>
                      </div>
                    </div>

                    <p className="text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-200 leading-relaxed">
                      {isEn
                        ? 'Open Flashmente on your Android mobile device, and inside your deck menu tap “Generate questions with AI” to watch a short video and return here to create your deck for free'
                        : 'Abre Flashmente en tu móvil Android, y dentro del menú de tu mazo, pulsa “Generar preguntas con IA” para ver un vídeo corto y vuelve aquí para crear tu mazo gratis'}
                    </p>

                    <a
                      href="https://play.google.com/store/apps/details?id=com.flashmente.app"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 font-bold text-xs sm:text-sm shadow-md active:scale-[0.99] transition cursor-pointer group"
                    >
                      <Download className="w-4 h-4 text-emerald-400 dark:text-emerald-600 group-hover:translate-y-0.5 transition-transform" />
                      <span>Descargar en Google Play</span>
                      <ChevronRight className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 group-hover:translate-x-0.5 transition-transform" />
                    </a>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* =========================================================================
               CASO 2: MODAL EXCLUSIVO PRO (isLimitReached === false)
               Hard Paywall para PDF, Audio, YouTube, Impresión y Menú Suscripción.
               100% PRO en todas las plataformas — CERO ANUNCIOS NI ADMOB.
               ========================================================================= */
            <div className="space-y-4 animate-in fade-in">
              {/* Tarjeta Plan Mensual Alta Capacidad (3,50€/mes) */}
              <div className="relative p-5 sm:p-6 rounded-2xl bg-white dark:bg-neutral-900 border-2 border-purple-600 dark:border-purple-500 shadow-xl shadow-purple-500/10 dark:shadow-purple-950/40 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-500/25 border border-purple-300 dark:border-purple-400/40 text-purple-900 dark:text-purple-200 text-[10px] font-bold uppercase tracking-wider">
                      <Sparkles className="w-3 h-3 text-purple-600 dark:text-purple-300" />
                      SUSCRIPCIÓN FLASHMENTE PRO
                    </div>
                    <h3 className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white">
                      Plan Mensual Alta Capacidad
                    </h3>
                    <p className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed max-w-md">
                      Alta Capacidad: Hasta 120 generaciones de mazos al mes (¡suficiente para todo tu temario!), generación desde Vídeo, Audio, PDF, Tutor Socrático 24/7 y exportación a PDF.
                    </p>
                  </div>

                  <div className="text-right pl-3 shrink-0">
                    <div className="flex items-baseline justify-end gap-1">
                      <span className="text-3xl sm:text-4xl font-black text-neutral-950 dark:text-white tracking-tight">3,50€</span>
                      <span className="text-xs font-bold text-purple-700 dark:text-purple-300">/mes</span>
                    </div>
                    <span className="text-[10px] font-medium text-neutral-600 dark:text-neutral-300 block mt-0.5">Sin permanencia</span>
                  </div>
                </div>

                {/* BOTÓN DIRECTO A STRIPE EN WEB / MENSAJE INFORMATIVO EN ANDROID NATIVO (GOOGLE PLAY COMPLIANCE) */}
                {platform.isNativeAndroid ? (
                  <div className="p-3.5 sm:p-4 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-500/30 text-purple-900 dark:text-purple-200 text-xs sm:text-sm flex items-start gap-2.5 shadow-sm">
                    <Globe className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
                    <p className="leading-relaxed font-medium">
                      Gestiona o activa tu suscripción PRO desde nuestra web oficial <strong className="font-bold underline decoration-purple-400 underline-offset-2">flashmente.com</strong> iniciando sesión con esta misma cuenta.
                    </p>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleSubscribe}
                      disabled={isSubscribing}
                      className="w-full min-h-[50px] inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-violet-600 hover:from-purple-500 hover:via-indigo-500 hover:to-violet-500 text-white font-bold text-sm shadow-xl shadow-purple-700/30 active:scale-[0.99] transition cursor-pointer disabled:opacity-70 group"
                    >
                      {isSubscribing ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                          <span>{t('pro_modal.connecting_gateway', 'Conectando con pasarela segura...')}</span>
                        </>
                      ) : (
                        <>
                          <CreditCard className="w-4 h-4 group-hover:scale-110 transition-transform" />
                          <span>{t('pro_modal.cta_subscribe', 'Suscribirse ahora')} — 3,50 €/mes</span>
                          <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                        </>
                      )}
                    </button>

                    {stripeNotice && (
                      <div className="p-2.5 rounded-xl bg-purple-100 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-500/30 text-purple-800 dark:text-purple-200 text-xs text-center animate-in fade-in">
                        <p>{stripeNotice}</p>
                      </div>
                    )}

                    <div className="flex items-center justify-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-400 pt-1">
                      <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>{t('pro_modal.stripe_notice', 'Transacción 100% segura y encriptada procesada por Stripe')}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* =========================================================================
              CANJEAR CÓDIGO PROMOCIONAL O VIP
              (Colapsable en límite agotado para asegurar cero scroll móvil)
              ========================================================================= */}
          {isLimitReached ? (
            <div className="pt-1 text-center">
              {!showPromoCode ? (
                <button
                  type="button"
                  onClick={() => setShowPromoCode(true)}
                  className="text-xs font-medium text-zinc-500 hover:text-purple-600 dark:text-zinc-400 dark:hover:text-zinc-200 underline underline-offset-4 cursor-pointer transition inline-flex items-center gap-1.5 py-0.5"
                >
                  <Ticket className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  <span>{t('pro_modal.promo_title', '¿Tienes un código promocional o VIP?')}</span>
                </button>
              ) : (
                <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-neutral-900/90 border border-zinc-200 dark:border-neutral-800 space-y-2 text-left animate-in fade-in shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                      <Ticket className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                      Canjear código
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowPromoCode(false)}
                      className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                    >
                      Ocultar
                    </button>
                  </div>
                  <form onSubmit={handleRedeemCode} className="space-y-1.5">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={promoCode}
                        onChange={(e) => {
                          setPromoCode(e.target.value.toUpperCase());
                          if (redeemStatus) setRedeemStatus(null);
                        }}
                        placeholder="EJ: ESTUDIANTE2026"
                        className="flex-1 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 focus:border-purple-500 rounded-xl px-3 py-1.5 text-xs text-neutral-900 dark:text-white uppercase font-mono tracking-wider"
                        disabled={isRedeeming}
                      />
                      <button
                        type="submit"
                        disabled={isRedeeming || !promoCode.trim()}
                        className="px-3.5 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-neutral-900 font-semibold text-xs"
                      >
                        {isRedeeming ? '...' : 'Canjear'}
                      </button>
                    </div>
                    {redeemStatus && (
                      <p className={`text-xs ${redeemStatus.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                        {redeemStatus.message}
                      </p>
                    )}
                  </form>
                </div>
              )}
            </div>
          ) : (
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
                          {t('pro_modal.unlimited_gens', '(Hasta 120 generaciones/mes)')}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </form>
            </div>
          )}

          {/* Tarjeta de Beneficios Destacados (Solo en Hard Paywall, ocultos en límite agotado para asegurar cero scroll móvil) */}
          {!isLimitReached && (
            <div className="space-y-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                {t('pro_modal.benefits_title', 'LO QUE INCLUYE EL PLAN PRO')}
              </p>

              <div className="grid grid-cols-1 gap-2.5">
                {/* BENEFICIO 1: VÍDEO Y AUDIO */}
                <div className="flex items-start gap-3 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-950/60 border border-neutral-200 dark:border-neutral-800">
                  <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 shrink-0 mt-0.5">
                    <Video className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-neutral-900 dark:text-white">
                      Generación desde Vídeo y Audio (Clases, YouTube, MP4)
                    </h4>
                    <p className="text-[11px] text-neutral-600 dark:text-neutral-300 leading-snug mt-0.5">
                      Sube clases grabadas, audios (.mp3, .wav, .m4a), vídeos (.mp4, .mov, .webm) o enlaces de YouTube para generar flashcards sin escribir a mano.
                    </p>
                  </div>
                </div>

                {/* BENEFICIO 2: TUTOR SOCRÁTICO IA */}
                <div className="flex items-start gap-3 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-950/60 border border-neutral-200 dark:border-neutral-800">
                  <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 shrink-0 mt-0.5">
                    <Brain className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-neutral-900 dark:text-white">
                      Tutor Socrático IA (Resolución de dudas 24/7)
                    </h4>
                    <p className="text-[11px] text-neutral-600 dark:text-neutral-300 leading-snug mt-0.5">
                      Tu preparador particular siempre disponible para resolver dudas paso a paso y afianzar conceptos complejos mediante razonamiento guiado.
                    </p>
                  </div>
                </div>

                {/* BENEFICIO 3: EXPORTACIÓN E IMPRESIÓN */}
                <div className="flex items-start gap-3 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-950/60 border border-neutral-200 dark:border-neutral-800">
                  <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 shrink-0 mt-0.5">
                    <Printer className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-neutral-900 dark:text-white">
                      Exportación e Impresión a PDF
                    </h4>
                    <p className="text-[11px] text-neutral-600 dark:text-neutral-300 leading-snug mt-0.5">
                      Exporta e imprime simulacros de examen reales, solucionarios oficiales y hojas de estudio ultra-compactas en PDF para repasar en papel.
                    </p>
                  </div>
                </div>

                {/* BENEFICIO 4: ALTA CAPACIDAD */}
                <div className="flex items-start gap-3 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-950/60 border border-neutral-200 dark:border-neutral-800">
                  <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-neutral-900 dark:text-white">
                      Alta Capacidad: Hasta 120 generaciones de mazos al mes
                    </h4>
                    <p className="text-[11px] text-neutral-600 dark:text-neutral-300 leading-snug mt-0.5">
                      Suficiente para todo tu temario de estudio mensual, procesamiento prioritario de alta velocidad sin colas ni esperas.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer / Botones de Cierre */}
        <div className={`border-t border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between ${isLimitReached ? 'pt-3 mt-3' : 'pt-5 mt-5'}`}>
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            {t('pro_modal.cancel_anytime', 'Cancela en cualquier momento')}
          </span>
          <button
            type="button"
            onClick={handleClose}
            className="text-xs font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-200 transition cursor-pointer py-1 px-2.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/80"
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
