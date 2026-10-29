'use client';

import { use, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, X, Award, Zap, FileText, HelpCircle, Plus, Sparkles, Share2 } from 'lucide-react';
import { useDeckStore, useCardStore, useProModalStore, useAuthStore, useLanguageStore } from '@/stores';
import { CardEditor, DocumentUploader, FormattedCardView, UrlCardGenerator } from '@/components/cards';
import { ShareDeckModal, QuickStudyGuideModal, StudyModesHelpModal } from '@/components/decks';
import { generateCardsAction } from '@/app/actions/generateCards';
import { showAdMobRewardedAd } from '@/lib/admob';
import { claimAdRewardAction } from '@/app/actions/claimAdReward';
import type { CardFormat } from '@/types/database';

interface DeckPageProps {
  params: Promise<{ id: string }>;
}

export default function DeckDetailPage({ params }: DeckPageProps) {
  const { id } = use(params);

  const { currentDeck, isLoading: deckLoading, fetchDeckById } = useDeckStore();
  const { cards, isLoading: cardsLoading, error, fetchCardsByDeck, createCardsBatch, deleteCard } =
    useCardStore();
  const { openProModal } = useProModalStore();
  const { user } = useAuthStore();
  const { language, t } = useLanguageStore();

  // Estado para el buscador de tarjetas en el mazo
  const [searchQuery, setSearchQuery] = useState('');

  // Estado para el modal de Generación con IA (Gemini Flash)
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [uploaderStep, setUploaderStep] = useState<1 | 2 | 3>(1);
  const [aiMode, setAiMode] = useState<'multimodal' | 'url' | 'topic'>('multimodal');
  const [aiTopic, setAiTopic] = useState('');
  const [aiCardFormat, setAiCardFormat] = useState<CardFormat>('multiple_choice');
  const [aiCardCount, setAiCardCount] = useState<number>(10);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSuccessMessage, setAiSuccessMessage] = useState<string | null>(null);
  const [aiCoreExhausted, setAiCoreExhausted] = useState<boolean>(false);
  const [isMeticulousPhase, setIsMeticulousPhase] = useState<boolean>(false);

  // Estado para el modal de Compartir Mazo
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  // Estados para la Guía de Repaso Rápido y Ayuda de Modos
  const [isQuickGuideOpen, setIsQuickGuideOpen] = useState(false);
  const [isModesHelpOpen, setIsModesHelpOpen] = useState(false);

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

  // Filtrar dinámicamente el array de tarjetas por pregunta o respuesta
  const filteredCards = useMemo(() => {
    if (!searchQuery.trim()) return cards;
    const q = searchQuery.toLowerCase().trim();
    return cards.filter((card) => {
      const matchFront = card.front ? card.front.toLowerCase().includes(q) : false;
      const matchBack = card.back ? card.back.toLowerCase().includes(q) : false;
      return matchFront || matchBack;
    });
  }, [cards, searchQuery]);

  const handleCardCreated = () => {
    fetchDeckById(id);
  };

  // Manejar generación con Gemini por tema y guardado automático en Supabase
  const handleGenerateCardsByTopic = async (e?: React.FormEvent) => {
    e?.preventDefault?.();
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
      language,
      aiCoreExhausted || isMeticulousPhase
    );

    if (!result.success || !result.cards) {
      if (result.error === 'LIMIT_REACHED') {
        setIsGenerating(false);
        openProModal(true);
        return;
      }

      if (result.error === 'AD_REQUIRED') {
        try {
          const adResult = await showAdMobRewardedAd();
          if (adResult.completed) {
            const claim = await claimAdRewardAction(user?.id);
            if (claim.success) {
              // Disparar la generación de las tarjetas automáticamente para que la experiencia sea fluida
              return handleGenerateCardsByTopic();
            } else {
              setAiError(claim.message || t('deck_detail.unexpected_error'));
            }
          } else if (adResult.error) {
            setAiError(adResult.error);
          }
        } catch (adErr) {
          console.warn('Error en flujo de anuncio bonificado:', adErr);
          setAiError(t('deck_detail.unexpected_error'));
        }
        setIsGenerating(false);
        return;
      }

      setIsGenerating(false);
      setAiError(result.error || t('deck_detail.unexpected_error'));
      return;
    }

    try {
      // Guardar en lote las tarjetas generadas en Supabase mediante Zustand
      const cardsPayload = result.cards.map((card) => ({
        front: card.front,
        back: card.back,
        cardType: card.cardFormat === 'cloze' ? 'cloze' : 'basic',
        cardFormat: card.cardFormat,
      }));
      await createCardsBatch(id, cardsPayload);

      await fetchCardsByDeck(id);
      await fetchDeckById(id);

      // Rigor en advertencias: Solo cuando la lista troncal se vacíe matemáticamente o el material se agote
      const isExhausted =
        Boolean(result.core_exhausted) ||
        (result.cards.length < aiCardCount && result.cards.length > 0);

      if (isExhausted) {
        setIsMeticulousPhase(true);
      }
      setAiCoreExhausted(isExhausted);

      if (result.cards.length < aiCardCount) {
        setAiSuccessMessage(
          t(
            'deck_detail.material_exhausted',
            'Material agotado: Se han generado {count} tarjetas. El texto no contenía más conceptos únicos para alcanzar las {requested} solicitadas.'
          )
            .replace('{count}', String(result.cards.length))
            .replace('{requested}', String(aiCardCount))
        );
      } else if (isExhausted || isMeticulousPhase) {
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
          className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition group mb-3"
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

        {/* Cabecera del Mazo: Información Básica */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <span
              className="w-3.5 h-3.5 rounded-full shadow-md shrink-0"
              style={{ backgroundColor: currentDeck?.color || '#6366f1' }}
            />
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 font-mono">
              ID: {id.slice(0, 8)}...
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-neutral-900 dark:text-white">
            {deckLoading && !currentDeck ? t('deck_detail.loading_deck') : currentDeck?.title || t('deck_detail.untitled_deck')}
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {currentDeck?.description || t('deck_detail.cards_registered', { count: cards.length })}
          </p>
        </div>

        {/* ESTRUCTURA DE 2 COLUMNAS (Grid 2 bloques clara y limpia) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 sm:gap-4 pt-1 pb-6 border-b border-neutral-200 dark:border-neutral-800/80">
          {/* COLUMNA IZQUIERDA: Creación y Gestión */}
          <div className="flex flex-col justify-between gap-2.5 p-3.5 sm:p-4 rounded-2xl bg-neutral-50/90 dark:bg-neutral-900/50 border border-neutral-200/90 dark:border-neutral-800/90 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                {t('deck_detail.section_creation', 'Creación y Gestión')}
              </span>
            </div>

            {/* Botón Principal Destacado: Generar preguntas con IA (Ancho completo) */}
            <button
              type="button"
              onClick={() => {
                setAiError(null);
                setAiSuccessMessage(null);
                setAiCoreExhausted(false);
                setAiMode('multimodal');
                setIsAiModalOpen(true);
              }}
              className="w-full py-2.5 sm:py-3 px-4 rounded-xl font-bold text-xs sm:text-sm text-white bg-gradient-to-r from-violet-600 via-indigo-600 to-indigo-700 hover:from-violet-500 hover:to-indigo-600 shadow-md shadow-violet-600/20 transition-all duration-150 active:scale-[0.99] border border-violet-400/20 cursor-pointer flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-violet-200 animate-pulse shrink-0" />
              <span>{t('deck_detail.generate_ai', 'Generar preguntas con IA')}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/20 text-white font-mono tracking-tight shrink-0 hidden sm:inline">
                {t('deck_detail.multimodal_badge', 'Multimodal')}
              </span>
            </button>

            {/* Debajo: [ ✏️ Añadir tarjeta manualmente ] y [ 🔗 Compartir ] */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsManualEditorOpen(!isManualEditorOpen)}
                className={`w-full py-2.5 px-3 rounded-xl font-semibold text-xs sm:text-sm border transition-all duration-150 active:scale-[0.99] cursor-pointer flex items-center justify-center gap-1.5 min-w-0 ${
                  isManualEditorOpen
                    ? 'bg-neutral-800 text-white border-neutral-700 shadow-sm'
                    : 'bg-white hover:bg-neutral-100 dark:bg-neutral-900 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border-neutral-300 dark:border-neutral-700/80 shadow-sm'
                }`}
              >
                <Plus className="w-4 h-4 text-indigo-500 shrink-0" />
                <span className="truncate">
                  {isManualEditorOpen
                    ? t('deck_detail.hide_editor', 'Cerrar editor')
                    : t('deck_detail.add_manual_btn', 'Añadir tarjeta')}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setIsShareModalOpen(true)}
                className="w-full py-2.5 px-3 rounded-xl font-semibold text-xs sm:text-sm text-neutral-800 dark:text-neutral-200 hover:text-black dark:hover:text-white bg-white hover:bg-neutral-100 dark:bg-neutral-900 dark:hover:bg-neutral-800 border border-neutral-300 dark:border-neutral-700/80 shadow-sm transition-all duration-150 active:scale-[0.99] cursor-pointer flex items-center justify-center gap-1.5 min-w-0"
              >
                <Share2 className="w-4 h-4 text-indigo-500 dark:text-indigo-400 shrink-0" />
                <span className="truncate">{t('deck_detail.share', 'Compartir')}</span>
              </button>
            </div>
          </div>

          {/* COLUMNA DERECHA: Núcleo de Estudio y Modos */}
          <div className="flex flex-col justify-between gap-2.5 p-3.5 sm:p-4 rounded-2xl bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-900/40 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                {t('deck_detail.section_study', 'Núcleo de Estudio')}
              </span>
            </div>

            {/* Botón Principal: Estudiar Mazo (X) (Ancho completo) */}
            <Link
              href={`/study/${id}`}
              className={`w-full py-2.5 sm:py-3 px-4 rounded-xl font-bold text-xs sm:text-sm transition-all duration-150 shadow-lg flex items-center justify-center gap-2 active:scale-[0.99] ${
                cards.length === 0
                  ? 'bg-neutral-200 text-neutral-400 pointer-events-none border border-neutral-300 dark:bg-neutral-800/60 dark:text-neutral-500 dark:border-neutral-800'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30 ring-1 ring-indigo-400/40'
              }`}
            >
              <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              <span>{t('deck_detail.study_deck', 'Estudiar Mazo')}</span>
              {currentDeck && currentDeck.dueCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-white/20 text-white text-xs font-mono font-bold shrink-0">
                  {currentDeck.dueCount}
                </span>
              )}
            </Link>

            {/* Fila Inferior: Botonera de 4 Modos Secundarios en grid-cols-4 compacta */}
            <div className="grid grid-cols-4 gap-1.5 bg-neutral-100 dark:bg-neutral-900/90 p-1 rounded-xl border border-neutral-200 dark:border-neutral-800/90 shadow-inner">
              {/* 1. Guía Rápida */}
              <div className="relative group w-full min-w-0">
                <button
                  type="button"
                  onClick={() => setIsQuickGuideOpen(true)}
                  disabled={cards.length === 0}
                  className="w-full py-2 px-1 sm:px-1.5 rounded-lg font-bold transition flex items-center justify-center gap-1 cursor-pointer active:scale-95 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/15 border border-transparent hover:border-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed min-w-0"
                >
                  <FileText className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span className="text-[11px] sm:text-xs whitespace-nowrap">
                    {t('quick_guide.button_short', 'Guía')}
                  </span>
                  <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-500 dark:text-amber-300 font-mono shrink-0 hidden sm:inline">
                    👑
                  </span>
                </button>
                {/* Tooltip PC */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden md:group-hover:block z-50 pointer-events-none transition-all duration-150 animate-in fade-in zoom-in-95">
                  <div className="px-3 py-1.5 rounded-xl bg-neutral-950/95 text-neutral-200 border border-neutral-800 text-[11px] font-medium shadow-2xl whitespace-nowrap backdrop-blur-md">
                    {t('quick_guide.tooltip', 'Guía de síntesis estructurada y cheat sheet del mazo')}
                  </div>
                </div>
              </div>

              {/* 2. Pánico */}
              <div className="relative group w-full min-w-0">
                <Link
                  href={`/panic/${id}`}
                  className={`w-full py-2 px-1 sm:px-1.5 rounded-lg font-bold transition flex items-center justify-center gap-1 active:scale-95 min-w-0 ${
                    cards.length === 0
                      ? 'pointer-events-none opacity-40 text-neutral-400'
                      : 'text-amber-700 dark:text-amber-300 hover:bg-amber-500/15 border border-transparent hover:border-amber-500/30'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5 text-amber-500 fill-current shrink-0" />
                  <span className="text-[11px] sm:text-xs whitespace-nowrap">
                    {t('deck_detail.panic_short', 'Pánico')}
                  </span>
                </Link>
                {/* Tooltip PC */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden md:group-hover:block z-50 pointer-events-none transition-all duration-150 animate-in fade-in zoom-in-95">
                  <div className="px-3 py-1.5 rounded-xl bg-neutral-950/95 text-neutral-200 border border-neutral-800 text-[11px] font-medium shadow-2xl whitespace-nowrap backdrop-blur-md">
                    {t('deck_detail.panic_mode_tooltip', 'Repaso intensivo de emergencia sin alterar FSRS')}
                  </div>
                </div>
              </div>

              {/* 3. Simulacro */}
              <div className="relative group w-full min-w-0">
                <Link
                  href={`/exam/${id}`}
                  className={`w-full py-2 px-1 sm:px-1.5 rounded-lg font-bold transition flex items-center justify-center gap-1 active:scale-95 min-w-0 ${
                    cards.length === 0
                      ? 'pointer-events-none opacity-40 text-neutral-400'
                      : 'text-purple-700 dark:text-purple-300 hover:bg-purple-500/15 border border-transparent hover:border-purple-500/30'
                  }`}
                >
                  <Award className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                  <span className="text-[11px] sm:text-xs whitespace-nowrap">
                    {t('deck_detail.exam_short', 'Simulacro')}
                  </span>
                </Link>
                {/* Tooltip PC */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden md:group-hover:block z-50 pointer-events-none transition-all duration-150 animate-in fade-in zoom-in-95">
                  <div className="px-3 py-1.5 rounded-xl bg-neutral-950/95 text-neutral-200 border border-neutral-800 text-[11px] font-medium shadow-2xl whitespace-nowrap backdrop-blur-md">
                    {t('deck_detail.exam_mode_tooltip', 'Modo simulacro a ciegas con temporizador')}
                  </div>
                </div>
              </div>

              {/* 4. Ayuda Contextual (?) */}
              <div className="relative group w-full min-w-0">
                <button
                  type="button"
                  onClick={() => setIsModesHelpOpen(true)}
                  className="w-full py-2 px-1 sm:px-1.5 rounded-lg font-bold text-neutral-500 hover:text-white hover:bg-neutral-800/80 transition cursor-pointer active:scale-95 flex items-center justify-center gap-1 border border-transparent hover:border-neutral-700/80 min-w-0"
                  aria-label={t('study_modes_help.button_title', '¿Cómo funcionan los modos de estudio?')}
                >
                  <HelpCircle className="w-3.5 h-3.5 text-neutral-400 group-hover:text-amber-400 transition-colors shrink-0" />
                  <span className="text-[11px] sm:text-xs font-mono">?</span>
                </button>
                {/* Tooltip PC */}
                <div className="absolute bottom-full right-0 mb-2 hidden md:group-hover:block z-50 pointer-events-none transition-all duration-150 animate-in fade-in zoom-in-95">
                  <div className="px-3 py-1.5 rounded-xl bg-neutral-950/95 text-neutral-200 border border-neutral-800 text-[11px] font-medium shadow-2xl whitespace-nowrap backdrop-blur-md">
                    {t('study_modes_help.button_title', '¿Cómo funcionan los modos de estudio?')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Editor Manual Desplegado (Cero redundancias: se abre con el botón de la cabecera) */}
        {isManualEditorOpen && (
          <div className="p-4 sm:p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 shadow-lg animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">✏️</span>
                <h3 className="font-bold text-sm sm:text-base text-neutral-900 dark:text-white">
                  {t('deck_detail.add_manual_title', 'Añadir tarjeta manualmente')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsManualEditorOpen(false)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
                title={t('deck_detail.hide_editor', 'Cerrar editor')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <CardEditor deckId={id} onCardCreated={handleCardCreated} />
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
          {error}
        </div>
      )}

      {/* Contenido Principal: Lista de Tarjetas */}
      <div className="space-y-6">
        {/* Tarjetas en este mazo */}
        <div className="space-y-4 pt-1">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-200 dark:border-neutral-800/80">
            <h2 className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white tracking-tight flex items-center gap-2.5">
              <span>🃏 {t('deck_detail.cards_in_deck_title', 'Tarjetas en este mazo')}</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 font-mono font-medium">
                {searchQuery.trim() ? `${filteredCards.length} / ${cards.length}` : cards.length}
              </span>
            </h2>

            {/* Barra de Búsqueda Dinámica */}
            {cards.length > 0 && (
              <div className="relative w-full sm:w-72">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400 dark:text-neutral-500">
                  <Search className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('deck_detail.search_cards_placeholder', 'Buscar por pregunta o respuesta...')}
                  className="w-full pl-9 pr-8 py-2 rounded-xl text-xs bg-neutral-100/80 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/70 text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition shadow-sm"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
                    title={t('common.clear', 'Limpiar')}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          {cardsLoading && cards.length === 0 ? (
            <div className="p-12 text-center text-neutral-500 dark:text-neutral-400 text-xs">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              {t('deck_detail.loading_cards')}
            </div>
          ) : cards.length === 0 ? (
            /* Empty State */
            <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/20 p-8 sm:p-12 text-center flex flex-col items-center justify-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center justify-center text-neutral-400 dark:text-neutral-500 shadow-sm">
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
                <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
                  {t('deck_detail.empty_title')}
                </h3>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 max-w-sm mx-auto leading-relaxed">
                  {t('deck_detail.empty_desc')}
                </p>
              </div>

              <button
                onClick={() => {
                  setAiMode('multimodal');
                  setIsAiModalOpen(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium text-violet-700 dark:text-violet-300 bg-violet-600/15 border border-violet-500/30 hover:bg-violet-600/25 transition active:scale-95"
              >
                <svg className="w-4 h-4 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                {t('deck_detail.upload_multimodal_btn')}
              </button>
            </div>
          ) : filteredCards.length === 0 ? (
            /* No search results */
            <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/20 p-8 text-center space-y-3">
              <p className="text-xs text-neutral-600 dark:text-neutral-400">
                {t('deck_detail.no_search_results', 'No se encontraron tarjetas que coincidan con')} &ldquo;<strong>{searchQuery}</strong>&rdquo;
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 transition cursor-pointer"
              >
                {t('deck_detail.clear_search', 'Limpiar búsqueda')}
              </button>
            </div>
          ) : (
            /* Cards List with FormattedCardView Rendering */
            <div className="space-y-4">
              {filteredCards.map((card, index) => {
                const fmt =
                  card.cardFormat ||
                  card.card_format ||
                  (card.card_type === 'cloze' ? 'cloze' : 'basic');
                const badge = formatBadges[fmt] || { label: fmt, style: 'bg-neutral-100 text-neutral-600 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:border-neutral-700' };

                return (
                  <div
                    key={card.id}
                    className="rounded-2xl border border-neutral-200 dark:border-neutral-800/80 bg-white dark:bg-neutral-900/40 p-4 hover:border-neutral-300 dark:hover:border-neutral-700/80 shadow-sm transition-all space-y-3 group"
                  >
                    <div className="flex items-center justify-between text-xs pb-2 border-b border-neutral-100 dark:border-neutral-800/50">
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
                          className="text-neutral-400 hover:text-rose-600 dark:text-neutral-500 dark:hover:text-rose-400 p-1 rounded transition opacity-60 group-hover:opacity-100 cursor-pointer"
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
                        cardId={card.id}
                        front={card.front}
                        back={card.back}
                        cardFormat={fmt}
                        isRevealed={true}
                        interactive={false}
                        notes={card.notes}
                        noteImageUrl={card.note_image_url}
                      />
                    </div>

                    <div className="flex items-center gap-3 pt-2 text-[10px] text-neutral-500 font-mono border-t border-neutral-100 dark:border-neutral-800/40">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-xl rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 sm:p-6 shadow-2xl relative space-y-3 sm:space-y-4 max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-violet-500/20 text-violet-600 dark:text-violet-400 border border-violet-500/30 flex items-center justify-center shadow-md">
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
                  <h3 className="text-base font-bold text-neutral-900 dark:text-white tracking-tight">
                    {t('deck_detail.modal_ai_title')}
                  </h3>
                  <span className="text-[11px] text-violet-600 dark:text-violet-400 font-mono">
                    {t('deck_detail.modal_ai_sub')}
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  if (!isGenerating) {
                    setIsAiModalOpen(false);
                    setUploaderStep(1);
                  }
                }}
                disabled={isGenerating}
                className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition disabled:opacity-50 cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Mensaje informativo destacado si el mazo ya tiene tarjetas (solo en Paso 1 en multimodal) */}
            {(aiMode !== 'multimodal' || uploaderStep === 1) && ((cards && cards.length > 0) || (currentDeck && currentDeck.cardsCount > 0)) && (
              <div className="p-3.5 sm:p-4 rounded-xl bg-gradient-to-r from-violet-50/80 via-indigo-50/60 to-neutral-50/80 dark:from-violet-950/60 dark:via-indigo-950/50 dark:to-neutral-950/80 border border-violet-200 dark:border-violet-500/35 text-violet-800 dark:text-violet-200 text-xs sm:text-sm leading-relaxed flex items-start gap-3 shadow-sm">
                <span className="text-xl shrink-0 mt-0.5">💡</span>
                <div className="flex-1">
                  <p className="font-medium text-neutral-900 dark:text-white leading-relaxed">
                    {t('deck_detail.modal_ai_existing_hint', { count: cards.length || currentDeck?.cardsCount || 0 })}
                  </p>
                </div>
              </div>
            )}

            {/* Mode Tabs - Ocultas en los pasos 2 y 3 para liberar espacio vertical en pantallas móviles */}
            {(aiMode !== 'multimodal' || uploaderStep === 1) && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 p-1 rounded-xl bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setAiMode('multimodal');
                    setUploaderStep(1);
                    setAiError(null);
                    setAiSuccessMessage(null);
                  }}
                  className={`py-2 px-3 rounded-lg font-medium transition flex items-center justify-center gap-2 cursor-pointer ${
                    aiMode === 'multimodal'
                      ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-sm'
                      : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
                  }`}
                >
                  <svg className="w-4 h-4 text-violet-500 dark:text-violet-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <span>{t('deck_detail.tab_upload')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAiMode('url');
                    setUploaderStep(1);
                    setAiError(null);
                    setAiSuccessMessage(null);
                  }}
                  className={`py-2 px-3 rounded-lg font-medium transition flex items-center justify-center gap-2 cursor-pointer ${
                    aiMode === 'url'
                      ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-sm'
                      : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
                  }`}
                >
                  <svg className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  <span>{t('deck_detail.tab_url')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAiMode('topic');
                    setUploaderStep(1);
                    setAiError(null);
                    setAiSuccessMessage(null);
                  }}
                  className={`py-2 px-3 rounded-lg font-medium transition flex items-center justify-center gap-2 cursor-pointer ${
                    aiMode === 'topic'
                      ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-sm'
                      : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
                  }`}
                >
                  <svg className="w-4 h-4 text-indigo-500 dark:text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span>{t('deck_detail.tab_topic')}</span>
                </button>
              </div>
            )}

            {/* Mode Content */}
            {aiMode === 'multimodal' ? (
              <DocumentUploader
                deckId={id}
                initialMeticulousPhase={isMeticulousPhase}
                onMeticulousChange={setIsMeticulousPhase}
                onSuccess={() => {
                  fetchDeckById(id);
                }}
                onCancel={() => {
                  setIsAiModalOpen(false);
                  setUploaderStep(1);
                }}
                onSwitchToUrl={() => {
                  setAiMode('url');
                  setUploaderStep(1);
                }}
                onStepChange={setUploaderStep}
              />
            ) : aiMode === 'url' ? (
              <UrlCardGenerator
                deckId={id}
                initialMeticulousPhase={isMeticulousPhase}
                onMeticulousChange={setIsMeticulousPhase}
                onSuccess={() => {
                  fetchDeckById(id);
                }}
                onCancel={() => setIsAiModalOpen(false)}
              />
            ) : (
              /* Topic Prompt Mode Content */
              <div className="space-y-4">
                <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                  {t('deck_detail.topic_desc', { count: aiCardCount })}
                </p>

                {/* Banner Persistente de Fase Minuciosa si ya está activa */}
                {isMeticulousPhase && !aiSuccessMessage && (
                  <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs leading-relaxed flex items-start gap-2.5 shadow-sm">
                    <span className="text-base shrink-0">🎯</span>
                    <div className="flex-1">
                      <p className="leading-relaxed">
                        <strong className="font-semibold text-amber-700 dark:text-amber-300">{t('deck_detail.theory_covered_title')}</strong> {t('deck_detail.theory_covered_desc')}
                      </p>
                    </div>
                  </div>
                )}

                {aiError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 dark:text-rose-300 text-xs leading-relaxed">
                    {aiError}
                  </div>
                )}

                {aiSuccessMessage && (
                  (isMeticulousPhase || aiCoreExhausted) ? (
                    <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs leading-relaxed flex items-start gap-2.5 shadow-sm">
                      <span className="text-base shrink-0">🎯</span>
                      <div className="flex-1">
                        <p className="leading-relaxed">
                          <strong className="font-semibold text-amber-700 dark:text-amber-300">{t('deck_detail.theory_covered_title')}</strong> {t('deck_detail.theory_covered_desc')}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 text-xs leading-relaxed flex items-start gap-2.5 shadow-sm">
                      <span className="text-base shrink-0">✅</span>
                      <div className="flex-1">
                        <p className="leading-relaxed">
                          <strong className="font-semibold text-emerald-700 dark:text-emerald-300">{t('deck_detail.cards_added_title')}</strong> {t('deck_detail.cards_added_desc')}
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
                      <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 mb-1.5 flex items-center justify-between">
                        <span>{t('deck_detail.card_format_label')}</span>
                        <span className="text-violet-600 dark:text-violet-400 font-mono text-[10px] lowercase">{aiCardFormat}</span>
                      </label>
                      <div className="relative">
                        <select
                          disabled={isGenerating}
                          value={aiCardFormat}
                          onChange={(e) => setAiCardFormat(e.target.value as CardFormat)}
                          className="w-full text-xs font-medium px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:border-violet-500 transition appearance-none cursor-pointer disabled:opacity-50 pr-10"
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
                      <label htmlFor="topicCardCount" className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 mb-1.5 flex items-center justify-between">
                        <span>{t('deck_detail.card_count_label')}</span>
                        <span className="text-violet-600 dark:text-violet-400 font-mono text-[10px] font-bold">{t('deck_detail.card_count_max', { count: aiCardCount })}</span>
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
                          className="w-full text-xs font-semibold px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:border-violet-500 transition disabled:opacity-50"
                          placeholder={t('deck_detail.card_count_placeholder')}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Mensaje de ayuda visualmente atractivo cuando aún no está en fase minuciosa */}
                  {!isMeticulousPhase && (
                    <div className="p-2.5 rounded-lg bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20 text-[11px] text-violet-800 dark:text-violet-200/90 flex items-start gap-2 leading-relaxed">
                      <span className="shrink-0 text-sm">💡</span>
                      <span>
                        {t('deck_detail.batch_hint')}
                      </span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 mb-1.5">
                      {t('deck_detail.topic_label')} <span className="text-violet-500 dark:text-violet-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      disabled={isGenerating}
                      value={aiTopic}
                      onChange={(e) => setAiTopic(e.target.value)}
                      placeholder={t('deck_detail.topic_placeholder')}
                      className="w-full text-sm px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition disabled:opacity-50"
                    />
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      disabled={isGenerating}
                      onClick={() => setIsAiModalOpen(false)}
                      className="px-4 py-2 text-xs sm:text-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition disabled:opacity-50 cursor-pointer"
                    >
                      {t('deck_detail.cancel')}
                    </button>
                    <button
                      type="submit"
                      disabled={isGenerating || !aiTopic.trim()}
                      className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl ${
                        isMeticulousPhase
                          ? 'bg-gradient-to-r from-amber-600 via-amber-500 to-indigo-600 hover:from-amber-500 hover:to-indigo-500 shadow-amber-600/25'
                          : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 shadow-violet-600/25'
                      } disabled:opacity-50 text-white font-medium text-xs sm:text-sm transition-all duration-150 shadow-lg active:scale-95 cursor-pointer`}
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
                          <span>
                            {isMeticulousPhase
                              ? t('deck_detail.generate_meticulous_btn', 'Generar tarjetas detalladas (hasta {count})').replace('{count}', String(aiCardCount))
                              : t('deck_detail.generate_btn', 'Generar hasta {count} tarjetas').replace('{count}', String(aiCardCount))}
                          </span>
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

      {/* Modal: Guía de Repaso Rápido (Cheat Sheet de Síntesis) */}
      <QuickStudyGuideModal
        isOpen={isQuickGuideOpen}
        onClose={() => setIsQuickGuideOpen(false)}
        deckId={id}
        deckTitle={currentDeck?.title || 'Mazo'}
      />

      {/* Modal: Ayuda Contextual de Modos de Estudio */}
      <StudyModesHelpModal
        isOpen={isModesHelpOpen}
        onClose={() => setIsModesHelpOpen(false)}
      />
    </div>
  );
}
