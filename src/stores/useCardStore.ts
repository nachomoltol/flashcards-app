import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import {
  createInitialCardValues,
  scheduleReviewWithLog,
  buildInterleavedCombinedQueue,
  type FSRSRating,
} from '@/lib/fsrs';
import type { Database, CardFormat } from '@/types/database';
import { useSettingsStore } from './useSettingsStore';

export type CardRow = Database['public']['Tables']['cards']['Row'] & {
  decks?: {
    id: string;
    title: string;
    color: string | null;
  } | null;
};

interface CardState {
  cards: CardRow[];
  isLoading: boolean;
  error: string | null;
  fetchCardsByDeck: (deckId: string) => Promise<CardRow[]>;
  fetchCardsByDecks: (deckIds: string[], onlyDue?: boolean) => Promise<CardRow[]>;
  createCard: (
    deckId: string,
    front: string,
    back: string,
    cardType?: string,
    cardFormat?: CardFormat
  ) => Promise<CardRow | null>;
  createCardsBatch: (
    deckId: string,
    cardsToCreate: Array<{
      front: string;
      back: string;
      cardType?: string;
      cardFormat?: CardFormat;
    }>
  ) => Promise<CardRow[]>;
  deleteCard: (cardId: string) => Promise<boolean>;
  updateCard: (
    cardId: string,
    updates: Partial<Pick<CardRow, 'front' | 'back' | 'card_format' | 'cardFormat' | 'card_type' | 'notes' | 'note_image_url'>>
  ) => Promise<CardRow | null>;
  recordReview: (
    card: CardRow,
    rating: FSRSRating
  ) => Promise<{ updatedCard: CardRow; isAgain: boolean } | null>;
  reset: () => void;
}

export const useCardStore = create<CardState>((set) => ({
  cards: [],
  isLoading: false,
  error: null,

  reset: () => {
    set({ cards: [], isLoading: false, error: null });
  },

  fetchCardsByDeck: async (deckId: string) => {
    if (!deckId || deckId === 'undefined' || deckId === 'null' || !deckId.trim()) {
      return [];
    }

    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('cards')
        .select('*')
        .eq('deck_id', deckId.trim())
        .order('created_at', { ascending: false });

      if (error) throw error;

      const loadedCards = data || [];
      set({ cards: loadedCards, isLoading: false });
      return loadedCards;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al cargar las tarjetas';
      
      const isTransientOrEmpty =
        (typeof err === 'object' && err !== null && Object.keys(err).length === 0) ||
        (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'PGRST116');

      if (!isTransientOrEmpty) {
        console.warn('[useCardStore] Aviso al cargar tarjetas:', message);
      }

      set({ error: message, isLoading: false });
      return [];
    }
  },

  fetchCardsByDecks: async (deckIds: string[], onlyDue: boolean = true) => {
    if (!deckIds || deckIds.length === 0) {
      set({ cards: [], isLoading: false, error: null });
      return [];
    }

    set({ isLoading: true, error: null });
    try {
      const nowIso = new Date().toISOString();
      let query = supabase
        .from('cards')
        .select('*, decks(id, title, color)')
        .in('deck_id', deckIds);

      if (onlyDue) {
        query = query.lte('due', nowIso);
      }

      const { data, error } = await query;

      if (error) throw error;

      const loadedCards = (data as unknown as CardRow[]) || [];

      // Algoritmo Round-Robin para Mazos Combinados (Práctica Intercalada + FSRS):
      // - Tarjetas con historial FSRS (repaso/aprendizaje): gobernadas estrictamente por FSRS.
      // - Tarjetas nuevas sin historial: agrupadas por mazo y entrelazadas cíclicamente en Round-Robin.
      // - Salvo que se indique includeFuture: true, no se incluyen repasos futuros
      const interleavedCards = buildInterleavedCombinedQueue(loadedCards, deckIds, {
        includeFuture: !onlyDue,
      });

      set({ cards: interleavedCards, isLoading: false });
      return interleavedCards;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al cargar las tarjetas de los mazos seleccionados';
      console.error('Error fetching cards by decks:', err);
      set({ error: message, isLoading: false });
      return [];
    }
  },

  createCard: async (
    deckId: string,
    front: string,
    back: string,
    cardType = 'standard',
    cardFormat?: CardFormat
  ) => {
    set({ isLoading: true, error: null });
    try {
      const initialFSRS = createInitialCardValues();
      const resolvedFormat: CardFormat =
        cardFormat || (cardType === 'cloze' ? 'cloze' : 'basic');

      const { data, error } = await supabase
        .from('cards')
        .insert({
          deck_id: deckId,
          front: front.trim(),
          back: back.trim(),
          card_type: cardType,
          card_format: resolvedFormat,
          cardFormat: resolvedFormat,
          due: initialFSRS.due,
          stability: initialFSRS.stability,
          difficulty: initialFSRS.difficulty,
          state: initialFSRS.state,
          reps: initialFSRS.reps,
          lapses: initialFSRS.lapses,
          last_review: null,
        })
        .select()
        .single();

      if (error) throw error;

      set((state) => ({
        cards: [data, ...state.cards],
        isLoading: false,
      }));

      return data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al crear la tarjeta';
      console.error('Error creating card:', err);
      set({ error: message, isLoading: false });
      return null;
    }
  },

  createCardsBatch: async (deckId, cardsToCreate) => {
    if (!cardsToCreate || cardsToCreate.length === 0) return [];
    set({ isLoading: true, error: null });
    try {
      const initialFSRS = createInitialCardValues();
      const rows = cardsToCreate.map((card) => {
        const resolvedFormat: CardFormat =
          card.cardFormat || (card.cardType === 'cloze' ? 'cloze' : 'basic');
        return {
          deck_id: deckId,
          front: card.front.trim(),
          back: card.back.trim(),
          card_type: card.cardType || 'basic',
          card_format: resolvedFormat,
          cardFormat: resolvedFormat,
          due: initialFSRS.due,
          stability: initialFSRS.stability,
          difficulty: initialFSRS.difficulty,
          state: initialFSRS.state,
          reps: initialFSRS.reps,
          lapses: initialFSRS.lapses,
          last_review: null,
        };
      });

      const { data, error } = await supabase
        .from('cards')
        .insert(rows)
        .select();

      if (error) throw error;

      const insertedCards = (data || []) as CardRow[];
      set((state) => ({
        cards: [...insertedCards, ...state.cards],
        isLoading: false,
      }));

      return insertedCards;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al crear las tarjetas en lote';
      console.error('Error creating cards batch:', err);
      set({ error: message, isLoading: false });
      return [];
    }
  },

  deleteCard: async (cardId: string) => {
    try {
      const { error } = await supabase.from('cards').delete().eq('id', cardId);
      if (error) throw error;

      set((state) => ({
        cards: state.cards.filter((c) => c.id !== cardId),
      }));
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al eliminar la tarjeta';
      console.error('Error deleting card:', err);
      set({ error: message });
      return false;
    }
  },

  updateCard: async (cardId, updates) => {
    try {
      const { data, error } = await supabase
        .from('cards')
        .update(updates)
        .eq('id', cardId)
        .select()
        .single();

      if (error) throw error;

      set((state) => ({
        cards: state.cards.map((c) => (c.id === cardId ? data : c)),
      }));

      return data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al actualizar la tarjeta';
      console.error('Error updating card:', err);
      set({ error: message });
      return null;
    }
  },

  recordReview: async (card: CardRow, rating: FSRSRating) => {
    try {
      const userSettings = useSettingsStore.getState().settings;
      const customParams = {
        request_retention: userSettings.request_retention,
        maximum_interval: userSettings.maximum_interval,
        enable_fuzz: userSettings.enable_fuzz,
      };
      const { card: nextFSRS, review: reviewLog } = scheduleReviewWithLog(card, rating, undefined, customParams);

      // 1. Actualizar tarjeta en Supabase
      const { data: updatedCard, error: updateErr } = await supabase
        .from('cards')
        .update({
          due: nextFSRS.due,
          stability: nextFSRS.stability,
          difficulty: nextFSRS.difficulty,
          state: nextFSRS.state,
          reps: nextFSRS.reps,
          lapses: nextFSRS.lapses,
          last_review: nextFSRS.last_review,
        })
        .eq('id', card.id)
        .select()
        .single();

      if (updateErr) throw updateErr;

      // 2. Insertar log de revisión en Supabase
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      const { error: reviewErr } = await supabase.from('reviews').insert({
        card_id: card.id,
        user_id: currentUser?.id,
        rating: reviewLog.rating,
        state: reviewLog.state,
        stability: reviewLog.stability,
        difficulty: reviewLog.difficulty,
        due: reviewLog.due,
      });

      if (reviewErr) {
        console.warn('Advertencia al registrar review log:', reviewErr);
      }

      // 3. Actualizar store local
      set((state) => ({
        cards: state.cards.map((c) => (c.id === card.id ? updatedCard : c)),
      }));

      return {
        updatedCard,
        isAgain: rating === 1,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al guardar el repaso FSRS';
      console.error('Error in recordReview:', err);
      set({ error: message });
      return null;
    }
  },
}));
