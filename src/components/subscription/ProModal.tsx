'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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
  RefreshCw,
  Laptop,
  Smartphone,
} from 'lucide-react';
import { useProModalStore, ProFeatureName } from '@/stores/useProModalStore';
import { useAuthStore, useLanguageStore } from '@/stores';
import { supabase } from '@/lib/supabase';
import { redeemPromoCodeAction } from '@/app/actions/redeemPromoCode';
import { claimAdRewardAction } from '@/app/actions/claimAdReward';
import { getUserLimitsAction } from '@/app/actions/getUserLimits';
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
  const router = useRouter();
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

  // Precarga proactiva en segundo plano del anuncio bonificado al abrir el modal en App nativa (Android / iOS)
  useEffect(() => {
    if (isOpen && platform.isNativeApp) {
      preloadRewardedAd().catch((err) => {
        console.warn('Fallo en precarga reactiva de ProModal:', err);
      });
    }
  }, [isOpen, platform.isNativeApp]);

  // Estado para el canje secundario de código promocional
  const [promoCode, setPromoCode] = useState('');
  const [showPromoCode, setShowPromoCode] = useState(false);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [redeemStatus, setRedeemStatus] = useState<{
    type: 'success' | 'error';
    message: string;
    tier?: string;
  } | null>(null);

  // Estado de nivel y consumo para mensajes de límite duros (50 Free / 120 Pro) y cupo de anuncios
  // Estado para la comprobación manual interactiva de saldo en PC / Web
  const [isCheckingBalance, setIsCheckingBalance] = useState(false);
  const [balanceFeedback, setBalanceFeedback] = useState<{
    type: 'success' | 'info';
    message: string;
  } | null>(null);

  // Estado para la pantalla de elección post-recompensa en Android nativo (Continuar en PC vs Generar en móvil)
  const [rewardChoicePrompt, setRewardChoicePrompt] = useState<{
    show: boolean;
    bonusCredits: number;
  } | null>(null);
  const [mobileNoticeToast, setMobileNoticeToast] = useState<string | null>(null);

  const [userLimits, setUserLimits] = useState<{
    tier: 'free' | 'pro' | 'vip';
    count: number;
    bonusCredits: number;
    welcomeGenerations: number;
    tutorConsultationsCount?: number;
    tutorAdsUsed?: number;
    tutorAdCredits?: number;
    adsUsedInCycle: number;
    remainingAds: number;
  } | null>(null);

  const fetchUserLimits = useCallback(async () => {
    if (!user?.id) return;
    try {
      let accessToken: string | undefined;
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        accessToken = sessionData?.session?.access_token;
      } catch (sessionErr) {
        console.warn('[ProModal] No se pudo obtener el token de sesión:', sessionErr);
      }

      const res = await getUserLimitsAction(user.id, accessToken);
      if (res.success) {
        setUserLimits({
          tier: res.tier,
          count: res.count,
          bonusCredits: res.bonusCredits,
          welcomeGenerations: res.welcomeGenerations,
          tutorConsultationsCount: res.tutorConsultationsCount,
          tutorAdsUsed: res.tutorAdsUsed,
          tutorAdCredits: res.tutorAdCredits,
          adsUsedInCycle: res.adsUsedInCycle,
          remainingAds: res.remainingAds,
        });
      }
    } catch (err) {
      console.warn('[ProModal] Error al consultar límites mediante Server Action:', err);
    }
  }, [user?.id]);

  useEffect(() => {
    if (isOpen && user?.id) {
      fetchUserLimits();
    }
  }, [isOpen, user?.id, fetchUserLimits]);

  const handleClose = useCallback(() => {
    setRewardChoicePrompt(null);
    setMobileNoticeToast(null);
    setBalanceFeedback(null);
    setIsCheckingBalance(false);
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

  // Flujo Híbrido Web (PC): Comprobar saldo en la nube tras ver vídeo en móvil Android
  const handleCheckBalance = async () => {
    if (!user?.id || isCheckingBalance) return;
    setIsCheckingBalance(true);
    setBalanceFeedback(null);

    try {
      let accessToken: string | undefined;
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        accessToken = sessionData?.session?.access_token;
      } catch (sessionErr) {
        console.warn('[ProModal] No se pudo obtener el token de sesión:', sessionErr);
      }

      const res = await getUserLimitsAction(user.id, accessToken);
      if (res.success) {
        setUserLimits({
          tier: res.tier,
          count: res.count,
          bonusCredits: res.bonusCredits,
          welcomeGenerations: res.welcomeGenerations,
          tutorConsultationsCount: res.tutorConsultationsCount,
          tutorAdsUsed: res.tutorAdsUsed,
          adsUsedInCycle: res.adsUsedInCycle,
          remainingAds: res.remainingAds,
        });

        try {
          router.refresh();
        } catch {
          // no-op
        }

        const hasBonus = (res.bonusCredits || 0) > 0;
        const canGenerate = (res.bonusCredits || 0) > 0 || res.tier === 'pro' || res.tier === 'vip' || (res.welcomeGenerations < 5);

        if (hasBonus || canGenerate) {
          const creditsFound = res.bonusCredits || 1;
          setBalanceFeedback({
            type: 'success',
            message: isEn
              ? `Balance detected! You have ${creditsFound} bonus credit(s) available. Resuming...`
              : `¡Saldo detectado! Tienes ${creditsFound} crédito(s) bonificado(s) disponible(s). Desbloqueando...`,
          });

          const resumeAction = store.onRewardSuccess;
          setTimeout(() => {
            handleClose();
            if (typeof resumeAction === 'function') {
              setTimeout(() => {
                try {
                  resumeAction();
                } catch (resumeErr) {
                  console.error('Error al auto-reanudar acción tras comprobar saldo:', resumeErr);
                }
              }, 50);
            }
          }, 1200);
        } else {
          setBalanceFeedback({
            type: 'info',
            message: isEn
              ? 'We have not detected bonus credits yet. Complete the ad on your mobile and try again.'
              : 'Aún no detectamos créditos en tu cuenta. Completa el anuncio en tu móvil y pulsa nuevamente.',
          });
        }
      } else {
        setBalanceFeedback({
          type: 'info',
          message: res.error || (isEn ? 'Could not verify balance. Try again.' : 'No se pudo verificar el saldo. Inténtalo de nuevo.'),
        });
      }
    } catch (err) {
      console.error('Error al comprobar saldo en PC:', err);
      setBalanceFeedback({
        type: 'info',
        message: isEn ? 'Connection error checking balance.' : 'Error de conexión al comprobar el saldo.',
      });
    } finally {
      setIsCheckingBalance(false);
    }
  };

  // Elección post-recompensa en móvil: Continuar en PC
  const handleContinueOnPC = () => {
    setRewardChoicePrompt(null);
    setMobileNoticeToast(
      isEn
        ? 'Your credit is now available on the web. Return to your PC and tap "Check balance".'
        : 'Tu crédito ya está disponible en la web. Vuelve a tu ordenador y pulsa "Comprobar saldo".'
    );
    setTimeout(() => {
      handleClose();
      setMobileNoticeToast(null);
    }, 1800);
  };

  // Elección post-recompensa en móvil: Generar en este móvil
  const handleGenerateOnMobile = () => {
    setRewardChoicePrompt(null);
    const resumeAction = store.onRewardSuccess;
    handleClose();
    if (typeof resumeAction === 'function') {
      setTimeout(() => {
        try {
          resumeAction();
        } catch (resumeErr) {
          console.error('Error al auto-reanudar acción en móvil:', resumeErr);
        }
      }, 50);
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
        const isTutorReward = featureName === 'tutor';
        const claim = await claimAdRewardAction(user?.id, accessToken, isTutorReward ? 'tutor' : 'deck');

        if (claim.success) {
          if (isTutorReward) {
            // Recompensa para el Profesor Socrático: actualización reactiva inmediata y ejecución directa
            setUserLimits((prev) => {
              const currentTutorCredits = prev?.tutorAdCredits ?? 0;
              const newTutorCredits = currentTutorCredits + 1;
              if (!prev) {
                return {
                  tier: 'free',
                  count: 0,
                  bonusCredits: 0,
                  welcomeGenerations: 5,
                  tutorAdCredits: newTutorCredits,
                  adsUsedInCycle: 0,
                  remainingAds: 25,
                };
              }
              return {
                ...prev,
                tutorAdCredits: newTutorCredits,
              };
            });

            fetchUserLimits();
            setIsWatchingAd(false);
            setAdLoadingPhase('idle');
            close();
            // Ejecutar inmediatamente la consulta que estaba esperando el anuncio
            store.onRewardSuccess?.();
            return;
          }

          // 1. Actualización reactiva inmediata en la UI para descontar el contador
          setUserLimits((prev) => {
            const currentBonus = prev?.bonusCredits ?? 0;
            const newBonus =
              typeof claim.bonusCredits === 'number'
                ? claim.bonusCredits
                : currentBonus + 1;
            const count = typeof claim.generationsCount === 'number' ? claim.generationsCount : (prev?.count ?? 0);
            const adsUsedInCycle = typeof claim.adsUsedInCycle === 'number'
              ? claim.adsUsedInCycle
              : (count + newBonus);
            const remainingAds = typeof claim.remainingAds === 'number'
              ? claim.remainingAds
              : Math.max(0, 25 - adsUsedInCycle);

            if (!prev) {
              return {
                tier: 'free',
                count,
                bonusCredits: newBonus,
                welcomeGenerations: 5,
                adsUsedInCycle,
                remainingAds,
              };
            }
            return {
              ...prev,
              count,
              bonusCredits: newBonus,
              adsUsedInCycle,
              remainingAds,
            };
          });

          // 2. Refrescar datos en segundo plano mediante Server Action
          fetchUserLimits();
          try {
            router.refresh();
          } catch {
            // no-op
          }

          setAdRewardNotice({
            type: 'success',
            message:
              claim.message ||
              t(
                'pro_modal.admob_reward_success',
                '¡+1 Generación añadida con éxito!'
              ),
          });

          setIsWatchingAd(false);
          setAdLoadingPhase('idle');
          setRewardChoicePrompt({
            show: true,
            bonusCredits:
              typeof claim.bonusCredits === 'number'
                ? claim.bonusCredits
                : ((userLimits?.bonusCredits ?? 0) + 1),
          });
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
                  : platform.isNativeIOS
                  ? 'Desbloquea generaciones adicionales viendo un breve vídeo sin coste:'
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
                  APP NATIVA (ANDROID / iOS): NIVEL 1 (PRO INFO SIN CHECKOUT) + NIVEL 2 (ADMOB)
                 ======================================================= */}
              {platform.isNativeApp ? (
                <div className="space-y-2.5 sm:space-y-3">
                  {/* NIVEL 1 (PRIORITARIO / BOTÓN PRINCIPAL): PLAN PRO STRIPE (SOLO ANDROID / WEB) */}
                  {!platform.isNativeIOS && (
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

                      {/* CUMPLIMIENTO GOOGLE PLAY (GUIDELINE 3.1.3): EN APP NATIVA NO SE MUESTRA CHECKOUT DE PAGO DIRECTO */}
                      <div className="p-3 sm:p-3.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-500/30 text-purple-900 dark:text-purple-200 text-xs flex items-start gap-2.5 shadow-sm">
                        <Globe className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
                        <p className="leading-relaxed font-medium">
                          Gestiona o activa tu suscripción PRO desde nuestra web oficial <strong className="font-bold underline decoration-purple-400 underline-offset-2">flashmente.com</strong> iniciando sesión con esta misma cuenta.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* NIVEL 2 (ALTERNATIVA GRATUITA POR ANUNCIO): BOTÓN GRANDE Y VISTOSO */}
                  {(() => {
                    const isTutor = featureName === 'tutor';
                    const isFreeTier = !userLimits || userLimits.tier === 'free';
                    const isZeroBalance = isTutor
                      ? isFreeTier && (userLimits?.tutorAdCredits ?? 0) <= 0
                      : isFreeTier && (userLimits?.bonusCredits ?? 0) <= 0;
                    const adsUsedInCycle = userLimits?.adsUsedInCycle ?? ((userLimits?.count || 0) + (userLimits?.bonusCredits || 0));
                    const remainingAds = userLimits?.remainingAds !== undefined
                      ? userLimits.remainingAds
                      : Math.max(0, 25 - adsUsedInCycle);

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
                              {isZeroBalance ? 'OPCIÓN RECOMENDADA EN MÓVIL • GRATIS' : platform.isNativeIOS ? 'ACCESO GRATUITO POR VÍDEO' : 'OPCIÓN 2 • GRATUITA'}
                            </div>
                            <h3 className="text-sm sm:text-base font-extrabold text-zinc-950 dark:text-white tracking-tight">
                              {isTutor ? 'Desbloquea esta consulta con un vídeo' : platform.isNativeIOS ? 'Desbloquea generaciones con un vídeo corto' : 'Obtén saldo con un vídeo corto'}
                            </h3>
                          </div>

                          <div className="text-right pl-2 shrink-0">
                            <span className="inline-block px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-300 dark:border-emerald-500/40 text-emerald-950 dark:text-emerald-300 font-extrabold text-[10px]">
                              {isTutor ? '+1 CONSULTA' : '+1 GRATIS'}
                            </span>
                          </div>
                        </div>

                        <p className="text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-200 leading-snug">
                          {isTutor
                            ? 'Mira un vídeo patrocinado de AdMob y tu consulta con el Profesor Socrático se responderá al instante.'
                            : 'Mira un vídeo patrocinado de AdMob y tu generación se reanudará de inmediato.'}
                        </p>

                        <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-900 dark:text-amber-300 font-mono">
                          <span>{isTutor ? 'Consultas con anuncio: ILIMITADAS' : 'Cupo mensual: hasta 25 anuncios'}</span>
                          <strong className="font-bold">
                            {isTutor
                              ? 'Ilimitadas (1 anuncio / consulta)'
                              : remainingAds > 0
                              ? `${remainingAds} disponibles este mes`
                              : 'Cupo mensual completado'}
                          </strong>
                        </div>

                        {/* PANTALLA DE ELECCIÓN POST-RECOMPENSA O BOTÓN DE REPRODUCCIÓN */}
                        {rewardChoicePrompt?.show ? (
                          <div className="p-3.5 sm:p-4 rounded-xl bg-gradient-to-b from-emerald-50 via-white to-emerald-50/60 dark:from-emerald-950/40 dark:via-neutral-900 dark:to-neutral-950 border-2 border-emerald-500 shadow-md shadow-emerald-500/10 space-y-3 animate-in fade-in zoom-in-95">
                            <div className="space-y-1 text-center">
                              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 mb-0.5">
                                <CheckCircle2 className="w-6 h-6" />
                              </div>
                              <h4 className="text-sm sm:text-base font-extrabold text-neutral-950 dark:text-white">
                                {isEn ? '🎉 Credit Credited Successfully! (+1 Generation)' : '🎉 ¡Crédito Acreditado con Éxito! (+1 Generación)'}
                              </h4>
                              <p className="text-xs text-neutral-600 dark:text-neutral-300">
                                {isEn
                                  ? `Your balance is now synced in the cloud for ${user?.email || 'your account'}. Where would you like to continue?`
                                  : `Tu saldo ya está sincronizado en la nube para tu cuenta (${user?.email || 'registrada'}). ¿Dónde prefieres continuar?`}
                              </p>
                            </div>

                            <div className="space-y-2 pt-1">
                              {/* Botón 1: Continuar en el PC */}
                              <button
                                type="button"
                                onClick={handleContinueOnPC}
                                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 font-bold text-xs sm:text-sm shadow-md transition cursor-pointer group"
                              >
                                <Laptop className="w-4 h-4 text-emerald-400 dark:text-emerald-600 group-hover:scale-110 transition-transform" />
                                <span>{isEn ? 'Continue on PC' : 'Continuar en el PC'}</span>
                              </button>

                              {/* Botón 2: Generar en este móvil */}
                              <button
                                type="button"
                                onClick={handleGenerateOnMobile}
                                className="w-full min-h-[40px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs shadow-sm transition cursor-pointer group"
                              >
                                <Smartphone className="w-3.5 h-3.5 text-neutral-950 group-hover:scale-110 transition-transform" />
                                <span>{isEn ? 'Generate on this mobile' : 'Generar en este móvil'}</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {/* BOTÓN 2: GRANDE, VISTOSO Y CON ICONO DE REPRODUCCIÓN */}
                            <button
                              type="button"
                              onClick={handleWatchAd}
                              disabled={isWatchingAd || (!isTutor && remainingAds <= 0)}
                              className="w-full min-h-[44px] sm:min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:via-orange-400 hover:to-amber-500 text-neutral-950 font-bold text-xs sm:text-sm shadow-md shadow-amber-600/20 active:scale-[0.99] transition cursor-pointer disabled:opacity-80 disabled:cursor-not-allowed group"
                            >
                              {isWatchingAd ? (
                                <>
                                  <div className="w-4 h-4 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin shrink-0" />
                                  <span>
                                    {adLoadingPhase === 'claiming' || adRewardNotice?.type === 'success'
                                      ? t('pro_modal.admob_resuming', '¡Recompensa añadida! Procesando...')
                                      : t('pro_modal.admob_preparing', 'Preparando anuncio...')}
                                  </span>
                                </>
                              ) : !isTutor && remainingAds <= 0 ? (
                                <span>Cupo mensual de 25 anuncios completado</span>
                              ) : (
                                <>
                                  <PlayCircle className="w-4 h-4 fill-neutral-950 text-amber-300 group-hover:scale-110 transition-transform shrink-0" />
                                  <span>{isTutor ? 'Ver vídeo corto (+1 consulta gratis)' : 'Ver vídeo corto (+1 generación gratis)'}</span>
                                </>
                              )}
                            </button>
                          </>
                        )}

                        {mobileNoticeToast && (
                          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-500/40 text-emerald-900 dark:text-emerald-200 text-xs text-center animate-in fade-in flex items-center justify-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span className="font-semibold">{mobileNoticeToast}</span>
                          </div>
                        )}

                        {adRewardNotice && !rewardChoicePrompt?.show && (
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
                   SAFARI MÓVIL EN IPHONE (FUERA DE LA APP NATIVA):
                   BOTÓN STRIPE + OPCIÓN GRATUITA (AVISO IOS)
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

                  {/* NIVEL 2: OPCIÓN GRATUITA (DISPONIBLE EN APP ANDROID / FLUJO HÍBRIDO GUIADO) */}
                  {(() => {
                    const isTutor = featureName === 'tutor';
                    const adsUsedInCycle = userLimits?.adsUsedInCycle ?? ((userLimits?.count || 0) + (userLimits?.bonusCredits || 0));
                    const remainingAdsWeb = userLimits?.remainingAds !== undefined
                      ? userLimits.remainingAds
                      : Math.max(0, 25 - adsUsedInCycle);

                    return (
                      <div className="relative p-3.5 sm:p-4 rounded-2xl bg-gradient-to-b from-amber-50/90 via-white to-amber-50/40 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-950 border-2 border-amber-400 dark:border-amber-500/60 shadow-md shadow-amber-500/10 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/25 border border-amber-300 dark:border-amber-400/60 text-amber-950 dark:text-amber-200 text-[10px] font-extrabold uppercase tracking-wider">
                              <PlayCircle className="w-3 h-3 text-amber-700 dark:text-amber-300" />
                              {isEn ? 'Free Option • Via Android App' : 'Opción Gratuita • Vía App Android'}
                            </div>
                            <h3 className="text-sm sm:text-base font-extrabold text-zinc-950 dark:text-white tracking-tight">
                              {isTutor
                                ? (isEn ? 'Unlock consultation from your mobile' : 'Desbloquea consultas desde tu móvil')
                                : (isEn ? 'Recharge balance from your mobile' : 'Recarga saldo desde tu móvil')}
                            </h3>
                          </div>

                          <div className="text-right pl-2 shrink-0">
                            <span className="inline-block px-2.5 py-0.5 rounded-full bg-amber-200/90 dark:bg-amber-500/30 border border-amber-400 dark:border-amber-400/70 text-amber-950 dark:text-amber-100 font-extrabold text-[10px] uppercase tracking-wider shadow-sm">
                              {isTutor
                                ? (isEn ? 'Unlimited via Ads' : 'Ilimitadas con Anuncios')
                                : remainingAdsWeb > 0
                                ? (isEn ? `${remainingAdsWeb} available this month` : `${remainingAdsWeb} disponibles este mes`)
                                : (isEn ? 'Monthly quota reached' : 'Cupo mensual completado')}
                            </span>
                          </div>
                        </div>

                        {/* Pasos estructurados */}
                        <div className="p-3 rounded-xl bg-amber-500/10 dark:bg-amber-500/5 border border-amber-500/20 space-y-2">
                          <p className="text-[11px] font-bold text-amber-950 dark:text-amber-200 uppercase tracking-wider">
                            {isEn ? 'How to generate for free on this computer:' : 'Cómo generar gratis en este ordenador:'}
                          </p>
                          <ol className="space-y-1.5 text-xs text-zinc-800 dark:text-zinc-200 leading-snug">
                            <li className="flex items-start gap-2">
                              <span className="w-4 h-4 rounded-full bg-amber-200 dark:bg-amber-500/30 text-amber-950 dark:text-amber-100 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                                1
                              </span>
                              <span>
                                {isEn ? 'Open Flashmente on your Android mobile with this account: ' : 'Abre Flashmente en tu móvil Android con esta cuenta: '}
                                <strong className="font-bold underline text-amber-900 dark:text-amber-300">
                                  {user?.email || (isEn ? 'your registered email' : 'tu email registrado')}
                                </strong>.
                              </span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="w-4 h-4 rounded-full bg-amber-200 dark:bg-amber-500/30 text-amber-950 dark:text-amber-100 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                                2
                              </span>
                              <span>
                                {isEn
                                  ? 'In this deck, tap "Generate questions with AI" to watch a short video.'
                                  : 'En este mazo, pulsa "Generar preguntas con IA" para ver un vídeo corto.'}
                              </span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="w-4 h-4 rounded-full bg-amber-200 dark:bg-amber-500/30 text-amber-950 dark:text-amber-100 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                                3
                              </span>
                              <span>
                                {isEn
                                  ? 'After watching the ad, tap the button below to unlock your generation here.'
                                  : 'Tras ver el anuncio, pulsa el botón inferior para desbloquear tu generación aquí.'}
                              </span>
                            </li>
                          </ol>
                        </div>

                        {/* Botón interactivo de comprobación de saldo */}
                        <button
                          type="button"
                          onClick={handleCheckBalance}
                          disabled={isCheckingBalance}
                          className="w-full min-h-[44px] sm:min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:via-orange-400 hover:to-amber-500 text-neutral-950 font-bold text-xs sm:text-sm shadow-md shadow-amber-600/20 active:scale-[0.99] transition cursor-pointer disabled:opacity-80 group"
                        >
                          {isCheckingBalance ? (
                            <>
                              <div className="w-4 h-4 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin shrink-0" />
                              <span>{isEn ? 'Checking balance in cloud...' : 'Comprobando saldo en la nube...'}</span>
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-4 h-4 text-neutral-950 group-hover:rotate-180 transition-transform duration-500 shrink-0" />
                              <span>{isEn ? 'Check balance / I watched the video' : 'Comprobar saldo / Ya vi el vídeo'}</span>
                              <ChevronRight className="w-3.5 h-3.5 text-neutral-900 group-hover:translate-x-0.5 transition-transform shrink-0" />
                            </>
                          )}
                        </button>

                        {balanceFeedback && (
                          <div
                            className={`p-2.5 rounded-xl text-xs flex items-center gap-2 animate-in fade-in ${
                              balanceFeedback.type === 'success'
                                ? 'bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
                                : 'bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 text-amber-900 dark:text-amber-200'
                            }`}
                          >
                            {balanceFeedback.type === 'success' ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                            )}
                            <span className="font-medium text-[11px] leading-snug">{balanceFeedback.message}</span>
                          </div>
                        )}

                        {/* Enlace secundario Google Play */}
                        <div className="pt-0.5 text-center">
                          <a
                            href="https://play.google.com/store/apps/details?id=com.flashmente.app"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 hover:text-amber-700 dark:hover:text-amber-300 underline underline-offset-2 transition group"
                          >
                            <Download className="w-3.5 h-3.5 text-zinc-500 group-hover:text-amber-600 transition-colors" />
                            <span>{isEn ? 'Don’t have the app yet? Download on Google Play' : '¿Aún no tienes la app? Descargar en Google Play'}</span>
                            <ChevronRight className="w-3 h-3 text-zinc-400 group-hover:translate-x-0.5 transition-transform" />
                          </a>
                        </div>
                      </div>
                    );
                  })()}
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
              {platform.isNativeIOS ? (
                <div className="relative p-5 sm:p-6 rounded-2xl bg-white dark:bg-neutral-900 border-2 border-purple-600 dark:border-purple-500 shadow-xl shadow-purple-500/10 dark:shadow-purple-950/40 space-y-4">
                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-500/25 border border-purple-300 dark:border-purple-400/40 text-purple-900 dark:text-purple-200 text-[10px] font-bold uppercase tracking-wider">
                      <Sparkles className="w-3 h-3 text-purple-600 dark:text-purple-300" />
                      ACCESO A FUNCIONES AVANZADAS
                    </div>
                    <h3 className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white">
                      Generación Multimodal y Exportación
                    </h3>
                    <p className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed">
                      Las funciones avanzadas de procesamiento están disponibles para cuentas sincronizadas. En esta versión para iOS dispones de una experiencia completa de estudio con cuota gratuita ampliable mediante vídeos bonificados.
                    </p>
                  </div>
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-xs sm:text-sm transition cursor-pointer shadow-md shadow-purple-700/20 active:scale-[0.99]"
                    >
                      Entendido, continuar
                    </button>
                  </div>
                </div>
              ) : (
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

                  {/* BOTÓN DIRECTO A STRIPE EN WEB / MENSAJE INFORMATIVO EN APPS NATIVAS (GOOGLE PLAY 3.1.3) */}
                  {platform.isNativeApp ? (
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
              )}
            </div>
          )}

          {/* =========================================================================
              CANJEAR CÓDIGO PROMOCIONAL O VIP (OCULTO EN IOS NATIVO: GUIDELINE 3.1.1)
              (Colapsable en límite agotado para asegurar cero scroll móvil)
              ========================================================================= */}
          {!platform.isNativeIOS && (
            isLimitReached ? (
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
            )
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
