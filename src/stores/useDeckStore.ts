import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

export type DeckRow = Database['public']['Tables']['decks']['Row'];

export interface DeckWithStats extends DeckRow {
  cardsCount: number;
  dueCount: number;
  childrenCount?: number;
}

export interface CreateDeckOptions {
  title: string;
  description?: string;
  color?: string;
  isFolder?: boolean;
  is_folder?: boolean;
  parentId?: string | null;
  parent_id?: string | null;
}

interface DeckState {
  decks: DeckWithStats[];
  currentDeck: DeckWithStats | null;
  isLoading: boolean;
  error: string | null;
  fetchDecks: () => Promise<void>;
  fetchDeckById: (id: string) => Promise<DeckWithStats | null>;
  createDeck: (
    titleOrOptions: string | CreateDeckOptions,
    description?: string,
    color?: string,
    isFolder?: boolean,
    parentId?: string | null
  ) => Promise<DeckWithStats | null>;
  deleteDeck: (id: string) => Promise<boolean>;
  updateDeck: (id: string, updates: Partial<DeckRow>) => Promise<boolean>;
  moveDeck: (deckId: string, newParentId: string | null) => Promise<boolean>;
  shareDeck: (deckId: string) => Promise<string | null>;
}

interface DeckWithCardsQuery extends DeckRow {
  cards: { id: string; due: string }[];
}

export const useDeckStore = create<DeckState>((set, get) => ({
  decks: [],
  currentDeck: null,
  isLoading: false,
  error: null,

  fetchDecks: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('decks')
        .select('*, cards(id, due)')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const now = new Date();
      const rawDecks = (data || []) as unknown as DeckWithCardsQuery[];

      const decksWithStats: DeckWithStats[] = rawDecks.map((deck) => {
        const cardsList = Array.isArray(deck.cards) ? deck.cards : [];
        const cardsCount = cardsList.length;
        const dueCount = cardsList.filter((c) => new Date(c.due) <= now).length;
        // Calcular la cantidad de elementos hijos que tiene si es carpeta o si otros mazos la referencian
        const childrenCount = rawDecks.filter((d) => d.parent_id === deck.id).length;
        const deckCopy = { ...deck } as Record<string, unknown>;
        delete deckCopy.cards;

        const isFolder = Boolean(deck.is_folder || (deck as unknown as Record<string, unknown>).isFolder);

        return {
          ...(deckCopy as unknown as DeckRow),
          is_folder: isFolder,
          parent_id: deck.parent_id || null,
          cardsCount,
          dueCount,
          childrenCount,
        };
      });

      set({ decks: decksWithStats, isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al cargar los mazos';
      console.error('Error fetching decks:', err);
      set({ error: message, isLoading: false });
    }
  },

  fetchDeckById: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('decks')
        .select('*, cards(id, due)')
        .eq('id', id)
        .single();

      if (error) throw error;

      const now = new Date();
      const rawDeck = data as unknown as DeckWithCardsQuery;
      const cardsList = Array.isArray(rawDeck.cards) ? rawDeck.cards : [];
      const cardsCount = cardsList.length;
      const dueCount = cardsList.filter((c) => new Date(c.due) <= now).length;
      const deckCopy = { ...rawDeck } as Record<string, unknown>;
      delete deckCopy.cards;

      const deckWithStats: DeckWithStats = {
        ...(deckCopy as unknown as DeckRow),
        is_folder: Boolean(rawDeck.is_folder || (rawDeck as unknown as Record<string, unknown>).isFolder),
        parent_id: rawDeck.parent_id || null,
        cardsCount,
        dueCount,
      };

      set({ currentDeck: deckWithStats, isLoading: false });
      return deckWithStats;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al cargar el mazo';
      console.error('Error fetching deck by ID:', err);
      set({ error: message, isLoading: false });
      return null;
    }
  },

  createDeck: async (
    titleOrOptions: string | CreateDeckOptions,
    description = '',
    color = '#6366f1',
    isFolder = false,
    parentId: string | null = null
  ) => {
    set({ isLoading: true, error: null });
    try {
      let finalTitle = '';
      let finalDescription: string | null = null;
      let finalColor = '#6366f1';
      let finalIsFolder = false;
      let finalParentId: string | null = null;

      if (typeof titleOrOptions === 'object' && titleOrOptions !== null) {
        finalTitle = titleOrOptions.title || '';
        finalDescription = titleOrOptions.description || null;
        finalColor = titleOrOptions.color || '#6366f1';
        finalIsFolder = Boolean(titleOrOptions.isFolder ?? titleOrOptions.is_folder);
        finalParentId = titleOrOptions.parentId ?? titleOrOptions.parent_id ?? null;
      } else {
        finalTitle = titleOrOptions;
        finalDescription = description ? description.trim() : null;
        finalColor = color;
        finalIsFolder = Boolean(isFolder);
        finalParentId = parentId || null;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const insertPayload: Database['public']['Tables']['decks']['Insert'] = {
        title: finalTitle.trim(),
        description: finalIsFolder ? null : (finalDescription ? finalDescription.trim() : null),
        color: finalColor,
        is_folder: Boolean(finalIsFolder),
        parent_id: finalParentId,
        ...(user?.id ? { user_id: user.id } : {}),
      };

      console.log("🚀 PAYLOAD HACIA SUPABASE:", insertPayload);

      const { data, error } = await supabase
        .from('decks')
        .insert(insertPayload)
        .select()
        .single();

      if (error) {
        console.error('[useDeckStore.createDeck] Error de Supabase:', error);
        throw error;
      }

      const newDeckWithStats: DeckWithStats = {
        ...data,
        is_folder: typeof data?.is_folder === 'boolean' ? data.is_folder : Boolean(finalIsFolder),
        parent_id: data?.parent_id !== undefined ? data.parent_id : finalParentId,
        cardsCount: 0,
        dueCount: 0,
        childrenCount: 0,
      };

      set((state) => {
        const updatedDecks = state.decks.map((d) =>
          finalParentId && d.id === finalParentId
            ? { ...d, childrenCount: (d.childrenCount || 0) + 1 }
            : d
        );
        return {
          decks: [newDeckWithStats, ...updatedDecks],
          isLoading: false,
        };
      });

      return newDeckWithStats;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al crear el elemento';
      console.error('Error creating deck:', err);
      set({ error: message, isLoading: false });
      return null;
    }
  },

  deleteDeck: async (id: string) => {
    try {
      const { error } = await supabase.from('decks').delete().eq('id', id);
      if (error) throw error;

      set((state) => {
        // En cascada ON DELETE CASCADE de Postgres se borran los descendientes
        const toDeleteIds = new Set<string>([id]);
        let added = true;
        while (added) {
          added = false;
          for (const d of state.decks) {
            if (d.parent_id && toDeleteIds.has(d.parent_id) && !toDeleteIds.has(d.id)) {
              toDeleteIds.add(d.id);
              added = true;
            }
          }
        }

        // Actualizar childrenCount en el padre si aplica
        const deletedDeck = state.decks.find((d) => d.id === id);
        const parentId = deletedDeck?.parent_id;

        const updatedDecks = state.decks
          .filter((d) => !toDeleteIds.has(d.id))
          .map((d) =>
            parentId && d.id === parentId
              ? { ...d, childrenCount: Math.max(0, (d.childrenCount || 1) - 1) }
              : d
          );

        return {
          decks: updatedDecks,
          currentDeck: state.currentDeck && toDeleteIds.has(state.currentDeck.id) ? null : state.currentDeck,
        };
      });
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al eliminar el elemento';
      console.error('Error deleting deck:', err);
      set({ error: message });
      return false;
    }
  },

  updateDeck: async (id: string, updates: Partial<DeckRow>) => {
    try {
      const { error } = await supabase.from('decks').update(updates).eq('id', id);
      if (error) throw error;

      set((state) => ({
        decks: state.decks.map((d) => (d.id === id ? { ...d, ...updates } : d)),
        currentDeck: state.currentDeck?.id === id ? { ...state.currentDeck, ...updates } : state.currentDeck,
      }));
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al actualizar el mazo';
      console.error('Error updating deck:', err);
      set({ error: message });
      return false;
    }
  },

  moveDeck: async (deckId: string, newParentId: string | null) => {
    try {
      const { error } = await supabase
        .from('decks')
        .update({ parent_id: newParentId })
        .eq('id', deckId);

      if (error) {
        console.error('[useDeckStore.moveDeck] Error de Supabase:', error);
        throw error;
      }

      set((state) => {
        const oldDeck = state.decks.find((d) => d.id === deckId);
        const oldParentId = oldDeck?.parent_id || null;

        const updatedDecks = state.decks.map((d) => {
          if (d.id === deckId) {
            return { ...d, parent_id: newParentId };
          }
          if (oldParentId && d.id === oldParentId && newParentId !== oldParentId) {
            return { ...d, childrenCount: Math.max(0, (d.childrenCount || 1) - 1) };
          }
          if (newParentId && d.id === newParentId && newParentId !== oldParentId) {
            return { ...d, childrenCount: (d.childrenCount || 0) + 1 };
          }
          return d;
        });

        return {
          decks: updatedDecks,
          currentDeck:
            state.currentDeck?.id === deckId
              ? { ...state.currentDeck, parent_id: newParentId }
              : state.currentDeck,
        };
      });

      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al mover el elemento';
      console.error('Error moving deck:', err);
      set({ error: message });
      return false;
    }
  },

  shareDeck: async (deckId: string) => {
    try {
      const state = get();
      const existing = state.decks.find((d) => d.id === deckId) || (state.currentDeck?.id === deckId ? state.currentDeck : null);
      let shareId = existing?.share_id || null;

      if (!shareId) {
        shareId = typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
          : Math.random().toString(36).substring(2, 14);
      }

      const { error } = await supabase
        .from('decks')
        .update({ is_public: true, share_id: shareId })
        .eq('id', deckId);

      if (error) {
        console.error('[useDeckStore.shareDeck] Error de Supabase:', error);
        throw error;
      }

      set((state) => ({
        decks: state.decks.map((d) => (d.id === deckId ? { ...d, is_public: true, share_id: shareId } : d)),
        currentDeck: state.currentDeck?.id === deckId ? { ...state.currentDeck, is_public: true, share_id: shareId } : state.currentDeck,
      }));

      return shareId;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al compartir el mazo';
      console.error('Error sharing deck:', err);
      set({ error: message });
      return null;
    }
  },
}));
