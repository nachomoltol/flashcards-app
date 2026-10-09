'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useDeckStore, useCardStore, useProModalStore, useAuthStore } from '@/stores';
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

  useEffect(() => {
    fetchDeckById(id);
    fetchCardsByDeck(id);
  }, [id, fetchDeckById, fetchCardsByDeck]);

  const handleDeleteCard = async (cardId: string) => {
    if (confirm('¿Eliminar esta tarjeta permanentemente de Supabase?')) {
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
      user?.id
    );

    if (!result.success || !result.cards) {
      setIsGenerating(false);
      if (result.error === 'LIMIT_REACHED') {
        openProModal(true);
        return;
      }
      setAiError(result.error || 'Ocurrió un error inesperado al generar las tarjetas.');
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
        setAiSuccessMessage(
          '🎯 Teoría principal cubierta. Se han extraído los conceptos troncales. Si continúas generando, la IA rebuscará detalles minuciosos, datos estadísticos y excepciones del texto para un estudio de máxima profundidad.'
        );
      } else {
        setAiSuccessMessage(
          '✅ Tarjetas añadidas con éxito. ¿El temario es largo? Dale a generar de nuevo para extraer el siguiente bloque de conocimientos.'
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar las tarjetas generadas en Supabase';
      setAiError(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const stateLabels = ['Nueva', 'Aprendizaje', 'Repaso', 'Reaprendizaje'];
  const stateBadgeStyles = [
    'bg-blue-500/10 text-blue-400 border-blue-500/20',
    'bg-amber-500/10 text-amber-400 border-amber-500/20',
    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    'bg-rose-500/10 text-rose-400 border-rose-500/20',
  ];

  const formatBadges: Record<string, { label: string; style: string }> = {
    basic: { label: 'Básica', style: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
    multiple_choice: { label: 'Opción Múltiple (Test)', style: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
    cloze: { label: 'Cloze [...]', style: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' },
    true_false: { label: 'Verdadero / Falso', style: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
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
          Volver al Dashboard
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
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
              {deckLoading && !currentDeck ? 'Cargando mazo...' : currentDeck?.title || 'Mazo sin título'}
            </h1>
            <p className="text-sm text-neutral-400 mt-1">
              {currentDeck?.description || `${cards.length} tarjetas registradas en Supabase.`}
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
              <span>Generar con IA</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-white/15 text-white font-mono tracking-tight">
                Multimodal
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
              <span>Estudiar Mazo {currentDeck && currentDeck.dueCount > 0 ? `(${currentDeck.dueCount})` : ''}</span>
            </Link>

            {/* Botón: Compartir Mazo */}
            <button
              onClick={() => setIsShareModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm text-neutral-300 bg-neutral-900 hover:bg-neutral-800 hover:text-white border border-neutral-700/80 shadow-md transition-all duration-150 active:scale-95"
            >
              <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              <span>Compartir</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
          {error}
        </div>
      )}

      {/* Main Grid: Card Editor & Cards List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Card Editor */}
        <div className="lg:col-span-6 space-y-4">
          <CardEditor deckId={id} onCardCreated={handleCardCreated} />
        </div>

        {/* Right Column: Cards List & Empty State */}
        <div className="lg:col-span-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              Tarjetas en Supabase
              <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 font-normal">
                {cards.length}
              </span>
            </h2>
          </div>

          {cardsLoading && cards.length === 0 ? (
            <div className="p-12 text-center text-neutral-400 text-xs">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              Cargando tarjetas desde Supabase...
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
                  No hay tarjetas guardadas en este mazo
                </h3>
                <p className="text-xs text-neutral-400 max-w-sm mx-auto leading-relaxed">
                  Usa el editor dinámico, sube un documento (PDF, Word, Audio, TXT) o pega un enlace web (YouTube) para que Gemini genere tarjetas automáticamente.
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
                Subir Documento Multimodal
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
                          title="Eliminar tarjeta de Supabase"
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
                      <span>Reps: {card.reps}</span>
                      <span>Lapsos: {card.lapses}</span>
                      <span>Estabilidad: {card.stability.toFixed(2)}</span>
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
                    Generar Tarjetas con IA
                  </h3>
                  <span className="text-[11px] text-violet-400 font-mono">
                    Gemini 3.8 Flash • Multimodal & Múltiples Formatos
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
                    Para añadir más tarjetas al mazo, vuelve a subir el documento que usaste para crear las preguntas. La IA revisará las {cards.length || currentDeck?.cardsCount || 0} tarjetas existentes en este mazo para generar contenido nuevo sin repetir.
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
                <span>Subir Documento</span>
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
                <span>Enlace Web / YouTube</span>
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
                <span>Por Tema o Prompt</span>
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
                  Introduce el tema o concepto y selecciona el formato y cantidad deseada. Gemini generará {aiCardCount} tarjetas de estudio de alta precisión cubriendo los conceptos clave de forma equitativa y las guardará automáticamente en este mazo con FSRS.
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
                          <strong className="font-semibold text-amber-300">Teoría principal cubierta.</strong> Se han extraído los conceptos troncales. Si continúas generando, la IA rebuscará detalles minuciosos, datos estadísticos y excepciones del texto para un estudio de máxima profundidad.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs leading-relaxed flex items-start gap-2.5 shadow-sm">
                      <span className="text-base shrink-0">✅</span>
                      <div className="flex-1">
                        <p className="leading-relaxed">
                          <strong className="font-semibold text-emerald-300">Tarjetas añadidas con éxito.</strong> ¿El temario es largo? Dale a generar de nuevo para extraer el siguiente bloque de conocimientos.
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
                        <span>Formato de Tarjetas</span>
                        <span className="text-violet-400 font-mono text-[10px] lowercase">{aiCardFormat}</span>
                      </label>
                      <div className="relative">
                        <select
                          disabled={isGenerating}
                          value={aiCardFormat}
                          onChange={(e) => setAiCardFormat(e.target.value as CardFormat)}
                          className="w-full text-xs font-medium px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-white focus:outline-none focus:border-violet-500 transition appearance-none cursor-pointer disabled:opacity-50 pr-10"
                        >
                          <option value="basic">🃏 Básica — Pregunta y Respuesta</option>
                          <option value="multiple_choice">📝 Opción Múltiple — Test (a, b, c, d)</option>
                          <option value="cloze">🧩 Cloze — Texto con espacio [...]</option>
                          <option value="true_false">⚖️ Verdadero o Falso — Afirmación</option>
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
                        <span>Cantidad de Tarjetas</span>
                        <span className="text-violet-400 font-mono text-[10px] font-bold">{aiCardCount} / 30 MÁX</span>
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
                          placeholder="1 a 30 tarjetas"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Mensaje de ayuda visualmente atractivo (hint/banner) */}
                  <div className="p-2.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-[11px] text-violet-200/90 flex items-start gap-2 leading-relaxed">
                    <span className="shrink-0 text-sm">💡</span>
                    <span>
                      Generamos por lotes para evitar saturación. Puedes pedir varios lotes seguidos del mismo documento: nuestra IA analiza tu mazo y extraerá conceptos 100% nuevos sin repetir preguntas anteriores.
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-1.5">
                      Tema o Concepto a estudiar <span className="text-violet-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      disabled={isGenerating}
                      value={aiTopic}
                      onChange={(e) => setAiTopic(e.target.value)}
                      placeholder="ej. Táctica del Ajax de 1971 a 1973, Ciclo de Krebs, Reacciones Redox..."
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
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isGenerating || !aiTopic.trim()}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 text-white font-medium text-xs sm:text-sm transition-all duration-150 shadow-lg shadow-violet-600/25 active:scale-95"
                    >
                      {isGenerating ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                          <span>Generando con Gemini...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          <span>Generar {aiCardCount} Tarjetas ({aiCardFormat})</span>
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
