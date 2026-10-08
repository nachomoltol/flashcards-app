import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';
import { useDeckStore } from './useDeckStore';
import { useCardStore } from './useCardStore';
import { useSettingsStore } from './useSettingsStore';

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  initialize: () => Promise<void>;
  signOut: () => Promise<void>;
  setSession: (session: Session | null) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  isLoading: true,

  initialize: async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        set({ session, user: session.user, isLoading: false });
      } else {
        set({ session: null, user: null, isLoading: false });
      }

      supabase.auth.onAuthStateChange((_event, updatedSession) => {
        const currentUser = get().user;
        const newUserId = updatedSession?.user?.id;
        if ((currentUser && newUserId && currentUser.id !== newUserId) || (!updatedSession && currentUser)) {
          // Si el usuario cambió o cerró sesión, resetear todos los stores
          useDeckStore.getState().reset();
          useCardStore.getState().reset();
          useSettingsStore.getState().reset();
        }
        set({ session: updatedSession, user: updatedSession?.user ?? null, isLoading: false });
      });
    } catch (err) {
      console.error('Error al inicializar autenticación Supabase:', err);
      set({ isLoading: false });
    }
  },

  setSession: (session: Session | null) => {
    const currentUserId = get().user?.id;
    const newUserId = session?.user?.id;
    if ((currentUserId && newUserId && currentUserId !== newUserId) || (!session && currentUserId)) {
      useDeckStore.getState().reset();
      useCardStore.getState().reset();
      useSettingsStore.getState().reset();
    }
    set({ session, user: session?.user ?? null, isLoading: false });
  },

  signOut: async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Error during signOut:', err);
    }
    set({ user: null, session: null, isLoading: false });
    // Limpieza profunda e instantánea de todos los stores
    useDeckStore.getState().reset();
    useCardStore.getState().reset();
    useSettingsStore.getState().reset();
  },
}));
