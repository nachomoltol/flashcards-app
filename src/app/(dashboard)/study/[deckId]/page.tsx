'use client';

import { use, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { Trash2, Edit3, X, Lightbulb, Camera, Image as ImageIcon, Loader2, HelpCircle, BookOpen } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDeckStore, useCardStore, useSettingsStore, useLanguageStore, useStreakStore, type CardRow } from '@/stores';
import { toLocalDateString } from '@/lib/stats/streak';
import {
  previewNextIntervals,
  type FSRSRating,
} from '@/lib/fsrs';
import { FormattedCardView, parseMultipleChoice } from '@/components/cards';
import { StudyRatingHelpModal, SocraticTutorDrawer } from '@/components/study';

interface StudyPageProps {
  params: Promise<{ deckId: string }>;
}

// Helper para formatear intervalo relativo de próxima revisión
function formatInterval(dueIso: string): string {
  const diffMs = new Date(dueIso).getTime() - Date.now();
  if (diffMs <= 0) return '< 1m';
  const diffMinutes = Math.round(diffMs / (1000 * 60));
  if (diffMinutes < 1) return '< 1m';
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 30) return `${diffDays}d`;
  const diffMonths = Math.round(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo`;
  return `${Math.round(diffDays / 365)}y`;
}

export default function StudyPage({ params }: StudyPageProps) {
  const { deckId } = use(params);

  const { currentDeck, fetchDeckById } = useDeckStore();
  const { cards: allCards, isLoading, fetchCardsByDeck, recordReview, deleteCard, updateCard } = useCardStore();
  const { settings, fetchSettings } = useSettingsStore();
  const { t } = useLanguageStore();

  const [queue, setQueue] = useState<CardRow[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);
  const [sessionReviews, setSessionReviews] = useState<{ rating: FSRSRating; cardId: string }[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [reviewsTodayCount, setReviewsTodayCount] = useState<number>(0);

  // Estado para la edición y borrado de la tarjeta activa en modo estudio
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFront, setEditFront] = useState('');
  const [editBack, setEditBack] = useState('');
  const [editNote, setEditNote] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Estado para la nota rápida de la tarjeta activa (icono bombilla)
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [quickNoteText, setQuickNoteText] = useState('');
  const [quickNoteImageUrl, setQuickNoteImageUrl] = useState<string | null>(null);
  const [isSavingQuickNote, setIsSavingQuickNote] = useState(false);
  const [isUploadingNoteImage, setIsUploadingNoteImage] = useState(false);
  const noteImageInputRef = useRef<HTMLInputElement>(null);
  const cardScrollContainerRef = useRef<HTMLDivElement>(null);

  // Estado para el modal de ayuda contextual con la Regla de Oro FSRS
  const [isRatingHelpOpen, setIsRatingHelpOpen] = useState(false);

  // Estados para el Tutor Socrático Post-Fallo
  const [isTutorDrawerOpen, setIsTutorDrawerOpen] = useState(false);
  const [selectedOptionForTutor, setSelectedOptionForTutor] = useState<string | undefined>(undefined);

  // Función unificada para revelar respuesta
  const handleReveal = useCallback(() => {
    setIsAnswerRevealed(true);
  }, []);

  // Auto-scroll reactivo al revelar la respuesta para centrar la justificación técnica
  useEffect(() => {
    if (isAnswerRevealed && cardScrollContainerRef.current) {
      const timer = setTimeout(() => {
        if (cardScrollContainerRef.current) {
          cardScrollContainerRef.current.scrollTo({
            top: cardScrollContainerRef.current.scrollHeight,
            behavior: 'smooth',
          });
        }
      }, 50);
      return () => clearTimeout(timer);
    } else if (!isAnswerRevealed && cardScrollContainerRef.current) {
      cardScrollContainerRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [isAnswerRevealed, currentIndex]);

  // Consultar cantidad de repasos guardados hoy en este mazo desde Supabase
  const fetchTodayReviewsCount = useCallback(async () => {
    try {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const { data: deckCards } = await supabase
        .from('cards')
        .select('id')
        .eq('deck_id', deckId);

      if (deckCards && deckCards.length > 0) {
        const cardIds = deckCards.map((c) => c.id);
        const { count, error } = await supabase
          .from('reviews')
          .select('*', { count: 'exact', head: true })
          .in('card_id', cardIds)
          .gte('created_at', startOfToday.toISOString());

        if (!error && typeof count === 'number') {
          setReviewsTodayCount(count);
        }
      }
    } catch (err) {
      console.warn('Error al consultar repasos de hoy:', err);
    }
  }, [deckId]);

  // Cargar datos reales de Supabase
  useEffect(() => {
    fetchSettings();
    fetchDeckById(deckId);
    fetchTodayReviewsCount();
    fetchCardsByDeck(deckId).then((loaded) => {
      // Ordenar: primero las pendientes (due <= now()), o todas si no hay vencidas
      const now = new Date();
      const dueCards = loaded.filter((c) => new Date(c.due) <= now);
      const studyQueue = dueCards.length > 0 ? dueCards : loaded;
      setQueue(studyQueue);
      setIsInitialized(true);
    });
  }, [deckId, fetchDeckById, fetchCardsByDeck, fetchSettings, fetchTodayReviewsCount]);

  const isSessionFinished = isInitialized && (queue.length === 0 || currentIndex >= queue.length);
  const currentCard = !isSessionFinished && queue.length > 0 ? queue[currentIndex] : null;

  // Racha diaria: se sincroniza al calificar la primera tarjeta (handleRate); aquí queda como
  // respaldo al completar la cola si la sincronización inicial falló.
  const streakInfo = useStreakStore((s) => s.streak);
  const streakSyncedRef = useRef(false);
  useEffect(() => {
    if (!isSessionFinished || sessionReviews.length === 0 || streakSyncedRef.current) return;
    streakSyncedRef.current = true;
    const todayStr = toLocalDateString(new Date());
    useStreakStore
      .getState()
      .syncDailyStudy(todayStr)
      .then((res) => {
        if (!res) streakSyncedRef.current = false;
      });
  }, [isSessionFinished, sessionReviews.length]);

  // Previsualización de los 4 intervalos FSRS calculados para la tarjeta activa
  const nextIntervals = useMemo(() => {
    if (!currentCard) return null;
    return previewNextIntervals(
      {
        due: currentCard.due,
        stability: currentCard.stability,
        difficulty: currentCard.difficulty,
        state: currentCard.state,
        reps: currentCard.reps,
        lapses: currentCard.lapses,
        last_review: currentCard.last_review,
      },
      undefined,
      {
        request_retention: settings.request_retention,
        maximum_interval: settings.maximum_interval,
        enable_fuzz: settings.enable_fuzz,
      }
    );
  }, [currentCard, settings]);

  // Cantidad total de tarjetas repasadas hoy en este mazo
  const cardsReviewedTodayTotal = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const cardsFromStore = allCards.filter(
      (c) => c.last_review && new Date(c.last_review) >= startOfToday
    ).length;

    const uniqueSessionCards = new Set(sessionReviews.map((r) => r.cardId)).size;
    return Math.max(reviewsTodayCount, cardsFromStore, uniqueSessionCards);
  }, [allCards, reviewsTodayCount, sessionReviews]);

  // Manejador de calificación de la tarjeta con FSRS y guardado en Supabase
  const handleRate = useCallback(
    async (rating: FSRSRating) => {
      if (!currentCard) return;

      if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      // Registrar repaso persistente en Supabase (actualiza cards e inserta en reviews)
      const result = await recordReview(currentCard, rating);

      // Racha diaria: contabilizar el día al calificar con éxito la primera tarjeta de la sesión
      if (result && !streakSyncedRef.current) {
        streakSyncedRef.current = true;
        useStreakStore
          .getState()
          .syncDailyStudy(toLocalDateString(new Date()))
          .then((res) => {
            if (!res) streakSyncedRef.current = false;
          });
      }

      // Registrar en el resumen de la sesión
      setSessionReviews((prev) => [...prev, { rating, cardId: currentCard.id }]);

      // Si califica Again (1), reinsertar al final de la cola para volver a repasarla
      if (result && result.isAgain) {
        setQueue((prev) => [...prev, result.updatedCard]);
      }

      // Si califica Again (1), mantener la tarjeta en pantalla y abrir el Tutor Socrático
      if (rating === 1) {
        setIsTutorDrawerOpen(true);
        return;
      }

      // Avanzar a la siguiente tarjeta para calificaciones exitosas (2, 3 o 4)
      setIsAnswerRevealed(false);
      setSelectedOptionForTutor(undefined);
      setCurrentIndex((prev) => prev + 1);
    },
    [currentCard, recordReview]
  );

  // Avanzar a la siguiente tarjeta tras la interacción o decisión en el Tutor Socrático
  const handleContinueAfterAgain = useCallback(() => {
    setIsTutorDrawerOpen(false);
    setSelectedOptionForTutor(undefined);
    setIsAnswerRevealed(false);
    setCurrentIndex((prev) => prev + 1);
  }, []);

  // Borrar tarjeta de Supabase, extraerla de la cola de estudio y saltar a la siguiente tarjeta automáticamente
  const handleDeleteCurrentCard = async () => {
    if (!currentCard) return;

    const confirmed = window.confirm(
      t(
        'study.confirm_delete_card',
        '¿Estás seguro de que deseas eliminar esta tarjeta permanentemente de tu mazo? Esta acción no se puede deshacer.'
      )
    );
    if (!confirmed) return;

    const cardIdToDelete = currentCard.id;
    const success = await deleteCard(cardIdToDelete);
    if (success) {
      const newQueue = queue.filter((c) => c.id !== cardIdToDelete);
      setQueue(newQueue);
      setIsAnswerRevealed(false);
      fetchDeckById(deckId);
    }
  };

  // Abrir modal de edición para la tarjeta actual
  const handleOpenEditModal = () => {
    if (!currentCard) return;
    setEditFront(currentCard.front);
    setEditBack(currentCard.back);
    setEditNote(currentCard.notes || '');
    setIsEditModalOpen(true);
  };

  // Guardar edición de la tarjeta en Supabase y actualizar la cola local
  const handleSaveCardEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCard || !editFront.trim() || !editBack.trim()) return;

    setIsSavingEdit(true);
    try {
      const finalNotes = editNote.trim() || null;

      const updated = await updateCard(currentCard.id, {
        front: editFront.trim(),
        back: editBack.trim(),
        notes: finalNotes,
      });

      if (updated) {
        setQueue((prev) =>
          prev.map((c) =>
            c.id === currentCard.id
              ? { ...c, front: editFront.trim(), back: editBack.trim(), notes: finalNotes }
              : c
          )
        );
        setIsEditModalOpen(false);
      }
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Abrir modal rápido exclusivo de la nota de estudio (icono bombilla)
  const handleOpenNoteModal = () => {
    if (!currentCard) return;
    setQuickNoteText(currentCard.notes || '');
    setQuickNoteImageUrl(currentCard.note_image_url || null);
    setIsNoteModalOpen(true);
  };

  // Subir imagen para la nota a Supabase Storage (bucket study-notes)
  const handleUploadNoteImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert(t('study.invalid_image_type', 'Por favor selecciona un archivo de imagen válido (JPG, PNG, WebP o GIF).'));
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert(t('study.image_too_large', 'La imagen no puede superar los 10MB.'));
      return;
    }

    setIsUploadingNoteImage(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const userId = user?.id || 'anon';
      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
      const filePath = `${userId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('study-notes')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('study-notes').getPublicUrl(filePath);

      setQuickNoteImageUrl(publicUrl);
    } catch (err: unknown) {
      console.error('Error subiendo imagen de nota:', err);
      alert(t('study.image_upload_error', 'Error al subir la imagen a Supabase Storage.'));
    } finally {
      setIsUploadingNoteImage(false);
      if (noteImageInputRef.current) {
        noteImageInputRef.current.value = '';
      }
    }
  };

  // Eliminar imagen de la nota
  const handleRemoveNoteImage = async () => {
    if (!quickNoteImageUrl) return;
    try {
      const parts = quickNoteImageUrl.split('/study-notes/');
      if (parts.length > 1) {
        const pathInBucket = decodeURIComponent(parts[1]);
        await supabase.storage.from('study-notes').remove([pathInBucket]);
      }
    } catch (err) {
      console.warn('Advertencia al eliminar imagen del bucket:', err);
    }
    setQuickNoteImageUrl(null);
  };

  // Guardar nota específica en Supabase y actualizar la cola local
  const handleSaveQuickNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCard) return;

    setIsSavingQuickNote(true);
    try {
      const finalNote = quickNoteText.trim() || null;
      const finalImageUrl = quickNoteImageUrl || null;

      const updated = await updateCard(currentCard.id, {
        notes: finalNote,
        note_image_url: finalImageUrl,
      });

      if (updated) {
        setQueue((prev) =>
          prev.map((c) =>
            c.id === currentCard.id
              ? { ...c, notes: finalNote, note_image_url: finalImageUrl }
              : c
          )
        );
        setIsNoteModalOpen(false);
      }
    } finally {
      setIsSavingQuickNote(false);
    }
  };

  // Atajos de teclado: Espacio/Enter para revelar, 1-4 para calificar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditModalOpen || isNoteModalOpen || isRatingHelpOpen) return;

      if (
        e.target instanceof HTMLElement &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable)
      ) {
        return;
      }

      // Desenfocar cualquier elemento activo para evitar interferencias de foco del navegador
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      // Si el Tutor Socrático está desplegado, Espacio o Enter avanzan directamente a la siguiente tarjeta
      if (isTutorDrawerOpen) {
        if (e.code === 'Space' || e.key === ' ' || e.code === 'Enter') {
          e.preventDefault();
          handleContinueAfterAgain();
        }
        return;
      }

      if (!isAnswerRevealed) {
        if (e.code === 'Space' || e.key === ' ' || e.code === 'Enter') {
          e.preventDefault();
          handleReveal();
        }
      } else {
        if (e.key === '1') {
          e.preventDefault();
          handleRate(1);
        } else if (e.key === '2') {
          e.preventDefault();
          handleRate(2);
        } else if (e.key === '3') {
          e.preventDefault();
          handleRate(3);
        } else if (e.key === '4') {
          e.preventDefault();
          handleRate(4);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAnswerRevealed, handleRate, handleReveal, isEditModalOpen, isNoteModalOpen, isRatingHelpOpen, isTutorDrawerOpen, handleContinueAfterAgain]);

  // Estado de carga inicial
  if (isLoading && !isInitialized) {
    return (
      <div className="p-16 text-center text-neutral-400 text-sm">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        {t('study.loading_cards')}
      </div>
    );
  }

  // Si el mazo no tiene tarjetas en la base de datos
  if (isInitialized && allCards.length === 0) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-6 animate-in fade-in">
        <div className="w-16 h-16 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center justify-center text-neutral-400 dark:text-neutral-500 mx-auto shadow-sm">
          <svg className="w-8 h-8 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold text-neutral-900 dark:text-white tracking-tight">{t('study.empty_deck_title')}</h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
            {t('study.empty_deck_desc')}
          </p>
        </div>
        <Link
          href={`/decks/${deckId}`}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition shadow-lg shadow-indigo-600/25"
        >
          {t('study.go_to_editor')}
        </Link>
      </div>
    );
  }

  // Pantalla de sesión completada (Gamificación: Zero Inbox)
  if (isSessionFinished) {
    const counts = {
      again: sessionReviews.filter((r) => r.rating === 1).length,
      hard: sessionReviews.filter((r) => r.rating === 2).length,
      good: sessionReviews.filter((r) => r.rating === 3).length,
      easy: sessionReviews.filter((r) => r.rating === 4).length,
    };

    return (
      <div className="max-w-2xl mx-auto py-6 sm:py-10 px-4 text-center space-y-6 sm:space-y-7 animate-in fade-in duration-300 overflow-y-auto max-h-[100dvh]">
        {/* Animated Trophy & Emojis Header */}
        <div className="relative inline-block mx-auto">
          {/* Floating celebratory emojis */}
          <div className="absolute -top-3 -left-4 text-2xl animate-bounce duration-1000">🎉</div>
          <div className="absolute -top-4 -right-3 text-xl animate-pulse">✨</div>
          <div className="absolute -bottom-2 -left-3 text-xl animate-pulse">⚡</div>
          <div className="absolute -bottom-2 -right-4 text-2xl animate-bounce duration-700">🏆</div>

          <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-emerald-500/25 via-indigo-500/20 to-teal-500/25 border-2 border-emerald-500/40 mx-auto flex items-center justify-center text-emerald-400 shadow-2xl shadow-emerald-500/20">
            <span className="text-4xl select-none">🏆</span>
          </div>
        </div>

        {/* Motivational Zero Inbox Heading */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30 shadow-sm">
            <span>🎉</span>
            <span>{t('study.zero_inbox_badge')}</span>
            <span>✨</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold text-neutral-900 dark:text-white tracking-tight">
            {t('study.zero_inbox_title')}
          </h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300 max-w-lg mx-auto leading-relaxed">
            {t('study.zero_inbox_desc')}
          </p>
        </div>

        {/* Celebración de racha diaria protegida */}
        {streakInfo.studiedToday && streakInfo.current > 0 && (
          <div
            id="streak-secured-banner"
            className="streak-celebrate mx-auto w-full max-w-md p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 dark:from-amber-950/40 dark:via-orange-950/30 dark:to-amber-950/40 border border-amber-300 dark:border-amber-500/40 flex items-center gap-3 sm:gap-4 text-left"
          >
            <span className="streak-flame-anim text-4xl sm:text-5xl select-none drop-shadow-[0_0_10px_rgba(245,158,11,0.7)]" aria-hidden="true">
              🔥
            </span>
            <div className="min-w-0">
              <p className="text-base sm:text-lg font-extrabold text-amber-700 dark:text-amber-300 leading-tight">
                {t('study.streak_secured_title')}
              </p>
              <p className="text-sm font-bold text-neutral-900 dark:text-white">
                {streakInfo.current === 1
                  ? t('study.streak_secured_day')
                  : t('study.streak_secured_days', { days: streakInfo.current })}
                {streakInfo.max > streakInfo.current && (
                  <span className="ml-2 text-[11px] font-mono font-medium text-neutral-500 dark:text-neutral-400">
                    {t('study.streak_secured_record', { days: streakInfo.max })}
                  </span>
                )}
              </p>
              <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
                {t('study.streak_secured_desc')}
              </p>
            </div>
          </div>
        )}

        {/* Key Summary Metric Banner: Tarjetas repasadas hoy en este mazo */}
        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-indigo-50/70 via-violet-50/50 to-emerald-50/70 dark:from-indigo-950/40 dark:via-violet-950/30 dark:to-emerald-950/40 border border-indigo-200 dark:border-indigo-500/30 shadow-lg text-left flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/15 dark:bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-xl shrink-0">
              📊
            </div>
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300 block">
                {t('study.daily_summary')}
              </span>
              <p className="text-sm sm:text-base font-bold text-neutral-900 dark:text-white">
                {t('study.cards_reviewed_today')}
              </p>
              <span className="text-xs text-neutral-600 dark:text-neutral-400">
                {t('study.reviews_in_session', { count: sessionReviews.length, unit: sessionReviews.length === 1 ? t('study.review_singular') : t('study.review_plural') })}
              </span>
            </div>
          </div>

          <div className="sm:text-right w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-neutral-200 dark:border-neutral-800">
            <div className="inline-flex items-baseline gap-1.5 bg-emerald-500/10 border border-emerald-500/25 px-4 py-2 rounded-xl">
              <span className="text-2xl sm:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                {cardsReviewedTodayTotal}
              </span>
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">{t('study.cards_unit')}</span>
            </div>
          </div>
        </div>

        {/* Resumen de calificaciones de la sesión */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800 text-left">
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
            <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wider block">
              {t('study.rating_again_sub')}
            </span>
            <span className="text-2xl font-bold text-neutral-900 dark:text-white mt-1 block">{counts.again}</span>
          </div>
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">
              {t('study.rating_hard_sub')}
            </span>
            <span className="text-2xl font-bold text-neutral-900 dark:text-white mt-1 block">{counts.hard}</span>
          </div>
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
              {t('study.rating_good_sub')}
            </span>
            <span className="text-2xl font-bold text-neutral-900 dark:text-white mt-1 block">{counts.good}</span>
          </div>
          <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20">
            <span className="text-[11px] font-semibold text-sky-600 dark:text-sky-400 uppercase tracking-wider block">
              {t('study.rating_easy_sub')}
            </span>
            <span className="text-2xl font-bold text-neutral-900 dark:text-white mt-1 block">{counts.easy}</span>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            onClick={() => {
              setQueue(allCards);
              setCurrentIndex(0);
              setIsAnswerRevealed(false);
              setIsTutorDrawerOpen(false);
              setSelectedOptionForTutor(undefined);
              setSessionReviews([]);
            }}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-white font-medium text-sm border dark:border-neutral-700 transition"
          >
            {t('study.review_again_btn')}
          </button>
          <Link
            href={`/decks/${deckId}`}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-white hover:bg-neutral-100 text-neutral-700 border-neutral-200 dark:bg-neutral-900 dark:hover:bg-neutral-800 dark:text-neutral-300 font-medium text-sm border dark:border-neutral-800 transition"
          >
            {t('study.view_deck_btn')}
          </Link>
          <Link
            href="/"
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition shadow-lg shadow-indigo-600/25"
          >
            {t('study.back_to_dashboard')}
          </Link>
        </div>
      </div>
    );
  }

  // Tarjeta actual
  const remainingCount = queue.length - currentIndex;
  const progressPercent = Math.round((currentIndex / queue.length) * 100);

  const stateLabels = [
    t('study.state_new'),
    t('study.state_learning'),
    t('study.state_review'),
    t('study.state_relearning'),
  ];
  const stateBadgeStyles = [
    'bg-blue-500/10 text-blue-400 border-blue-500/20',
    'bg-amber-500/10 text-amber-400 border-amber-500/20',
    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    'bg-rose-500/10 text-rose-400 border-rose-500/20',
  ];

  return (
    <div className="w-full max-w-3xl mx-auto h-[100dvh] md:h-full max-h-[100dvh] flex flex-col justify-between p-2.5 sm:p-4 md:p-6 overflow-hidden animate-in fade-in duration-200">
      {/* Top Header & Session Counters */}
      <div className="shrink-0 space-y-2 pb-2">
        <div className="flex items-center justify-between gap-3">
          <Link
            href={`/decks/${deckId}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition group py-1"
          >
            <svg
              className="w-4 h-4 transition-transform group-hover:-translate-x-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="truncate max-w-[170px] sm:max-w-none">
              {currentDeck?.title ? t('study.exit_deck', { deck: currentDeck.title }) : t('study.exit_session')}
            </span>
          </Link>

          {/* Counter of Remaining Cards & Contextual Help Button */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <div className="flex items-center gap-1 text-[11px] sm:text-xs">
              <span className="text-neutral-500 dark:text-neutral-400 hidden sm:inline">{t('study.progress_label')}</span>
              <span className="font-semibold text-neutral-900 dark:text-white">
                {currentIndex + 1} / {queue.length}
              </span>
            </div>

            <span className="text-[10px] sm:text-xs px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              {remainingCount} {remainingCount === 1 ? t('study.remaining_singular') : t('study.remaining_plural')}
            </span>

            {/* Botón con icono de ayuda ? en la cabecera superior */}
            <button
              type="button"
              onClick={() => setIsRatingHelpOpen(true)}
              className="p-1 sm:p-1.5 rounded-lg text-neutral-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition active:scale-95 cursor-pointer flex items-center justify-center border border-transparent hover:border-neutral-200 dark:hover:border-neutral-700"
              title={t('study_help.open_button', 'Regla de Oro de Calificación FSRS')}
              aria-label={t('study_help.open_button', 'Regla de Oro de Calificación FSRS')}
            >
              <HelpCircle className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-neutral-200 dark:bg-neutral-900 rounded-full h-1 sm:h-1.5 overflow-hidden">
          <div
            className="bg-gradient-to-r from-indigo-500 to-violet-500 h-full rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Main Isolated Card Container */}
      <div className="flex-1 min-h-0 flex flex-col justify-between rounded-2xl sm:rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 backdrop-blur-xl p-3 sm:p-5 md:p-6 shadow-xl shadow-neutral-200/50 dark:shadow-2xl relative transition-all my-1.5 sm:my-3">
        {/* Card Header Information */}
        <div className="shrink-0 flex items-center justify-between pb-2 sm:pb-3 border-b border-neutral-200 dark:border-neutral-800/60 relative z-20">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span
              className={`text-[9px] sm:text-[10px] px-2 py-0.5 rounded-md uppercase tracking-wider font-semibold border ${
                stateBadgeStyles[currentCard?.state ?? 0]
              }`}
            >
              {stateLabels[currentCard?.state ?? 0]}
            </span>
            {(() => {
              const fmt =
                currentCard?.cardFormat ||
                currentCard?.card_format ||
                (currentCard?.card_type === 'cloze' ? 'cloze' : 'basic');
              const badges: Record<string, { label: string; style: string }> = {
                basic: { label: t('study.badge_basic'), style: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
                multiple_choice: { label: t('study.badge_mc'), style: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
                cloze: { label: t('study.badge_cloze'), style: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' },
                true_false: { label: t('study.badge_tf'), style: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
              };
              const item = badges[fmt] || { label: fmt, style: 'bg-neutral-800 text-neutral-400 border-neutral-700' };
              return (
                <span className={`text-[9px] sm:text-[10px] px-2 py-0.5 rounded-md uppercase tracking-wider font-medium border ${item.style}`}>
                  {item.label}
                </span>
              );
            })()}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="text-[10px] sm:text-[11px] text-neutral-500 font-mono hidden xs:inline-block">
              Reps: {currentCard?.reps ?? 0} | Lapsos: {currentCard?.lapses ?? 0} | Est.: {currentCard?.stability?.toFixed(1) ?? '0.0'}
            </div>

            {/* Acciones de Tarjeta: Bombilla de Notas, Editar y Borrar */}
            <div className="flex items-center gap-1 shrink-0">
              {/* Bombilla con Tooltip / Popover nativo al hacer hover y click para abrir modal rápido */}
              <div className="relative group">
                <button
                  type="button"
                  onClick={handleOpenNoteModal}
                  className={`p-1.5 rounded-lg transition active:scale-90 cursor-pointer flex items-center justify-center ${
                    Boolean((currentCard?.notes && currentCard.notes.trim()) || currentCard?.note_image_url)
                      ? 'text-amber-500 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 shadow-sm shadow-amber-500/10'
                      : 'text-neutral-400 hover:text-amber-500 hover:bg-amber-500/10 dark:hover:bg-neutral-800'
                  }`}
                  title={
                    currentCard?.notes && currentCard.notes.trim()
                      ? currentCard.notes.trim()
                      : t('study.add_note_tooltip', 'Añadir nota aclaratoria')
                  }
                >
                  <Lightbulb
                    className={`w-4 h-4 transition-transform duration-200 group-hover:scale-110 ${
                      Boolean((currentCard?.notes && currentCard.notes.trim()) || currentCard?.note_image_url)
                        ? 'fill-amber-400 text-amber-500 dark:text-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.5)]'
                        : ''
                    }`}
                  />
                </button>

                {/* Popover / Tooltip hover enriquecido con texto e imagen multimedia */}
                <div className="absolute right-0 top-full mt-2 hidden group-hover:block z-50 pointer-events-none transition-all duration-150 animate-in fade-in zoom-in-95">
                  <div className="w-72 max-w-sm p-3.5 rounded-xl bg-neutral-900/95 dark:bg-neutral-950/95 text-white border border-neutral-700/70 shadow-2xl backdrop-blur-md text-xs leading-relaxed space-y-2">
                    <div className="flex items-center gap-1.5 font-semibold text-[11px] text-amber-400 border-b border-neutral-700/50 pb-1">
                      <Lightbulb className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      <span>{t('study.note_tooltip_title', 'Nota Aclaratoria')}</span>
                    </div>

                    {/* Previsualización de imagen adjunta en el popover */}
                    {currentCard?.note_image_url && (
                      <div className="rounded-lg overflow-hidden border border-neutral-700/60 bg-black/40 max-h-48 flex items-center justify-center p-0.5">
                        <img
                          src={currentCard.note_image_url}
                          alt="Nota visual"
                          className="w-full h-auto max-h-44 object-contain rounded-md"
                        />
                      </div>
                    )}

                    {Boolean(currentCard?.notes && currentCard.notes.trim()) ? (
                      <p className="text-neutral-200 text-[11px] max-h-36 overflow-y-auto whitespace-pre-wrap">
                        {currentCard?.notes?.trim()}
                      </p>
                    ) : !currentCard?.note_image_url ? (
                      <p className="text-neutral-400 text-[11px] italic">
                        {t('study.add_note_tooltip', 'Añadir nota aclaratoria')}
                      </p>
                    ) : null}

                    <div className="pt-1 text-[10px] text-neutral-400 border-t border-neutral-800/80">
                      {t('study.click_to_edit_note', 'Haz clic en la bombilla para editar')}
                    </div>
                  </div>
                </div>
              </div>

              {/* Editar tarjeta */}
              <button
                type="button"
                onClick={handleOpenEditModal}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition active:scale-90 cursor-pointer"
                title={t('study.edit_card', 'Editar tarjeta')}
              >
                <Edit3 className="w-4 h-4" />
              </button>
              {/* Borrar tarjeta */}
              <button
                type="button"
                onClick={handleDeleteCurrentCard}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition active:scale-90 cursor-pointer"
                title={t('study.delete_card', 'Eliminar tarjeta')}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Dynamic Card Content Rendered according to Format - Internal Scroll for Long Content */}
        {currentCard && (
          <div
            ref={cardScrollContainerRef}
            className="flex-1 min-h-0 overflow-y-auto pr-2 sm:pr-3 py-1.5 overscroll-contain"
          >
            <FormattedCardView
              cardId={currentCard.id}
              front={currentCard.front}
              back={currentCard.back}
              notes={currentCard.notes}
              noteImageUrl={currentCard.note_image_url}
              cardFormat={
                currentCard.cardFormat ||
                currentCard.card_format ||
                (currentCard.card_type === 'cloze' ? 'cloze' : 'basic')
              }
              isRevealed={isAnswerRevealed}
              interactive={true}
              onOptionSelect={(opt) => setSelectedOptionForTutor(opt)}
            />
          </div>
        )}

        {!isAnswerRevealed && (
          <div className="shrink-0 text-center py-1 hidden sm:block">
            <p className="text-xs text-neutral-500">
              {t('study.press_space_hint', { key: t('study.space_key') })}
            </p>
          </div>
        )}

        {/* Bottom Actions Bar */}
        <div className="shrink-0 pt-2 sm:pt-3 border-t border-neutral-200 dark:border-neutral-800/60">
          {!isAnswerRevealed ? (
            /* Button: Mostrar respuesta */
            <button
              type="button"
              onClick={(e) => {
                (e.currentTarget as HTMLElement)?.blur();
                handleReveal();
              }}
              className="w-full py-3 sm:py-3.5 px-4 min-h-[46px] sm:min-h-[52px] rounded-xl sm:rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm sm:base transition-all duration-150 shadow-xl shadow-indigo-600/25 active:scale-[0.99] flex items-center justify-center gap-2 group cursor-pointer"
            >
              <span>{t('study.show_answer')}</span>
              <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono rounded bg-neutral-200/60 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 ml-2">
                {t('study.space_key') || 'Espacio'}
              </kbd>
            </button>
          ) : isTutorDrawerOpen ? (
            /* Cajón Sutil del Tutor Socrático tras fallo con Again */
            <SocraticTutorDrawer
              isOpen={isTutorDrawerOpen}
              deckTitle={currentDeck?.title || 'Estudio'}
              question={currentCard?.front || ''}
              options={
                currentCard?.card_type === 'multiple_choice' || currentCard?.card_format === 'multiple_choice'
                  ? parseMultipleChoice(currentCard.front).options.map((o) => `${o.key}) ${o.text}`)
                  : undefined
              }
              correctAnswer={currentCard?.back || ''}
              selectedAnswer={selectedOptionForTutor}
              onContinue={handleContinueAfterAgain}
            />
          ) : (
            /* FSRS 4 Rating Buttons */
            <div className="space-y-1.5 sm:space-y-2 animate-in fade-in duration-200">
              <div className="grid grid-cols-4 gap-1.5 sm:gap-2.5">
                {/* 1 = Again (Fallo) */}
                <button
                  type="button"
                  onClick={(e) => {
                    (e.currentTarget as HTMLElement)?.blur();
                    handleRate(1);
                  }}
                  className="p-1 sm:p-2.5 min-h-[52px] sm:min-h-[70px] rounded-xl sm:rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 active:bg-rose-500/30 text-rose-700 dark:text-rose-300 border border-rose-500/30 hover:border-rose-500/50 transition-all duration-150 flex flex-col items-center justify-center gap-0.5 sm:gap-1.5 group active:scale-95 shadow-sm cursor-pointer relative"
                >
                  <span className="absolute top-1 sm:top-1.5 right-1.5 sm:right-2 hidden sm:block">
                    <kbd className="text-[10px] font-mono opacity-60">1</kbd>
                  </span>
                  <span className="text-[10px] sm:text-xs font-mono font-bold px-1.5 sm:px-2 py-0 sm:py-0.5 rounded-full bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                    {nextIntervals ? formatInterval(nextIntervals[1].due) : '10m'}
                  </span>
                  <span className="font-semibold text-[11px] sm:text-xs md:text-sm text-neutral-900 dark:text-white text-center leading-tight">
                    {t('study.rating_again')}
                  </span>
                </button>

                {/* 2 = Hard (Difícil) */}
                <button
                  type="button"
                  onClick={(e) => {
                    (e.currentTarget as HTMLElement)?.blur();
                    handleRate(2);
                  }}
                  className="p-1 sm:p-2.5 min-h-[52px] sm:min-h-[70px] rounded-xl sm:rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 active:bg-amber-500/30 text-amber-700 dark:text-amber-300 border border-amber-500/30 hover:border-amber-500/50 transition-all duration-150 flex flex-col items-center justify-center gap-0.5 sm:gap-1.5 group active:scale-95 shadow-sm cursor-pointer relative"
                >
                  <span className="absolute top-1 sm:top-1.5 right-1.5 sm:right-2 hidden sm:block">
                    <kbd className="text-[10px] font-mono opacity-60">2</kbd>
                  </span>
                  <span className="text-[10px] sm:text-xs font-mono font-bold px-1.5 sm:px-2 py-0 sm:py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                    {nextIntervals ? formatInterval(nextIntervals[2].due) : '3h'}
                  </span>
                  <span className="font-semibold text-[11px] sm:text-xs md:text-sm text-neutral-900 dark:text-white text-center leading-tight">
                    {t('study.rating_hard')}
                  </span>
                </button>

                {/* 3 = Good (Correcto) */}
                <button
                  type="button"
                  onClick={(e) => {
                    (e.currentTarget as HTMLElement)?.blur();
                    handleRate(3);
                  }}
                  className="p-1 sm:p-2.5 min-h-[52px] sm:min-h-[70px] rounded-xl sm:rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/20 active:bg-emerald-500/30 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 hover:border-emerald-500/50 transition-all duration-150 flex flex-col items-center justify-center gap-0.5 sm:gap-1.5 group active:scale-95 shadow-sm cursor-pointer relative"
                >
                  <span className="absolute top-1 sm:top-1.5 right-1.5 sm:right-2 hidden sm:block">
                    <kbd className="text-[10px] font-mono opacity-60">3</kbd>
                  </span>
                  <span className="text-[10px] sm:text-xs font-mono font-bold px-1.5 sm:px-2 py-0 sm:py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                    {nextIntervals ? formatInterval(nextIntervals[3].due) : '1d'}
                  </span>
                  <span className="font-semibold text-[11px] sm:text-xs md:text-sm text-neutral-900 dark:text-white text-center leading-tight">
                    {t('study.rating_good')}
                  </span>
                </button>

                {/* 4 = Easy (Fácil) */}
                <button
                  type="button"
                  onClick={(e) => {
                    (e.currentTarget as HTMLElement)?.blur();
                    handleRate(4);
                  }}
                  className="p-1 sm:p-2.5 min-h-[52px] sm:min-h-[70px] rounded-xl sm:rounded-2xl bg-sky-500/10 hover:bg-sky-500/20 active:bg-sky-500/30 text-sky-700 dark:text-sky-300 border border-sky-500/30 hover:border-sky-500/50 transition-all duration-150 flex flex-col items-center justify-center gap-0.5 sm:gap-1.5 group active:scale-95 shadow-sm cursor-pointer relative"
                >
                  <span className="absolute top-1 sm:top-1.5 right-1.5 sm:right-2 hidden sm:block">
                    <kbd className="text-[10px] font-mono opacity-60">4</kbd>
                  </span>
                  <span className="text-[10px] sm:text-xs font-mono font-bold px-1.5 sm:px-2 py-0 sm:py-0.5 rounded-full bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/30">
                    {nextIntervals ? formatInterval(nextIntervals[4].due) : '4d'}
                  </span>
                  <span className="font-semibold text-[11px] sm:text-xs md:text-sm text-neutral-900 dark:text-white text-center leading-tight">
                    {t('study.rating_easy')}
                  </span>
                </button>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-1.5">
                <span className="hidden sm:inline text-[11px] text-neutral-500">{t('study.rating_keys_hint')}</span>
                <span className="hidden sm:inline text-neutral-300 dark:text-neutral-700">•</span>
                <button
                  type="button"
                  onClick={() => setIsRatingHelpOpen(true)}
                  className="bg-neutral-100 hover:bg-neutral-200 text-neutral-800 hover:text-neutral-900 border border-neutral-300 dark:bg-neutral-800/80 dark:hover:bg-neutral-700 dark:border-neutral-700 dark:text-neutral-200 dark:hover:text-white px-3.5 py-1.5 rounded-full text-xs font-medium transition-all shadow-sm flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <BookOpen className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                  <span>{t('study_help.guide_pill_btn', '📖 Guía: Aprende a puntuar')}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Edición de Tarjeta en Modo Estudio */}
      {isEditModalOpen && currentCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 sm:p-6 shadow-2xl relative space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Header del Modal */}
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-sm font-bold">
                  ✏️
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-neutral-900 dark:text-white">
                    {t('study.edit_modal_title', 'Editar Tarjeta')}
                  </h3>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    {t('study.edit_modal_sub', 'Modifica la pregunta, respuestas o añade notas aclaratorias')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isSavingEdit}
                onClick={() => setIsEditModalOpen(false)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Formulario */}
            <form onSubmit={handleSaveCardEdit} className="space-y-4">
              {/* Anverso / Pregunta */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  {t('study.edit_front_label', 'Anverso / Pregunta')}
                </label>
                <textarea
                  rows={4}
                  required
                  disabled={isSavingEdit}
                  value={editFront}
                  onChange={(e) => setEditFront(e.target.value)}
                  placeholder={t('study.edit_front_placeholder', 'Escribe el enunciado de la pregunta u opciones...')}
                  className="w-full text-xs px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition shadow-inner"
                />
              </div>

              {/* Reverso / Respuesta */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  {t('study.edit_back_label', 'Reverso / Respuesta')}
                </label>
                <textarea
                  rows={4}
                  required
                  disabled={isSavingEdit}
                  value={editBack}
                  onChange={(e) => setEditBack(e.target.value)}
                  placeholder={t('study.edit_back_placeholder', 'Escribe la respuesta correcta o justificación...')}
                  className="w-full text-xs px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition shadow-inner"
                />
              </div>

              {/* Nota Aclaratoria Opcional */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 flex items-center justify-between">
                  <span>{t('study.edit_note_label', '💡 Añadir Nota Aclaratoria (Opcional)')}</span>
                  <span className="text-[10px] text-neutral-400">{t('study.edit_note_hint', 'Se añadirá al final del reverso')}</span>
                </label>
                <input
                  type="text"
                  disabled={isSavingEdit}
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder={t('study.edit_note_placeholder', 'ej. Excepción vista en clase / nemotecnia...')}
                  className="w-full text-xs px-3.5 py-2 rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition shadow-inner"
                />
              </div>

              {/* Botones de Acción */}
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-neutral-200 dark:border-neutral-800">
                <button
                  type="button"
                  disabled={isSavingEdit}
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition disabled:opacity-50 cursor-pointer"
                >
                  {t('common.cancel', 'Cancelar')}
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit || !editFront.trim() || !editBack.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition shadow-md shadow-indigo-600/25 active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {isSavingEdit ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>{t('study.saving_edit', 'Guardando...')}</span>
                    </>
                  ) : (
                    <span>{t('study.save_changes', 'Guardar cambios')}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Rápido de Nota de Estudio (Bombilla) */}
      {isNoteModalOpen && currentCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 sm:p-6 shadow-2xl relative space-y-4 animate-in zoom-in-95">
            {/* Header del Modal */}
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500 flex items-center justify-center">
                  <Lightbulb className="w-4 h-4 fill-amber-400 text-amber-500" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-neutral-900 dark:text-white">
                    {t('study.note_modal_title', 'Nota de Estudio')}
                  </h3>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    {t('study.note_modal_sub', 'Aparecerá al pasar el cursor sobre la bombilla durante el repaso')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isSavingQuickNote}
                onClick={() => setIsNoteModalOpen(false)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Formulario de la Nota */}
            <form onSubmit={handleSaveQuickNote} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  {t('study.note_content_label', 'Contenido de la nota')}
                </label>
                <textarea
                  rows={4}
                  autoFocus
                  disabled={isSavingQuickNote || isUploadingNoteImage}
                  value={quickNoteText}
                  onChange={(e) => setQuickNoteText(e.target.value)}
                  placeholder={t('study.note_content_placeholder', 'Escribe aquí tu aclaración, nemotecnia, regla clínica o detalle a recordar...')}
                  className="w-full text-xs px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition shadow-inner leading-relaxed"
                />
              </div>

              {/* Previsualización de la imagen adjunta */}
              {quickNoteImageUrl && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-medium text-neutral-700 dark:text-neutral-300">
                    <span className="flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-amber-500" />
                      <span>{t('study.attached_image', 'Imagen adjunta')}</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleRemoveNoteImage}
                      disabled={isSavingQuickNote || isUploadingNoteImage}
                      className="text-[11px] text-rose-500 hover:text-rose-600 dark:hover:text-rose-400 flex items-center gap-1 transition cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>{t('study.remove_image', 'Eliminar')}</span>
                    </button>
                  </div>
                  <div className="relative rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-neutral-950/40 max-h-48 flex items-center justify-center p-1 group">
                    <img
                      src={quickNoteImageUrl}
                      alt="Nota visual"
                      className="w-full h-auto max-h-44 object-contain rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={handleRemoveNoteImage}
                      className="absolute top-2 right-2 p-1.5 rounded-full bg-black/75 hover:bg-rose-600 text-white transition shadow-md cursor-pointer"
                      title={t('study.remove_image', 'Eliminar imagen')}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Botón camuflado estéticamente para subir/cambiar imagen */}
              <div className="flex items-center justify-between pt-1">
                <input
                  ref={noteImageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleUploadNoteImage}
                  disabled={isSavingQuickNote || isUploadingNoteImage}
                />
                <button
                  type="button"
                  onClick={() => noteImageInputRef.current?.click()}
                  disabled={isSavingQuickNote || isUploadingNoteImage}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 transition active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  {isUploadingNoteImage ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
                      <span>{t('study.uploading_image', 'Subiendo imagen...')}</span>
                    </>
                  ) : (
                    <>
                      <Camera className="w-3.5 h-3.5 text-amber-500" />
                      <span>
                        {quickNoteImageUrl
                          ? t('study.change_image', 'Cambiar imagen')
                          : t('study.add_image', 'Añadir imagen a la nota')}
                      </span>
                    </>
                  )}
                </button>
                <span className="text-[10px] text-neutral-400">
                  {t('study.image_max_size', 'Máx. 10MB')}
                </span>
              </div>

              {/* Botones de Acción */}
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-neutral-200 dark:border-neutral-800">
                <button
                  type="button"
                  disabled={isSavingQuickNote || isUploadingNoteImage}
                  onClick={() => setIsNoteModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition disabled:opacity-50 cursor-pointer"
                >
                  {t('common.cancel', 'Cancelar')}
                </button>
                <button
                  type="submit"
                  disabled={isSavingQuickNote || isUploadingNoteImage}
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 rounded-xl transition shadow-md shadow-amber-600/25 active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {isSavingQuickNote ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>{t('study.saving_edit', 'Guardando...')}</span>
                    </>
                  ) : (
                    <span>{t('study.save_note_btn', 'Guardar nota')}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Ayuda Contextual con la Regla de Oro de FSRS */}
      <StudyRatingHelpModal
        isOpen={isRatingHelpOpen}
        onClose={() => setIsRatingHelpOpen(false)}
      />
    </div>
  );
}
