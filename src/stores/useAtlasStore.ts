import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { Database, AtlasBox, InteractiveImageRow } from '@/types/database';

export type { AtlasBox, InteractiveImageRow };

interface AtlasState {
  items: InteractiveImageRow[];
  atlasItems: InteractiveImageRow[];
  currentItem: InteractiveImageRow | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchAtlasItems: () => Promise<void>;
  fetchAtlasItemById: (id: string) => Promise<InteractiveImageRow | null>;
  createAtlasItem: (payload: {
    title: string;
    image_url: string;
    boxes?: AtlasBox[];
  }) => Promise<InteractiveImageRow | null>;
  updateAtlasItem: (
    id: string,
    updates: {
      title?: string;
      image_url?: string;
      boxes?: AtlasBox[];
    }
  ) => Promise<InteractiveImageRow | null>;
  deleteAtlasItem: (id: string) => Promise<boolean>;
  setCurrentItem: (item: InteractiveImageRow | null) => void;
  reset: () => void;
}

export const useAtlasStore = create<AtlasState>((set, get) => ({
  items: [],
  atlasItems: [],
  currentItem: null,
  isLoading: false,
  error: null,

  reset: () => {
    set({ items: [], atlasItems: [], currentItem: null, isLoading: false, error: null });
  },

  setCurrentItem: (item: InteractiveImageRow | null) => {
    set({ currentItem: item });
  },

  fetchAtlasItems: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('interactive_images')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const list = (data as InteractiveImageRow[]) || [];
      set({ items: list, atlasItems: list, isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al cargar atlas visuales';
      console.error('Error fetching atlas items:', err);
      set({ error: message, isLoading: false });
    }
  },

  fetchAtlasItemById: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('interactive_images')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      const row = data as InteractiveImageRow;
      set({ currentItem: row, isLoading: false });
      return row;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al cargar atlas visual';
      console.error(`Error fetching atlas item ${id}:`, err);
      set({ error: message, isLoading: false });
      return null;
    }
  },

  createAtlasItem: async (payload) => {
    set({ isLoading: true, error: null });
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('Usuario no autenticado');
      }

      const { data, error } = await supabase
        .from('interactive_images')
        .insert({
          user_id: user.id,
          title: payload.title.trim(),
          image_url: payload.image_url,
          boxes: (payload.boxes || []) as unknown as Database['public']['Tables']['interactive_images']['Insert']['boxes'],
        })
        .select()
        .single();

      if (error) throw error;

      const created = data as InteractiveImageRow;
      set((state) => {
        const nextList = [created, ...state.items];
        return {
          items: nextList,
          atlasItems: nextList,
          currentItem: created,
          isLoading: false,
        };
      });
      return created;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al crear atlas visual';
      console.error('Error creating atlas item:', err);
      set({ error: message, isLoading: false });
      return null;
    }
  },

  updateAtlasItem: async (id, updates) => {
    set({ isLoading: true, error: null });
    try {
      const updatePayload: Database['public']['Tables']['interactive_images']['Update'] = {};
      if (updates.title !== undefined) updatePayload.title = updates.title.trim();
      if (updates.image_url !== undefined) updatePayload.image_url = updates.image_url;
      if (updates.boxes !== undefined) {
        updatePayload.boxes = updates.boxes as unknown as Database['public']['Tables']['interactive_images']['Update']['boxes'];
      }

      const { data, error } = await supabase
        .from('interactive_images')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      const updated = data as InteractiveImageRow;
      set((state) => {
        const nextList = state.items.map((it) => (it.id === id ? updated : it));
        return {
          items: nextList,
          atlasItems: nextList,
          currentItem: state.currentItem?.id === id ? updated : state.currentItem,
          isLoading: false,
        };
      });
      return updated;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al actualizar atlas visual';
      console.error(`Error updating atlas item ${id}:`, err);
      set({ error: message, isLoading: false });
      return null;
    }
  },

  deleteAtlasItem: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      // Intentar obtener el registro para limpiar la imagen de Storage si corresponde
      const current = get().items.find((it) => it.id === id) || get().currentItem;
      if (current?.image_url) {
        try {
          const parts = current.image_url.split('/atlas-images/');
          if (parts.length > 1) {
            const pathInBucket = decodeURIComponent(parts[1]);
            await supabase.storage.from('atlas-images').remove([pathInBucket]);
          }
        } catch (storageErr) {
          console.warn('Advertencia eliminando archivo de Storage:', storageErr);
        }
      }

      const { error } = await supabase.from('interactive_images').delete().eq('id', id);
      if (error) throw error;

      set((state) => {
        const nextList = state.items.filter((it) => it.id !== id);
        return {
          items: nextList,
          atlasItems: nextList,
          currentItem: state.currentItem?.id === id ? null : state.currentItem,
          isLoading: false,
        };
      });
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al eliminar atlas visual';
      console.error(`Error deleting atlas item ${id}:`, err);
      set({ error: message, isLoading: false });
      return false;
    }
  },
}));
