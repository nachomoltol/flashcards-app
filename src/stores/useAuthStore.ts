import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  initialize: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
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
        // Inicio de sesión automático con la cuenta de desarrollo para operar con RLS
        const { data } = await supabase.auth.signInWithPassword({
          email: 'demo@flashcards.app',
          password: 'Password123!',
        });

        if (data?.session) {
          set({ session: data.session, user: data.user, isLoading: false });
        } else {
          set({ isLoading: false });
        }
      }

      supabase.auth.onAuthStateChange((_event, updatedSession) => {
        set({ session: updatedSession, user: updatedSession?.user ?? null, isLoading: false });
      });
    } catch (err) {
      console.error('Error al inicializar autenticación Supabase:', err);
      set({ isLoading: false });
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, session: null });
  },
}));
