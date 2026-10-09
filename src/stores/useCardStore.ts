import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import {
  createInitialCardValues,
  scheduleReviewWithLog,
  type FSRSRating,
} from '@/lib/fsrs';
import type { Database, CardFormat } from '@/types/database';
import { useSettingsStore } from './useSettingsStore';

export type CardRow = Database['public']['Tables']['cards']['Row'];

interface CardState {
  cards: CardRow[];
  isLoading: boolean;
  error: string | null;
  fetchCardsByDeck: (deckId: string) => Promise<CardRow[]>;
  createCard: (
    deckId: string,
    front: string,
    back: string,
    cardType?: string,
    cardFormat?: CardFormat
  ) => Promise<CardRow | null>;
  deleteCard: (cardId: string) => Promise<boolean>;
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
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('cards')
        .select('*')
        .eq('deck_id', deckId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const loadedCards = data || [];
      set({ cards: loadedCards, isLoading: false });
      return loadedCards;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al cargar las tarjetas';
      console.error('Error fetching cards:', err);
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
