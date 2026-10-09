'use client';

import React, { useState } from 'react';
import { useAuthStore, useCardStore, useDeckStore, useProModalStore, useLanguageStore } from '@/stores';
import { generateCardsFromUrlAction } from '@/app/actions/generateCards';
import type { CardFormat, GeneratedCard } from '@/types/cards';
import { FormattedCardView } from './FormattedCardView';

interface UrlCardGeneratorProps {
  deckId: string;
  onSuccess?: (cardsCount: number) => void;
  onCancel?: () => void;
}

export function UrlCardGenerator({ deckId, onSuccess, onCancel }: UrlCardGeneratorProps) {
  const { user } = useAuthStore();
  const { cards, createCard, fetchCardsByDeck } = useCardStore();
  const { fetchDeckById } = useDeckStore();
  const { openProModal } = useProModalStore();
  const { language, t } = useLanguageStore();

  const [url, setUrl] = useState('');
  const [cardFormat, setCardFormat] = useState<CardFormat>('basic');
  const [cardCount, setCardCount] = useState<number>(10);
  const [customPrompt, setCustomPrompt] = useState('');

  // Status flow: idle -> analyzing -> saving -> success | error
  const [status, setStatus] = useState<'idle' | 'analyzing' | 'saving' | 'success' | 'error'>('idle');
  const [statusStep, setStatusStep] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState<number>(0);
  const [coreExhausted, setCoreExhausted] = useState<boolean>(false);
  const [generatedCardsPreview, setGeneratedCardsPreview] = useState<GeneratedCard[]>([]);

  // Detectar dinámicamente si es YouTube o URL web
  const trimmedUrl = url.trim().toLowerCase();
  const isYouTube = trimmedUrl.includes('youtube.com') || trimmedUrl.includes('youtu.be');
  const isWebUrl = trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://') || trimmedUrl.includes('.');

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text.trim());
        setErrorMessage(null);
      }
    } catch {
      // Ignorar fallo de permisos del portapapeles
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      setErrorMessage(t('url_generator.notice_title', 'Aviso al procesar enlace:'));
      return;
    }

    if (!user) {
      setErrorMessage(language === 'en' ? 'You must be logged in to save cards to your deck.' : 'Debes iniciar sesión para guardar tarjetas en tu mazo.');
      return;
    }

    try {
      setErrorMessage(null);
      setStatus('analyzing');
      setStatusStep(language === 'en' ? 'Analyzing web link and extracting content with Gemini...' : 'Analizando enlace web y extrayendo contenido con Gemini...');

      // Consultar historial de tarjetas existentes para Memoria Anti-Duplicados
      const existingCardsInDeck = cards.map((c) => c.front);

      // Llamar al Server Action con el idioma activo
      const result = await generateCardsFromUrlAction({
        url: url.trim(),
        deckId,
        cardFormat,
        cardCount,
        customPrompt: customPrompt.trim() ? customPrompt.trim() : undefined,
        existingQuestions: existingCardsInDeck,
        language,
      });

      if (!result.success || !result.cards) {
        if (result.error === 'LIMIT_REACHED') {
          openProModal(true);
        }
        setStatus('error');
        setErrorMessage(result.error || (language === 'en' ? 'Could not generate cards from this link.' : 'No se pudieron generar tarjetas a partir de este enlace.'));
        return;
      }

      setCoreExhausted(Boolean(result.core_exhausted));
      setGeneratedCardsPreview(result.cards);

      // Guardar secuencialmente en Supabase mediante Zustand
      setStatus('saving');
      setStatusStep(language === 'en' ? `Saving ${result.cards.length} cards to Supabase...` : `Guardando ${result.cards.length} tarjetas en Supabase...`);

      let savedCount = 0;
      for (const card of result.cards) {
        const backValue =
          card.cardFormat === 'cloze' && !card.back ? card.front : card.back;

        const created = await createCard(
          deckId,
          card.front,
          backValue,
          card.cardFormat === 'cloze' ? 'cloze' : 'basic',
          card.cardFormat
        );

        if (created) {
          savedCount++;
        }
      }

      setSuccessCount(savedCount);
      setStatus('success');

      // Actualizar mazo y llamar callback
      await fetchDeckById(deckId);
      await fetchCardsByDeck(deckId);

      if (onSuccess) {
        onSuccess(savedCount);
      }
    } catch (err: unknown) {
      console.error('Error generating cards from url:', err);
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : (language === 'en' ? 'Unexpected error processing link.' : 'Error inesperado al procesar el enlace.'));
    }
  };

  const handleReset = () => {
    setUrl('');
    setCustomPrompt('');
    setStatus('idle');
    setErrorMessage(null);
    setSuccessCount(0);
    setCoreExhausted(false);
    setGeneratedCardsPreview([]);
  };

  const isBusy = status === 'analyzing' || status === 'saving';

  return (
    <div className="w-full space-y-5">
      {/* Error Banner Amigable */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs sm:text-sm flex flex-col sm:flex-row items-start justify-between gap-3 animate-in fade-in">
          <div className="flex items-start gap-2.5">
            <svg className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="leading-relaxed">
              <strong className="font-semibold block text-rose-200 mb-0.5">{t('url_generator.notice_title', 'Aviso al procesar enlace:')}</strong>
              {errorMessage}
            </div>
          </div>
          {cardCount > 10 && (
            <button
              type="button"
              onClick={() => {
                setCardCount(10);
                setErrorMessage(null);
              }}
              className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 transition border border-rose-500/30"
            >
              {t('url_generator.try_with_10', 'Probar con 10 tarjetas')}
            </button>
          )}
        </div>
      )}

      {/* Éxito: Vista Previa y Confirmación */}
      {status === 'success' ? (
        <div className="space-y-4 animate-in fade-in">
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">
                  {t('url_generator.success_title', '¡{count} tarjetas creadas y guardadas con éxito!').replace('{count}', String(successCount))}
                </h4>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {t('url_generator.success_desc', 'Las tarjetas han sido agregadas a tu mazo y están listas para estudiar con FSRS.')}
                </p>
              </div>
            </div>

            <button
              onClick={handleReset}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-800 transition"
            >
              {t('url_generator.generate_another_batch', 'Generar otro lote')}
            </button>
          </div>

          {/* Banner de Temas Troncales Agotados */}
          {coreExhausted && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs sm:text-sm flex items-start gap-3 shadow-lg shadow-amber-950/20">
              <span className="text-xl shrink-0 mt-0.5">🎯</span>
              <div className="space-y-1">
                <h5 className="font-semibold text-amber-300">
                  {t('url_generator.core_covered_title', 'Conceptos troncales principales cubiertos')}
                </h5>
                <p className="text-neutral-300 text-xs leading-relaxed">
                  {t('url_generator.core_covered_desc', 'Gemini ha cubierto las ideas y conceptos esenciales de este enlace. Si solicitas otro lote, la IA profundizará en detalles secundarios, matices avanzados y casos específicos.')}
                </p>
              </div>
            </div>
          )}

          {/* Preview de Tarjetas Generadas */}
          {generatedCardsPreview.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h5 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  {t('url_generator.preview_title', 'Vista previa de tarjetas generadas ({count})').replace('{count}', String(generatedCardsPreview.length))}
                </h5>
                <span className="text-[11px] text-neutral-500">
                  {cardFormat === 'basic' && `${t('url_generator.format_pedagogical', 'Formato')}: ${t('url_generator.format_basic', 'Básica')}`}
                  {cardFormat === 'cloze' && `${t('url_generator.format_pedagogical', 'Formato')}: ${t('url_generator.format_cloze', 'Huecos (Cloze)')}`}
                  {cardFormat === 'multiple_choice' && `${t('url_generator.format_pedagogical', 'Formato')}: ${t('url_generator.format_mc', 'Opción Múltiple (Test)')}`}
                </span>
              </div>
              <div className="max-h-72 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar">
                {generatedCardsPreview.map((card, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-neutral-900/90 border border-neutral-800 text-xs shadow-sm"
                  >
                    <FormattedCardView
                      front={card.front}
                      back={card.back}
                      cardFormat={card.cardFormat}
                      isRevealed={true}
                      interactive={false}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-neutral-900 hover:bg-neutral-800 text-white transition border border-neutral-800"
            >
              {t('common.close', 'Cerrar')}
            </button>
          </div>
        </div>
      ) : (
        /* Formulario de Entrada de Enlace y Parámetros */
        <form onSubmit={handleGenerate} className="space-y-5">
          {/* Input de URL */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                <svg className="w-4 h-4 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                <span>{t('url_generator.url_label', 'Enlace Web o Vídeo de YouTube')}</span>
              </label>

              <button
                type="button"
                onClick={handlePaste}
                disabled={isBusy}
                className="text-[11px] text-neutral-400 hover:text-white transition flex items-center gap-1 bg-neutral-900 hover:bg-neutral-800 px-2 py-0.5 rounded-md border border-neutral-800 disabled:opacity-50"
              >
                <svg className="w-3.5 h-3.5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <span>{t('url_generator.paste_clipboard', 'Pegar del portapapeles')}</span>
              </button>
            </div>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500">
                {isYouTube ? (
                  <span className="text-rose-500 font-bold text-sm">▶</span>
                ) : (
                  <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                )}
              </div>

              <input
                type="url"
                required
                disabled={isBusy}
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setErrorMessage(null);
                }}
                placeholder={t('url_generator.url_placeholder', 'https://www.youtube.com/watch?v=... o https://es.wikipedia.org/...')}
                className="w-full text-xs sm:text-sm pl-10 pr-9 py-3 rounded-xl bg-neutral-950 border border-neutral-800 text-white placeholder-neutral-500 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition disabled:opacity-50"
              />

              {url && !isBusy && (
                <button
                  type="button"
                  onClick={() => setUrl('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-500 hover:text-white transition"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Badges de detección dinámica */}
            {isYouTube && (
              <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-300 text-[11px] flex items-center gap-2">
                <span className="font-bold text-rose-400 text-xs">▶ YouTube</span>
                <span>{t('url_generator.youtube_detected', 'Vídeo detectado: Gemini analizará el contenido del vídeo directamente en la nube de Google para generar las tarjetas.')}</span>
              </div>
            )}

            {!isYouTube && isWebUrl && (
              <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/25 text-sky-300 text-[11px] flex items-center gap-2">
                <span className="font-bold text-sky-400 text-xs">🌐 {t('deck_detail.tab_url', 'Enlace Web')}</span>
                <span>{t('url_generator.web_detected', 'Página detectada: se extraerá el artículo o texto principal para generar el material de estudio.')}</span>
              </div>
            )}
          </div>

          {/* Formato de Tarjetas */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-300">
              {t('url_generator.format_pedagogical', 'Formato Pedagógico')}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => setCardFormat('basic')}
                className={`p-3 rounded-xl text-left border transition-all ${
                  cardFormat === 'basic'
                    ? 'border-rose-500 bg-rose-600/10 text-white shadow-sm'
                    : 'border-neutral-800 bg-neutral-950 hover:border-neutral-700 text-neutral-300'
                }`}
              >
                <div className="font-semibold text-xs flex items-center justify-between">
                  <span>{t('url_generator.format_basic', 'Básicas')}</span>
                  {cardFormat === 'basic' && <span className="text-rose-400 text-xs">●</span>}
                </div>
                <p className="text-[11px] text-neutral-400 mt-1 leading-snug">
                  {t('url_generator.format_basic_desc', 'Pregunta directa y respuesta concisa')}
                </p>
              </button>

              <button
                type="button"
                disabled={isBusy}
                onClick={() => setCardFormat('cloze')}
                className={`p-3 rounded-xl text-left border transition-all ${
                  cardFormat === 'cloze'
                    ? 'border-emerald-500 bg-emerald-600/10 text-white shadow-sm'
                    : 'border-neutral-800 bg-neutral-950 hover:border-neutral-700 text-neutral-300'
                }`}
              >
                <div className="font-semibold text-xs flex items-center justify-between">
                  <span>{t('url_generator.format_cloze', 'Huecos (Cloze)')}</span>
                  {cardFormat === 'cloze' && <span className="text-emerald-400 text-xs">●</span>}
                </div>
                <p className="text-[11px] text-neutral-400 mt-1 leading-snug">
                  {t('url_generator.format_cloze_desc', 'Completar conceptos clave entre corchetes')}
                </p>
              </button>

              <button
                type="button"
                disabled={isBusy}
                onClick={() => setCardFormat('multiple_choice')}
                className={`p-3 rounded-xl text-left border transition-all ${
                  cardFormat === 'multiple_choice'
                    ? 'border-indigo-500 bg-indigo-600/10 text-white shadow-sm'
                    : 'border-neutral-800 bg-neutral-950 hover:border-neutral-700 text-neutral-300'
                }`}
              >
                <div className="font-semibold text-xs flex items-center justify-between">
                  <span>{t('url_generator.format_mc', 'Opción Múltiple')}</span>
                  {cardFormat === 'multiple_choice' && <span className="text-indigo-400 text-xs">●</span>}
                </div>
                <p className="text-[11px] text-neutral-400 mt-1 leading-snug">
                  {t('url_generator.format_mc_desc', 'Pregunta test con 4 alternativas y solución')}
                </p>
              </button>
            </div>
          </div>

          {/* Cantidad de Tarjetas e Instrucción de Enfoque */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-300 flex items-center justify-between">
                <span>{t('url_generator.count_batch_label', 'Cantidad por Lote (Máx. 30)')}</span>
                <span className="text-neutral-500 text-[11px] font-normal">{t('url_generator.count_recommended', 'Recomendado: 10')}</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={30}
                  disabled={isBusy}
                  value={cardCount}
                  onChange={(e) => {
                    const rawVal = e.target.value;
                    if (rawVal === '') {
                      setCardCount(1);
                      return;
                    }
                    const val = parseInt(rawVal, 10);
                    if (!isNaN(val)) {
                      setCardCount(Math.min(30, Math.max(1, val)));
                    }
                  }}
                  className="w-24 text-xs font-semibold px-3 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-white focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition disabled:opacity-50"
                />
                <div className="flex items-center gap-1">
                  {[5, 10, 15, 20].map((num) => (
                    <button
                      key={num}
                      type="button"
                      disabled={isBusy}
                      onClick={() => setCardCount(num)}
                      className={`text-xs px-2.5 py-2 rounded-lg font-mono transition border ${
                        cardCount === num
                          ? 'bg-rose-500/20 border-rose-500/50 text-rose-300'
                          : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-300">
                {t('url_generator.focus_label', 'Instrucción de Enfoque (Opcional)')}
              </label>
              <input
                type="text"
                disabled={isBusy}
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder={t('url_generator.focus_placeholder', 'Ej. Centrarse en la conclusión, fórmulas o minuto 5 al 12')}
                className="w-full text-xs px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-white placeholder-neutral-500 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition disabled:opacity-50"
              />
            </div>
          </div>

          {/* Estado de carga / Progreso */}
          {isBusy && (
            <div className="p-4 rounded-xl bg-neutral-950 border border-rose-500/30 space-y-2.5 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-rose-500 border-t-transparent rounded-full animate-spin shrink-0" />
                <span className="text-xs font-medium text-rose-300">
                  {statusStep}
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-neutral-900 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-rose-500 to-indigo-500 w-2/3 rounded-full animate-pulse" />
              </div>
            </div>
          )}

          {/* Botones de acción */}
          <div className="pt-2 flex items-center justify-end gap-3">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={isBusy}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white transition border border-neutral-800 disabled:opacity-50"
              >
                {t('common.cancel', 'Cancelar')}
              </button>
            )}

            <button
              type="submit"
              disabled={isBusy || !url.trim()}
              className="px-6 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-rose-600 via-rose-500 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 text-white transition shadow-lg shadow-rose-950/40 disabled:opacity-50 flex items-center gap-2"
            >
              {isBusy ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>{t('url_generator.processing_btn', 'Procesando...')}</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>{t('url_generator.generate_btn', 'Generar {count} Tarjetas desde Enlace').replace('{count}', String(cardCount))}</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
