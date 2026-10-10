'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useDeckStore, useCardStore, useProModalStore, useAuthStore, useLanguageStore } from '@/stores';
import { CardEditor, DocumentUploader, FormattedCardView, UrlCardGenerator } from '@/components/cards';
import { ShareDeckModal } from '@/components/decks';
import { generateCardsAction } from '@/app/actions/generateCards';
import type { CardFormat } from '@/types/database';

interface DeckPageProps {
  params: Promise<{ id: string }>;
}

export default function DeckDetailPage({ params }: DeckPageProps) {
  const { id } = use(params);

  const { currentDeck, isLoading: deckLoading, fetchDeckById } = useDeckStore();
  const { cards, isLoading: cardsLoading, error, fetchCardsByDeck, createCard, deleteCard } =
    useCardStore();
  const { openProModal } = useProModalStore();
  const { user } = useAuthStore();
  const { language, t } = useLanguageStore();

  // Estado para el modal de Generación con IA (Gemini Flash)
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiMode, setAiMode] = useState<'multimodal' | 'url' | 'topic'>('multimodal');
  const [aiTopic, setAiTopic] = useState('');
  const [aiCardFormat, setAiCardFormat] = useState<CardFormat>('basic');
  const [aiCardCount, setAiCardCount] = useState<number>(10);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSuccessMessage, setAiSuccessMessage] = useState<string | null>(null);
  const [aiCoreExhausted, setAiCoreExhausted] = useState<boolean>(false);

  // Estado para el modal de Compartir Mazo
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  // Estado para el acordeón del Editor Manual de Tarjetas (cerrado por defecto para evitar saturar la pantalla)
  const [isManualEditorOpen, setIsManualEditorOpen] = useState(false);

  useEffect(() => {
    fetchDeckById(id);
    fetchCardsByDeck(id);
  }, [id, fetchDeckById, fetchCardsByDeck]);

  const handleDeleteCard = async (cardId: string) => {
    if (confirm(t('deck_detail.confirm_delete_card'))) {
      await deleteCard(cardId);
      fetchDeckById(id);
    }
  };

  const handleCardCreated = () => {
    fetchDeckById(id);
  };

  // Manejar generación con Gemini por tema y guardado automático en Supabase
  const handleGenerateCardsByTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiTopic.trim()) return;

    setIsGenerating(true);
    setAiError(null);
    setAiSuccessMessage(null);

    const existingFronts = cards && cards.length > 0 ? cards.map((c) => c.front) : [];
    const result = await generateCardsAction(
      aiTopic.trim(),
      aiCardFormat,
      aiCardCount,
      id,
      existingFronts,
      user?.id,
      language
    );

    if (!result.success || !result.cards) {
      setIsGenerating(false);
      if (result.error === 'LIMIT_REACHED') {
        openProModal(true);
        return;
      }
      setAiError(result.error || t('deck_detail.unexpected_error'));
      return;
    }

    try {
      // Guardar secuencialmente las tarjetas generadas en Supabase mediante Zustand
      for (const card of result.cards) {
        await createCard(
          id,
          card.front,
          card.back,
          card.cardFormat === 'cloze' ? 'cloze' : 'basic',
          card.cardFormat
        );
      }

      await fetchCardsByDeck(id);
      await fetchDeckById(id);

      const isExhausted = Boolean(result.core_exhausted);
      setAiCoreExhausted(isExhausted);
      if (isExhausted) {
        setAiSuccessMessage(t('deck_detail.theory_covered_desc'));
      } else {
        setAiSuccessMessage(t('deck_detail.cards_added_desc'));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('deck_detail.save_error');
      setAiError(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const stateLabels = [
    t('deck_detail.state_new'),
    t('deck_detail.state_learning'),
    t('deck_detail.state_review'),
    t('deck_detail.state_relearning'),
  ];
  const stateBadgeStyles = [
    'bg-blue-500/10 text-blue-400 border-blue-500/20',
    'bg-amber-500/10 text-amber-400 border-amber-500/20',
    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    'bg-rose-500/10 text-rose-400 border-rose-500/20',
  ];

  const formatBadges: Record<string, { label: string; style: string }> = {
    basic: { label: t('deck_detail.badge_basic'), style: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
    multiple_choice: { label: t('deck_detail.badge_mc'), style: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
    cloze: { label: t('deck_detail.badge_cloze'), style: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' },
    true_false: { label: t('deck_detail.badge_tf'), style: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Navigation & Breadcrumbs */}
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-400 hover:text-white transition group mb-3"
        >
          <svg
            className="w-4 h-4 transition-transform group-hover:-translate-x-1"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t('deck_detail.back_to_dashboard')}
        </Link>

        {/* Deck Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-neutral-800/80">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <span
                className="w-3 h-3 rounded-full shadow-md"
                style={{ backgroundColor: currentDeck?.color || '#6366f1' }}
              />
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-neutral-900 border border-neutral-800 text-neutral-400 font-mono">
                ID: {id.slice(0, 8)}...
              </span>
            </div>
            <h1 className="text-xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-white">
              {deckLoading && !currentDeck ? t('deck_detail.loading_deck') : currentDeck?.title || t('deck_detail.untitled_deck')}
            </h1>
            <p className="text-sm text-neutral-400 mt-1">
              {currentDeck?.description || t('deck_detail.cards_registered', { count: cards.length })}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Botón: Generar con IA Multimodal */}
            <button
              onClick={() => {
                setAiError(null);
                setAiSuccessMessage(null);
                setAiCoreExhausted(false);
                setAiMode('multimodal');
                setIsAiModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-violet-600 via-indigo-600 to-indigo-700 hover:from-violet-500 hover:to-indigo-600 shadow-lg shadow-violet-600/25 transition-all duration-150 active:scale-95 border border-violet-400/20"
            >
              <svg className="w-4 h-4 text-violet-200 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              <span>{t('deck_detail.generate_ai')}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-white/15 text-white font-mono tracking-tight">
                {t('deck_detail.multimodal_badge')}
              </span>
            </button>

            {/* Botón: Estudiar Mazo */}
            <Link
              href={`/study/${id}`}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all duration-150 shadow-lg ${
                cards.length === 0
                  ? 'bg-neutral-800/60 text-neutral-500 pointer-events-none border border-neutral-800'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/25 active:scale-95'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{t('deck_detail.study_deck')}{currentDeck && currentDeck.dueCount > 0 ? ` (${currentDeck.dueCount})` : ''}</span>
            </Link>

            {/* Botón: Compartir Mazo */}
            <button
              onClick={() => setIsShareModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm text-neutral-300 bg-neutral-900 hover:bg-neutral-800 hover:text-white border border-neutral-700/80 shadow-md transition-all duration-150 active:scale-95"
            >
              <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              <span>{t('deck_detail.share')}</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
          {error}
        </div>
      )}

      {/* Contenido Principal: Editor Manual Plegable y Lista de Tarjetas */}
      <div className="space-y-6">
        {/* Separador 1: Añadir tarjeta manualmente (Acordeón desplegable, cerrado por defecto) */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 overflow-hidden transition-all duration-200 shadow-sm">
          <button
            type="button"
            onClick={() => setIsManualEditorOpen(!isManualEditorOpen)}
            className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-neutral-800/40 transition group cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 flex items-center justify-center text-base shrink-0 group-hover:scale-105 transition-transform">
                ✏️
              </div>
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-bold text-white tracking-tight flex items-center gap-2">
                  <span className="truncate">{t('deck_detail.add_manual_title', 'Añadir tarjeta manualmente')}</span>
                  <span className="text-[10px] sm:text-[11px] font-normal px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 font-mono shrink-0">
                    {isManualEditorOpen ? t('common.open', 'Abierto') : t('common.collapsed', 'Plegado')}
                  </span>
                </h2>
                <p className="text-xs text-neutral-400 mt-0.5 truncate hidden sm:block">
                  {t('deck_detail.add_manual_desc', 'Crea preguntas personalizadas (Básica, Test, Cloze o V/F)')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-semibold text-neutral-400 group-hover:text-white transition shrink-0 ml-2">
              <span className="hidden sm:inline">
                {isManualEditorOpen ? t('deck_detail.hide_editor', 'Ocultar editor manual') : t('deck_detail.show_editor', 'Mostrar editor manual')}
              </span>
              <div className={`w-8 h-8 rounded-lg bg-neutral-800/80 border border-neutral-700/60 flex items-center justify-center transition-transform duration-200 ${isManualEditorOpen ? 'rotate-180' : ''}`}>
                <svg className="w-4 h-4 text-neutral-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </button>

          {isManualEditorOpen && (
            <div className="p-4 sm:p-6 border-t border-neutral-800/80 bg-neutral-950/40 animate-in fade-in duration-200">
              <CardEditor deckId={id} onCardCreated={handleCardCreated} />
            </div>
          )}
        </div>

        {/* Separador 2: Tarjetas en este mazo */}
        <div className="space-y-4 pt-1">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-800/80">
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2.5">
              <span>🃏 {t('deck_detail.cards_in_deck_title', 'Tarjetas en este mazo')}</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-mono font-medium">
                {cards.length}
              </span>
            </h2>
          </div>

          {cardsLoading && cards.length === 0 ? (
            <div className="p-12 text-center text-neutral-400 text-xs">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              {t('deck_detail.loading_cards')}
            </div>
          ) : cards.length === 0 ? (
            /* Empty State */
            <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/20 p-8 sm:p-12 text-center flex flex-col items-center justify-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-500 shadow-inner">
                <svg className="w-7 h-7 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-white">
                  {t('deck_detail.empty_title')}
                </h3>
                <p className="text-xs text-neutral-400 max-w-sm mx-auto leading-relaxed">
                  {t('deck_detail.empty_desc')}
                </p>
              </div>

              <button
                onClick={() => {
                  setAiMode('multimodal');
                  setIsAiModalOpen(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium text-violet-300 bg-violet-600/15 border border-violet-500/30 hover:bg-violet-600/25 transition active:scale-95"
              >
                <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                {t('deck_detail.upload_multimodal_btn')}
              </button>
            </div>
          ) : (
            /* Cards List with FormattedCardView Rendering */
            <div className="space-y-4">
              {cards.map((card, index) => {
                const fmt =
                  card.cardFormat ||
                  card.card_format ||
                  (card.card_type === 'cloze' ? 'cloze' : 'basic');
                const badge = formatBadges[fmt] || { label: fmt, style: 'bg-neutral-800 text-neutral-400 border-neutral-700' };

                return (
                  <div
                    key={card.id}
                    className="rounded-2xl border border-neutral-800/80 bg-neutral-900/40 p-4 hover:border-neutral-700/80 transition-all space-y-3 group"
                  >
                    <div className="flex items-center justify-between text-xs pb-2 border-b border-neutral-800/50">
                      <span className="font-mono text-neutral-500">#{cards.length - index}</span>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-medium uppercase tracking-wider ${
                            stateBadgeStyles[card.state ?? 0]
                          }`}
                        >
                          {stateLabels[card.state ?? 0]}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-medium uppercase tracking-wider border ${badge.style}`}
                        >
                          {badge.label}
                        </span>
                        <button
                          onClick={() => handleDeleteCard(card.id)}
                          title={t('deck_detail.delete_card_title')}
                          className="text-neutral-500 hover:text-rose-400 p-1 rounded transition opacity-60 group-hover:opacity-100"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Renderizado visual de la tarjeta */}
                    <div className="text-xs">
                      <FormattedCardView
                        front={card.front}
                        back={card.back}
                        cardFormat={fmt}
                        isRevealed={true}
                        interactive={false}
                      />
                    </div>

                    <div className="flex items-center gap-3 pt-2 text-[10px] text-neutral-500 font-mono border-t border-neutral-800/40">
                      <span>{t('deck_detail.reps')} {card.reps}</span>
                      <span>{t('deck_detail.lapses')} {card.lapses}</span>
                      <span>{t('deck_detail.stability')} {card.stability.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal: Generar con IA (Gemini Flash Multimodal) */}
      {isAiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-xl rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl relative space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-violet-500/20 text-violet-400 border border-violet-500/30 flex items-center justify-center shadow-md">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">
                    {t('deck_detail.modal_ai_title')}
                  </h3>
                  <span className="text-[11px] text-violet-400 font-mono">
                    {t('deck_detail.modal_ai_sub')}
                  </span>
                </div>
              </div>
              <button
                onClick={() => !isGenerating && setIsAiModalOpen(false)}
                disabled={isGenerating}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition disabled:opacity-50"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Mensaje informativo destacado si el mazo ya tiene tarjetas */}
            {((cards && cards.length > 0) || (currentDeck && currentDeck.cardsCount > 0)) && (
              <div className="p-4 rounded-xl bg-gradient-to-r from-violet-950/60 via-indigo-950/50 to-neutral-950/80 border border-violet-500/35 text-violet-200 text-xs sm:text-sm leading-relaxed flex items-start gap-3 shadow-lg shadow-violet-950/25">
                <span className="text-xl shrink-0 mt-0.5">💡</span>
                <div className="flex-1">
                  <p className="font-medium text-white leading-relaxed">
                    {t('deck_detail.modal_ai_existing_hint', { count: cards.length || currentDeck?.cardsCount || 0 })}
                  </p>
                </div>
              </div>
            )}

            {/* Mode Tabs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 p-1 rounded-xl bg-neutral-950 border border-neutral-800 text-xs">
              <button
                type="button"
                onClick={() => {
                  setAiMode('multimodal');
                  setAiError(null);
                  setAiSuccessMessage(null);
                }}
                className={`py-2 px-3 rounded-lg font-medium transition flex items-center justify-center gap-2 ${
                  aiMode === 'multimodal'
                    ? 'bg-neutral-800 text-white shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <svg className="w-4 h-4 text-violet-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <span>{t('deck_detail.tab_upload')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAiMode('url');
                  setAiError(null);
                  setAiSuccessMessage(null);
                  setAiCoreExhausted(false);
                }}
                className={`py-2 px-3 rounded-lg font-medium transition flex items-center justify-center gap-2 ${
                  aiMode === 'url'
                    ? 'bg-neutral-800 text-white shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <svg className="w-4 h-4 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                <span>{t('deck_detail.tab_url')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAiMode('topic');
                  setAiError(null);
                  setAiSuccessMessage(null);
                  setAiCoreExhausted(false);
                }}
                className={`py-2 px-3 rounded-lg font-medium transition flex items-center justify-center gap-2 ${
                  aiMode === 'topic'
                    ? 'bg-neutral-800 text-white shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <svg className="w-4 h-4 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <span>{t('deck_detail.tab_topic')}</span>
              </button>
            </div>

            {/* Mode Content */}
            {aiMode === 'multimodal' ? (
              <DocumentUploader
                deckId={id}
                onSuccess={() => {
                  fetchDeckById(id);
                }}
                onCancel={() => setIsAiModalOpen(false)}
                onSwitchToUrl={() => setAiMode('url')}
              />
            ) : aiMode === 'url' ? (
              <UrlCardGenerator
                deckId={id}
                onSuccess={() => {
                  fetchDeckById(id);
                }}
                onCancel={() => setIsAiModalOpen(false)}
              />
            ) : (
              /* Topic Prompt Mode Content */
              <div className="space-y-4">
                <p className="text-xs text-neutral-400 leading-relaxed">
                  {t('deck_detail.topic_desc', { count: aiCardCount })}
                </p>

                {aiError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs leading-relaxed">
                    {aiError}
                  </div>
                )}

                {aiSuccessMessage && (
                  aiCoreExhausted ? (
                    <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs leading-relaxed flex items-start gap-2.5 shadow-sm">
                      <span className="text-base shrink-0">🎯</span>
                      <div className="flex-1">
                        <p className="leading-relaxed">
                          <strong className="font-semibold text-amber-300">{t('deck_detail.theory_covered_title')}</strong> {t('deck_detail.theory_covered_desc')}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs leading-relaxed flex items-start gap-2.5 shadow-sm">
                      <span className="text-base shrink-0">✅</span>
                      <div className="flex-1">
                        <p className="leading-relaxed">
                          <strong className="font-semibold text-emerald-300">{t('deck_detail.cards_added_title')}</strong> {t('deck_detail.cards_added_desc')}
                        </p>
                      </div>
                    </div>
                  )
                )}

                <form onSubmit={handleGenerateCardsByTopic} className="space-y-4">
                  {/* Selectores: Formato y Cantidad de Tarjetas */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Card Format Selector Dropdown */}
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-1.5 flex items-center justify-between">
                        <span>{t('deck_detail.card_format_label')}</span>
                        <span className="text-violet-400 font-mono text-[10px] lowercase">{aiCardFormat}</span>
                      </label>
                      <div className="relative">
                        <select
                          disabled={isGenerating}
                          value={aiCardFormat}
                          onChange={(e) => setAiCardFormat(e.target.value as CardFormat)}
                          className="w-full text-xs font-medium px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-white focus:outline-none focus:border-violet-500 transition appearance-none cursor-pointer disabled:opacity-50 pr-10"
                        >
                          <option value="basic">{t('deck_detail.format_opt_basic')}</option>
                          <option value="multiple_choice">{t('deck_detail.format_opt_mc')}</option>
                          <option value="cloze">{t('deck_detail.format_opt_cloze')}</option>
                          <option value="true_false">{t('deck_detail.format_opt_tf')}</option>
                        </select>
                        <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-neutral-400">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                    </div>

                    {/* Card Count Numeric Input con Límite Seguro */}
                    <div>
                      <label htmlFor="topicCardCount" className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-1.5 flex items-center justify-between">
                        <span>{t('deck_detail.card_count_label')}</span>
                        <span className="text-violet-400 font-mono text-[10px] font-bold">{t('deck_detail.card_count_max', { count: aiCardCount })}</span>
                      </label>
                      <div className="relative">
                        <input
                          id="topicCardCount"
                          name="cardCount"
                          type="number"
                          min={1}
                          max={30}
                          disabled={isGenerating}
                          value={aiCardCount}
                          onChange={(e) => {
                            const rawVal = e.target.value;
                            if (rawVal === '') {
                              setAiCardCount(1);
                              return;
                            }
                            const val = parseInt(rawVal, 10);
                            if (!isNaN(val)) {
                              setAiCardCount(Math.min(30, Math.max(1, val)));
                            }
                          }}
                          className="w-full text-xs font-semibold px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-white focus:outline-none focus:border-violet-500 transition disabled:opacity-50"
                          placeholder={t('deck_detail.card_count_placeholder')}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Mensaje de ayuda visualmente atractivo (hint/banner) */}
                  <div className="p-2.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-[11px] text-violet-200/90 flex items-start gap-2 leading-relaxed">
                    <span className="shrink-0 text-sm">💡</span>
                    <span>
                      {t('deck_detail.batch_hint')}
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-1.5">
                      {t('deck_detail.topic_label')} <span className="text-violet-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      disabled={isGenerating}
                      value={aiTopic}
                      onChange={(e) => setAiTopic(e.target.value)}
                      placeholder={t('deck_detail.topic_placeholder')}
                      className="w-full text-sm px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-white placeholder-neutral-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition disabled:opacity-50"
                    />
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      disabled={isGenerating}
                      onClick={() => setIsAiModalOpen(false)}
                      className="px-4 py-2 text-xs sm:text-sm text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 transition disabled:opacity-50"
                    >
                      {t('deck_detail.cancel')}
                    </button>
                    <button
                      type="submit"
                      disabled={isGenerating || !aiTopic.trim()}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 text-white font-medium text-xs sm:text-sm transition-all duration-150 shadow-lg shadow-violet-600/25 active:scale-95"
                    >
                      {isGenerating ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                          <span>{t('deck_detail.generating_btn')}</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          <span>{t('deck_detail.generate_btn', { count: aiCardCount, format: aiCardFormat })}</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Compartir Mazo */}
      <ShareDeckModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        deck={currentDeck}
      />
    </div>
  );
}
