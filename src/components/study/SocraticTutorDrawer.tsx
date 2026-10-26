'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ArrowRight, Sparkles, Loader2, AlertCircle, Video, CheckCircle2, Send } from 'lucide-react';
import { useLanguageStore, useAuthStore } from '@/stores';
import { askSocraticTutorAction, getTutorQuotaStatusAction, type TutorQuotaStatus } from '@/app/actions/socraticTutor';
import { showAdMobRewardedAd } from '@/lib/admob';
import { claimAdRewardAction } from '@/app/actions/claimAdReward';

interface SocraticTutorDrawerProps {
  isOpen: boolean;
  deckTitle: string;
  question: string;
  options?: string[];
  correctAnswer: string;
  selectedAnswer?: string;
  onContinue: () => void;
}

export function SocraticTutorDrawer({
  isOpen,
  deckTitle,
  question,
  options,
  correctAnswer,
  selectedAnswer,
  onContinue,
}: SocraticTutorDrawerProps) {
  const { t, language } = useLanguageStore();
  const { user } = useAuthStore();

  const [quotaStatus, setQuotaStatus] = useState<TutorQuotaStatus | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isWatchingAd, setIsWatchingAd] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Estados para el turno único de repregunta interactiva
  const [followUpInput, setFollowUpInput] = useState('');
  const [followUpReply, setFollowUpReply] = useState<string | null>(null);
  const [isAskingFollowUp, setIsAskingFollowUp] = useState(false);
  const [hasAskedFollowUp, setHasAskedFollowUp] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);

  // Cargar cuota del tutor al abrirse
  const fetchQuota = useCallback(async () => {
    try {
      const status = await getTutorQuotaStatusAction(user?.id);
      setQuotaStatus(status);
    } catch (err) {
      console.warn('Error al obtener estado de cuota del tutor:', err);
    }
  }, [user?.id]);

  useEffect(() => {
    if (isOpen) {
      setExplanation(null);
      setErrorMsg(null);
      setFollowUpInput('');
      setFollowUpReply(null);
      setIsAskingFollowUp(false);
      setHasAskedFollowUp(false);
      setFollowUpError(null);
      fetchQuota();
    }
  }, [isOpen, question, fetchQuota]);

  // Manejar consulta inicial al Tutor Socrático
  const handleAskTutor = async () => {
    setErrorMsg(null);

    // Si es usuario Free y requiere ver anuncio
    if (quotaStatus && !quotaStatus.isPro && quotaStatus.requiresAd) {
      try {
        setIsWatchingAd(true);
        const adResult = await showAdMobRewardedAd();
        if (adResult.completed) {
          const claim = await claimAdRewardAction(user?.id);
          if (!claim.success) {
            setErrorMsg(claim.message || t('socratic_tutor.ad_failed', 'Debes completar el anuncio para consultar al tutor.'));
            setIsWatchingAd(false);
            return;
          }
          // Actualizar estado de cuota
          await fetchQuota();
        } else {
          setErrorMsg(adResult.error || t('socratic_tutor.ad_failed', 'Debes completar el anuncio para consultar al tutor.'));
          setIsWatchingAd(false);
          return;
        }
      } catch (adErr) {
        console.warn('Error en flujo de anuncio recompensado:', adErr);
        setErrorMsg(t('socratic_tutor.ad_failed', 'Debes completar el anuncio para consultar al tutor.'));
        setIsWatchingAd(false);
        return;
      } finally {
        setIsWatchingAd(false);
      }
    }

    // Iniciar consulta a Gemini con el Server Action
    setIsLoading(true);
    try {
      const res = await askSocraticTutorAction({
        deckTitle,
        question,
        options,
        correctAnswer,
        selectedAnswer,
        locale: language === 'en' ? 'en' : 'es',
        userId: user?.id,
      });

      if (res.success && res.explanation) {
        setExplanation(res.explanation);
        // Actualizar cuota localmente
        setQuotaStatus((prev) =>
          prev
            ? {
                ...prev,
                count: prev.count + 1,
                remainingFree: typeof res.remainingFree === 'number' ? res.remainingFree : Math.max(0, prev.remainingFree - 1),
                requiresAd: !prev.isPro && (typeof res.remainingFree === 'number' ? res.remainingFree <= 0 : prev.remainingFree - 1 <= 0) && prev.bonusCredits <= 0,
              }
            : null
        );
      } else if (res.error === 'AD_REQUIRED') {
        // Exigir anuncio
        setQuotaStatus((prev) => (prev ? { ...prev, requiresAd: true, remainingFree: 0 } : null));
        setErrorMsg(t('socratic_tutor.badge_ad_required', 'Ver anuncio (+1)'));
      } else {
        setErrorMsg(res.error || t('socratic_tutor.error_generic', 'No se pudo consultar al tutor en este momento.'));
      }
    } catch (err) {
      console.error('Error al consultar tutor socrático:', err);
      setErrorMsg(t('socratic_tutor.error_generic', 'No se pudo consultar al tutor en este momento.'));
    } finally {
      setIsLoading(false);
    }
  };

  // Manejar el micro-diálogo de 1 repregunta adicional
  const handleSendFollowUp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = followUpInput.trim();
    if (!trimmed || isAskingFollowUp || hasAskedFollowUp || !explanation) return;

    setIsAskingFollowUp(true);
    setFollowUpError(null);

    try {
      const res = await askSocraticTutorAction({
        deckTitle,
        question,
        options,
        correctAnswer,
        selectedAnswer,
        locale: language === 'en' ? 'en' : 'es',
        userId: user?.id,
        followUpQuestion: trimmed,
        previousExplanation: explanation,
      });

      if (res.success && res.explanation) {
        setFollowUpReply(res.explanation);
        setHasAskedFollowUp(true);
        setFollowUpInput('');
      } else {
        setFollowUpError(res.error || t('socratic_tutor.error_generic', 'No se pudo consultar al tutor en este momento.'));
      }
    } catch (err) {
      console.error('Error al enviar repregunta socrática:', err);
      setFollowUpError(t('socratic_tutor.error_generic', 'No se pudo consultar al tutor en este momento.'));
    } finally {
      setIsAskingFollowUp(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      id="socratic-tutor-container"
      className="w-full mt-2.5 sm:mt-3.5 p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-amber-500/10 via-indigo-500/5 to-violet-500/10 dark:from-amber-950/20 dark:via-indigo-950/15 dark:to-violet-950/20 border border-amber-500/30 dark:border-amber-500/40 shadow-lg animate-in slide-in-from-bottom-2 duration-200 transition-all text-left"
    >
      {/* Estado: Aún no se ha solicitado explicación */}
      {!explanation && !isLoading && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3">
          {/* Botón principal del Tutor */}
          <button
            type="button"
            onClick={handleAskTutor}
            disabled={isWatchingAd}
            className="flex-1 py-2.5 sm:py-3 px-3 sm:px-4 rounded-xl sm:rounded-2xl bg-amber-500/20 hover:bg-amber-500/30 active:bg-amber-500/40 text-amber-800 dark:text-amber-200 border border-amber-500/40 hover:border-amber-500/60 transition-all duration-150 flex items-center justify-between gap-2 group cursor-pointer active:scale-[0.99] shadow-sm min-w-0"
          >
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-shrink-0">
              <span className="text-xl sm:text-2xl shrink-0 group-hover:scale-110 transition-transform">
                🦉
              </span>
              <span className="font-bold text-xs sm:text-sm whitespace-nowrap">
                {t('socratic_tutor.trigger_short', '¿Por qué fallé?')}
                <span className="hidden sm:inline"> {t('socratic_tutor.trigger_suffix', '(Tutor Socrático)')}</span>
              </span>
            </div>

            {/* Badge contextual de cuota */}
            {quotaStatus && (
              <span className="shrink-0 flex-shrink-0 text-[10px] sm:text-xs font-semibold px-2 py-0.5 sm:py-1 rounded-full border transition-all whitespace-nowrap bg-amber-500/15 border-amber-500/30 text-amber-800 dark:text-amber-200 flex items-center gap-1">
                {quotaStatus.isPro ? (
                  <>
                    <span>👑</span>
                    <span className="hidden sm:inline">{t('socratic_tutor.badge_pro', 'PRO Ilimitado')}</span>
                    <span className="sm:hidden">{t('socratic_tutor.badge_pro_short', 'PRO')}</span>
                  </>
                ) : quotaStatus.requiresAd ? (
                  <>
                    <Video className="w-3 h-3 text-amber-600 dark:text-amber-300 shrink-0" />
                    <span>{t('socratic_tutor.badge_ad_required', 'Ver anuncio (+1)')}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
                    <span>
                      {quotaStatus.remainingFree === 1
                        ? t('socratic_tutor.badge_free_singular', '1 gratis este mes')
                        : t('socratic_tutor.badge_free_count', { count: quotaStatus.remainingFree })}
                    </span>
                  </>
                )}
              </span>
            )}
          </button>

          {/* Botón rápido para continuar sin consultar (Dark Premium) */}
          <button
            type="button"
            onClick={onContinue}
            className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700/80 px-4 py-2.5 rounded-xl font-medium transition-all shadow-sm flex items-center justify-center gap-2 hover:text-white shrink-0 active:scale-[0.98] cursor-pointer text-xs sm:text-sm"
          >
            <span>{t('socratic_tutor.continue_short', 'Continuar')}</span>
            <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <kbd className="hidden md:inline-block px-1.5 py-0.5 rounded bg-neutral-700/80 text-neutral-300 text-[10px] font-mono ml-1">
              Espacio
            </kbd>
          </button>
        </div>
      )}

      {/* Estado: Cargando anuncio de video */}
      {isWatchingAd && (
        <div className="py-3 px-4 flex items-center gap-3 text-xs sm:text-sm font-medium text-amber-800 dark:text-amber-200 animate-pulse">
          <Loader2 className="w-4 h-4 animate-spin text-amber-600 dark:text-amber-400" />
          <span>{t('socratic_tutor.watching_ad', 'Cargando anuncio para desbloquear consulta...')}</span>
        </div>
      )}

      {/* Estado: Cargando respuesta de Gemini (Skeleton sutil) */}
      {isLoading && (
        <div className="space-y-3 py-1 animate-in fade-in">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-semibold text-indigo-700 dark:text-indigo-300">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-400" />
            <span>{t('socratic_tutor.loading_tutor', 'El Tutor Socrático está analizando tu razonamiento...')}</span>
          </div>
          <div className="space-y-2">
            <div className="h-3.5 bg-indigo-500/10 dark:bg-indigo-500/20 rounded-full w-full animate-pulse" />
            <div className="h-3.5 bg-indigo-500/10 dark:bg-indigo-500/20 rounded-full w-5/6 animate-pulse" />
            <div className="h-3.5 bg-indigo-500/10 dark:bg-indigo-500/20 rounded-full w-3/4 animate-pulse" />
          </div>
        </div>
      )}

      {/* Estado: Mensaje de error si falló */}
      {errorMsg && !isLoading && !explanation && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2 mt-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Estado: Explicación Socrática Recibida */}
      {explanation && !isLoading && (
        <div className="space-y-3 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-amber-500/30 dark:border-amber-500/20 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">🦉</span>
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-neutral-900 dark:text-white leading-tight">
                  {t('socratic_tutor.title', 'Explicación Socrática')}
                </h4>
                <p className="text-[10px] sm:text-[11px] text-amber-700 dark:text-amber-300/80">
                  {t('socratic_tutor.subtitle', 'Comprensión de raíz y trampa conceptual')}
                </p>
              </div>
            </div>

            {quotaStatus?.isPro ? (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 shrink-0 whitespace-nowrap">
                👑 PRO
              </span>
            ) : (
              <span className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400 shrink-0 whitespace-nowrap">
                {quotaStatus?.remainingFree !== undefined
                  ? t('socratic_tutor.badge_free_count', { count: quotaStatus.remainingFree })
                  : ''}
              </span>
            )}
          </div>

          {/* Texto de la primera explicación socrática */}
          <div className="p-3 sm:p-3.5 rounded-xl bg-white/70 dark:bg-neutral-900/80 border border-neutral-200/80 dark:border-neutral-800/80 shadow-sm">
            <p className="text-xs sm:text-sm leading-relaxed text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap font-medium">
              {explanation}
            </p>
          </div>

          {/* Turno de Repregunta Socrática: Respuesta si ya fue respondida */}
          {followUpReply && (
            <div className="p-3 sm:p-3.5 rounded-xl bg-amber-500/10 dark:bg-amber-950/30 border border-amber-500/30 shadow-sm space-y-1.5 animate-in fade-in duration-200">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-800 dark:text-amber-200">
                <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>{t('socratic_tutor.followup_title', 'Aclaración del Tutor')}</span>
              </div>
              <p className="text-xs sm:text-sm leading-relaxed text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap font-medium">
                {followUpReply}
              </p>
            </div>
          )}

          {/* Cargando respuesta de la repregunta */}
          {isAskingFollowUp && (
            <div className="py-2.5 px-3.5 rounded-xl bg-amber-500/10 dark:bg-amber-950/20 border border-amber-500/30 flex items-center gap-2.5 text-xs text-amber-800 dark:text-amber-200 animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin text-amber-600 dark:text-amber-400 shrink-0" />
              <span>{t('socratic_tutor.loading_followup', 'Resolviendo tu duda...')}</span>
            </div>
          )}

          {/* Error de la repregunta si hubo */}
          {followUpError && (
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{followUpError}</span>
            </div>
          )}

          {/* Caja de repregunta compacta: solo visible antes de gastar la 1 repregunta permitida */}
          {!hasAskedFollowUp && !isAskingFollowUp && (
            <form onSubmit={handleSendFollowUp} className="flex items-center gap-2 pt-0.5">
              <input
                type="text"
                value={followUpInput}
                onChange={(e) => setFollowUpInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSendFollowUp();
                  }
                }}
                placeholder={t('socratic_tutor.ask_followup_placeholder', 'Pregunta una duda sobre esta explicación...')}
                maxLength={240}
                className="flex-1 py-2 px-3 sm:px-3.5 rounded-xl bg-white/80 dark:bg-neutral-900/90 border border-neutral-300 dark:border-neutral-700/80 focus:border-amber-500/70 focus:outline-none text-xs sm:text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 transition-colors shadow-inner"
              />
              <button
                type="submit"
                disabled={!followUpInput.trim()}
                className="py-2 px-3 sm:px-3.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 active:bg-amber-500/40 disabled:opacity-40 disabled:cursor-not-allowed text-amber-800 dark:text-amber-200 border border-amber-500/40 font-medium text-xs sm:text-sm flex items-center gap-1.5 transition-all shrink-0 cursor-pointer active:scale-95 shadow-sm"
                title={t('socratic_tutor.send_btn', 'Preguntar')}
              >
                <Send className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('socratic_tutor.send_btn', 'Preguntar')}</span>
              </button>
            </form>
          )}

          {/* Botón de Avance con Estilo Dark Premium */}
          <div className="flex items-center justify-between pt-1 gap-2">
            {hasAskedFollowUp ? (
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5 shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>{t('socratic_tutor.max_turn_reached', 'Consulta socrática completada')}</span>
              </span>
            ) : (
              <div />
            )}
            <button
              type="button"
              onClick={onContinue}
              className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700/80 px-4 py-2.5 rounded-xl font-medium transition-all shadow-sm flex items-center justify-center gap-2 hover:text-white cursor-pointer active:scale-[0.98] text-xs sm:text-sm ml-auto"
            >
              <span>{t('socratic_tutor.continue_button', 'Continuar a la siguiente tarjeta')}</span>
              <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
