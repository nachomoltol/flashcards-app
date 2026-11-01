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
  Smartphone,
  PlayCircle,
  Tv,
  Apple,
  Mail,
  FileText,
  Volume2,
  Video,
  Printer,
} from 'lucide-react';
import { useProModalStore, ProFeatureName } from '@/stores/useProModalStore';
import { useAuthStore, useLanguageStore } from '@/stores';
import { redeemPromoCodeAction } from '@/app/actions/redeemPromoCode';
import { claimAdRewardAction } from '@/app/actions/claimAdReward';
import { usePlatform } from '@/lib/platform';
import { showAdMobRewardedAd } from '@/lib/admob';

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

  // Estado para captura de interés en App Store para usuarios de iOS
  const [iosEmail, setIosEmail] = useState('');
  const [iosSubmitted, setIosSubmitted] = useState(false);

  // Estado de nivel y consumo para mensajes de límite duros (50 Free / 120 Pro)
  const [userLimits, setUserLimits] = useState<{
    tier: 'free' | 'pro' | 'vip';
    count: number;
  } | null>(null);

  useEffect(() => {
    if (isOpen && user?.id) {
      import('@/lib/supabase').then(({ supabase }) => {
        supabase
          .from('api_limits')
          .select('tier, generations_count, last_generation_date')
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
              });
            }
          });
      });
    }

    if (user?.email && !iosEmail) {
      setIosEmail(user.email);
    }

    try {
      if (typeof window !== 'undefined' && localStorage.getItem('flashmente_ios_waitlist_email')) {
        setIosSubmitted(true);
      }
    } catch {
      // Ignorar fallo en acceso a localStorage
    }
  }, [isOpen, user?.id, user?.email, iosEmail]);

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
    setIsWatchingAd(true);
    setAdRewardNotice(null);

    try {
      const result = await showAdMobRewardedAd();

      if (result.completed) {
        const claim = await claimAdRewardAction(user?.id);

        if (claim.success) {
          setAdRewardNotice({
            type: 'success',
            message:
              claim.message ||
              t(
                'pro_modal.admob_reward_success',
                '¡+1 Generación añadida con éxito! Ya puedes generar tu mazo.'
              ),
          });

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

  // Información contextual del encabezado según si fue disparado por una función PRO específica
  const getFeatureHeadline = () => {
    switch (featureName) {
      case 'pdf':
        return {
          icon: FileText,
          badge: isEn ? 'PRO EXCLUSIVE • PDF OCR' : 'EXCLUSIVO PRO • DOCUMENTOS PDF',
          title: isEn ? 'Unlock PDF Document Scanning' : 'Desbloquea la Extracción de Documentos PDF',
          subtitle: isEn
            ? 'Deep scanning of textbooks, syllabi and complex PDFs with sequential chunking is exclusive to Flashmente PRO.'
            : 'La lectura profunda de apuntes, libros de texto y exámenes en PDF con chunking secuencial es una función 100% exclusiva de Flashmente PRO.',
        };
      case 'audio':
        return {
          icon: Volume2,
          badge: isEn ? 'PRO EXCLUSIVE • AUDIO & VOICE' : 'EXCLUSIVO PRO • AUDIO Y GRABACIONES',
          title: isEn ? 'Unlock Audio & Voice Processing' : 'Desbloquea el Procesamiento de Audio y Voz',
          subtitle: isEn
            ? 'Transcribing lectures, voice recordings and podcasts with Google Cloud AI is exclusive to Flashmente PRO.'
            : 'La transcripción y generación de tarjetas desde notas de voz, conferencias y clases grabadas es una función 100% exclusiva de Flashmente PRO.',
        };
      case 'youtube':
        return {
          icon: Video,
          badge: isEn ? 'PRO EXCLUSIVE • YOUTUBE AI' : 'EXCLUSIVO PRO • VÍDEOS DE YOUTUBE',
          title: isEn ? 'Unlock YouTube Video Flashcards' : 'Desbloquea la Generación desde YouTube',
          subtitle: isEn
            ? 'Direct video analysis on Google Cloud AI without downloading is exclusive to Flashmente PRO.'
            : 'El análisis de conferencias y clases magistrales de YouTube directamente en la nube de Google es una función 100% exclusiva de Flashmente PRO.',
        };
      case 'print':
        return {
          icon: Printer,
          badge: isEn ? 'PRO EXCLUSIVE • PDF EXPORT' : 'EXCLUSIVO PRO • EXPORTACIÓN E IMPRESIÓN',
          title: isEn ? 'Unlock Exam PDF Export & Print' : 'Desbloquea la Impresión y Exportación a PDF',
          subtitle: isEn
            ? 'Exporting ultra-compact exam sheets and teacher answer keys is exclusive to Flashmente PRO.'
            : 'La maquetación ultra-compacta para imprimir exámenes y solucionarios oficiales en PDF es una función 100% exclusiva de Flashmente PRO.',
        };
      default:
        return {
          icon: Sparkles,
          badge: isEn ? 'FLASHCARDS PRO' : 'FLASHCARDS PRO',
          title: isEn ? 'Unlock Limitless Superpowers' : 'Desbloquea el poder sin límites',
          subtitle: isEn
            ? 'Boost your memory and pass your exams with unlimited AI generations, Gemini Flash and FSRS-5.'
            : 'Impulsa tu memoria y aprueba tus exámenes con inteligencia artificial ilimitada y algoritmo cognitivo FSRS-5.',
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
          {/* =========================================================================
              MODAL DE LÍMITE AGOTADO: ALERTA SUPERIOR
             ========================================================================= */}
          {isLimitReached && (
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs sm:text-sm flex items-start gap-3 animate-in fade-in">
              <AlertTriangle className="w-5 h-5 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-amber-950 dark:text-white">
                  {userLimits?.tier === 'pro' || userLimits?.tier === 'vip'
                    ? 'Has alcanzado el límite mensual de tu Plan PRO (120 generaciones)'
                    : t('pro_modal.limit_reached_title', 'Has agotado tu saldo de generaciones disponibles')}
                </p>
                <p className="text-amber-800 dark:text-amber-200/90 text-xs leading-relaxed">
                  {userLimits?.tier === 'pro' || userLimits?.tier === 'vip'
                    ? 'Has completado las 120 generaciones de tu suscripción PRO para este ciclo. Tu cuota se reiniciará automáticamente el primer día del próximo mes.'
                    : 'Para continuar generando inmediatamente sin pausas ni esperas, suscríbete al Plan PRO (3,50 €/mes con generaciones ilimitadas).'}
                </p>
              </div>
            </div>
          )}

          {/* Header con Badges */}
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
                — Gemini Flash & FSRS-5
              </span>
            </h2>

            <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed max-w-lg">
              {featureInfo.subtitle}
            </p>
          </div>

          {/* =========================================================================
              CASO 1: MODAL DE LÍMITE AGOTADO (isLimitReached === true)
              Estructura jerárquica: Nivel 1 Stripe PRO vs. Nivel 2 Rewarded Ads / Info
             ========================================================================= */}
          {isLimitReached ? (
            <div className="space-y-3.5 animate-in fade-in">
              {/* =======================================================
                  ANDORID NATIVO: NIVEL 1 (PRO STRIPE) + NIVEL 2 (ADMOB)
                 ======================================================= */}
              {platform.isNativeAndroid ? (
                <div className="space-y-3.5">
                  {/* NIVEL 1 (PRIORITARIO / BOTÓN PRINCIPAL): PLAN PRO STRIPE */}
                  <div className="relative p-5 rounded-2xl bg-gradient-to-b from-purple-50/80 via-white to-purple-50/40 dark:from-purple-950/40 dark:to-neutral-900 border-2 border-purple-500 shadow-xl shadow-purple-500/10 dark:shadow-purple-950/40 space-y-3.5">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-500/30 border border-purple-300 dark:border-purple-400/50 text-purple-800 dark:text-purple-200 text-[10px] font-bold uppercase tracking-wider">
                          <Sparkles className="w-3 h-3 text-purple-600 dark:text-purple-300" />
                          OPCIÓN RECOMENDADA • SIN LÍMITES
                        </div>
                        <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                          Flashmente PRO Ilimitado
                        </h3>
                        <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-snug">
                          Generaciones ilimitadas con Gemini Flash sin esperas, sin pausas y desbloqueo total de PDF, Audio y YouTube.
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

                    {/* BOTÓN PRINCIPAL: CHECKOUT STRIPE */}
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
                          <span>Activar Plan PRO — 3,50 €/mes</span>
                          <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                        </>
                      )}
                    </button>

                    {stripeNotice && (
                      <div className="p-2.5 rounded-xl bg-purple-100 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-500/30 text-purple-800 dark:text-purple-200 text-xs text-center animate-in fade-in">
                        <p>{stripeNotice}</p>
                      </div>
                    )}
                  </div>

                  {/* NIVEL 2 (SECUNDARIO / BOTÓN INFERIOR): ADMOB REWARDED VIDEO */}
                  <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-950/70 border border-neutral-200 dark:border-neutral-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300">
                          <Tv className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-bold text-amber-800 dark:text-amber-200 uppercase tracking-wider">
                          Google AdMob • Recompensa
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-300 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-300 font-bold text-[10px]">
                        +1 GENERACIÓN GRATIS
                      </span>
                    </div>

                    <div className="space-y-0.5">
                      <h4 className="text-xs font-bold text-neutral-900 dark:text-white">
                        O mira un vídeo corto para obtener 1 generación gratis
                      </h4>
                      <p className="text-[11px] text-neutral-600 dark:text-neutral-400 leading-relaxed">
                        Completa la visualización de un anuncio patrocinado para recibir +1 generación inmediata en tu saldo.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleWatchAd}
                      disabled={isWatchingAd}
                      className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-900 dark:text-neutral-100 font-semibold text-xs active:scale-[0.99] transition cursor-pointer disabled:opacity-60"
                    >
                      {isWatchingAd ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-neutral-900 dark:border-white border-t-transparent rounded-full animate-spin" />
                          <span>{t('pro_modal.admob_watching', 'Reproduciendo anuncio...')}</span>
                        </>
                      ) : (
                        <>
                          <PlayCircle className="w-4 h-4 text-amber-500" />
                          <span>Ver Vídeo Corto (+1 Generación Gratis)</span>
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
                </div>
              ) : platform.isIOS ? (
                /* =======================================================
                   IPHONE / IOS: BOTÓN STRIPE + CAPTURA DE WAITLIST APP STORE
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
                          Plan Mensual Ilimitado
                        </h3>
                        <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-snug">
                          Generaciones ilimitadas en Safari sin pausas ni esperas con acceso a todas las funciones premium.
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
                          <span>Suscribirse ahora — 3,50 €/mes</span>
                          <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                        </>
                      )}
                    </button>

                    {stripeNotice && (
                      <div className="p-2.5 rounded-xl bg-purple-100 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-500/30 text-purple-800 dark:text-purple-200 text-xs text-center animate-in fade-in">
                        <p>{stripeNotice}</p>
                      </div>
                    )}
                  </div>

                  {/* Módulo Lista de Espera App Store */}
                  <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-950/80 border border-neutral-200 dark:border-neutral-800 space-y-3 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-neutral-200 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200">
                          <Apple className="w-4 h-4" />
                        </div>
                        <h4 className="text-xs font-bold text-neutral-900 dark:text-white">
                          Próximamente en Apple App Store (iOS)
                        </h4>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-500/20 text-purple-800 dark:text-purple-300 font-bold text-[9px] uppercase tracking-wider">
                        EN DESARROLLO
                      </span>
                    </div>

                    <p className="text-[11px] text-neutral-600 dark:text-neutral-300 leading-relaxed">
                      La app nativa de Flashmente para iPhone y iPad llegará próximamente al App Store. Déjanos tu correo y te notificaremos en cuanto la app esté publicada:
                    </p>

                    {iosSubmitted ? (
                      <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2 animate-in fade-in">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span className="font-medium">
                          ¡Anotado! Te avisaremos al lanzar la app oficial en la App Store.
                        </span>
                      </div>
                    ) : (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const targetEmail = (iosEmail || user?.email || '').trim();
                          if (targetEmail) {
                            try {
                              localStorage.setItem('flashmente_ios_waitlist_email', targetEmail);
                            } catch {}
                            setIosSubmitted(true);
                          }
                        }}
                        className="flex gap-2"
                      >
                        <input
                          type="email"
                          value={iosEmail}
                          onChange={(e) => setIosEmail(e.target.value)}
                          placeholder={user?.email || 'tu-email@ejemplo.com'}
                          required
                          className="flex-1 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 focus:border-purple-500 rounded-xl px-3 py-1.5 text-xs text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none transition"
                        />
                        <button
                          type="submit"
                          className="px-3.5 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-neutral-900 font-semibold text-xs transition active:scale-95 cursor-pointer shrink-0"
                        >
                          Avisarme
                        </button>
                      </form>
                    )}

                    <div className="pt-0.5 text-center sm:text-left">
                      <a
                        href="mailto:soporte@flashmente.com?subject=Interés%20App%20iOS%20Flashmente"
                        className="text-[11px] text-purple-600 dark:text-purple-400 hover:underline inline-flex items-center gap-1"
                      >
                        <Mail className="w-3 h-3" />
                        <span>¿Preguntas sobre iOS? Escríbenos a soporte@flashmente.com</span>
                      </a>
                    </div>
                  </div>
                </div>
              ) : (
                /* =======================================================
                   PC / MAC / WEB: BOTÓN STRIPE + MENSAJE DE APP ANDROID
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
                          Plan Mensual Ilimitado
                        </h3>
                        <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-snug">
                          Generaciones con IA ilimitadas. Sin anuncios, máxima velocidad y cancelación flexible en cualquier momento.
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
                          <span>Suscribirse ahora — 3,50 €/mes</span>
                          <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                        </>
                      )}
                    </button>

                    {stripeNotice && (
                      <div className="p-2.5 rounded-xl bg-purple-100 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-500/30 text-purple-800 dark:text-purple-200 text-xs text-center animate-in fade-in">
                        <p>{stripeNotice}</p>
                      </div>
                    )}
                  </div>

                  {/* Mensaje Informativo de Android en Web */}
                  <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-950/80 border border-neutral-200 dark:border-neutral-800 space-y-2 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                          <Smartphone className="w-4 h-4" />
                        </div>
                        <h4 className="text-xs font-bold text-neutral-900 dark:text-white">
                          Opción Gratuita: Genera desde la App Android
                        </h4>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 font-bold text-[9px] uppercase tracking-wider">
                        SIN COSTE
                      </span>
                    </div>

                    <p className="text-[11px] text-neutral-600 dark:text-neutral-300 leading-relaxed">
                      ¿Prefieres no suscribirte? Recuerda que puedes obtener generaciones gratuitas viendo anuncios cortos de vídeo desde nuestra aplicación oficial de Android. Tus mazos se sincronizan automáticamente en tu cuenta.
                    </p>
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
              {/* Tarjeta Plan Mensual Ilimitado (3,50€/mes) */}
              <div className="relative p-5 sm:p-6 rounded-2xl bg-gradient-to-b from-purple-50/80 via-white to-purple-50/40 dark:from-purple-900/40 dark:to-neutral-900 border-2 border-purple-500 shadow-xl shadow-purple-500/10 dark:shadow-purple-950/40 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-500/30 border border-purple-300 dark:border-purple-400/50 text-purple-800 dark:text-purple-200 text-[10px] font-bold uppercase tracking-wider">
                      <Sparkles className="w-3 h-3 text-purple-600 dark:text-purple-300" />
                      SUSCRIPCIÓN FLASHMENTE PRO
                    </div>
                    <h3 className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white">
                      Plan Mensual Ilimitado
                    </h3>
                    <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed max-w-md">
                      Acceso total a generación con IA, lectura de PDF/Audio/YouTube, maquetación de exámenes y algoritmo FSRS sin restricciones.
                    </p>
                  </div>

                  <div className="text-right pl-3 shrink-0">
                    <div className="flex items-baseline justify-end gap-0.5">
                      <span className="text-3xl sm:text-4xl font-black text-neutral-900 dark:text-white tracking-tight">3,50€</span>
                      <span className="text-xs font-semibold text-purple-600 dark:text-purple-300">/mes</span>
                    </div>
                    <span className="text-[10px] text-neutral-500 dark:text-neutral-400 block mt-0.5">Sin permanencia</span>
                  </div>
                </div>

                {/* BOTÓN DIRECTO A STRIPE */}
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
              </div>
            </div>
          )}

          {/* =========================================================================
              CANJEAR CÓDIGO PROMOCIONAL O VIP (Disponible en ambos modos)
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
                      'Sube documentos extensos (PDF, Word), notas de audio y vídeos de YouTube sin límites.'
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
                      'Modelos Gemini ultra-rápidos con memoria anti-duplicados y retención científica FSRS v5.'
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
