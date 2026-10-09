import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

export type UserProfileRow = Database['public']['Tables']['profiles']['Row'];

export interface UserProfile {
  id: string;
  full_name: string;
  username: string;
  avatar_url: string;
  email?: string;
}

export const DEFAULT_USER_PROFILE: UserProfile = {
  id: '',
  full_name: '',
  username: '',
  avatar_url: '',
  email: '',
};

interface ProfileState {
  profile: UserProfile;
  isLoading: boolean;
  error: string | null;
  fetchProfile: (userId?: string) => Promise<UserProfile | null>;
  setProfile: (profile: Partial<UserProfile>) => void;
  updateProfile: (updates: {
    full_name?: string;
    username?: string;
    avatar_url?: string;
  }) => Promise<boolean>;
  reset: () => void;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: DEFAULT_USER_PROFILE,
  isLoading: false,
  error: null,

  reset: () => {
    set({
      profile: DEFAULT_USER_PROFILE,
      isLoading: false,
      error: null,
    });
  },

  setProfile: (partialProfile) => {
    set((state) => ({
      profile: {
        ...state.profile,
        ...partialProfile,
      },
    }));
  },

  fetchProfile: async (userId?: string) => {
    set({ isLoading: true, error: null });
    try {
      let targetUserId = userId;
      let userEmail: string | undefined = undefined;
      let userMetaName: string | undefined = undefined;

      // Obtener usuario autenticado si no se proporciona ID
      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser();

      if (authErr) {
        console.warn('Advertencia al verificar usuario en useProfileStore:', authErr);
      }

      if (user) {
        targetUserId = targetUserId || user.id;
        userEmail = user.email;
        userMetaName = user.user_metadata?.full_name;
      }

      if (!targetUserId) {
        set({ profile: DEFAULT_USER_PROFILE, isLoading: false });
        return null;
      }

      // SELECT a la tabla profiles filtrando por el ID del usuario
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', targetUserId)
        .maybeSingle();

      if (error) throw error;

      // Si no existe la fila en profiles, inicializarla de manera transparente
      if (!data) {
        const fallbackName = userMetaName || (userEmail === 'demo@flashcards.app' ? 'Usuario Demo' : '');
        const fallbackUsername = userEmail ? userEmail.split('@')[0] : '';
        const fallbackAvatar = user?.user_metadata?.avatar_url || '';

        try {
          await supabase.from('profiles').insert({
            id: targetUserId,
            full_name: fallbackName,
            username: fallbackUsername,
            avatar_url: fallbackAvatar,
          });
        } catch (insertErr) {
          console.warn('Nota: Inserción inicial de perfil gestionada o existente:', insertErr);
        }

        const newProfile: UserProfile = {
          id: targetUserId,
          full_name: fallbackName,
          username: fallbackUsername,
          avatar_url: fallbackAvatar,
          email: userEmail,
        };

        set({ profile: newProfile, isLoading: false });
        return newProfile;
      }

      const loadedProfile: UserProfile = {
        id: data.id,
        full_name: data.full_name || '',
        username: data.username || '',
        avatar_url: data.avatar_url || '',
        email: userEmail,
      };

      set({ profile: loadedProfile, isLoading: false });
      return loadedProfile;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al cargar perfil de usuario';
      console.error('Error fetching profile in useProfileStore:', err);
      set({ error: message, isLoading: false });
      return null;
    }
  },

  updateProfile: async (updates) => {
    set({ isLoading: true, error: null });
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('Debes iniciar sesión para actualizar tu perfil.');
      }

      const current = get().profile;
      const fullNameVal = updates.full_name !== undefined ? updates.full_name.trim() : current.full_name;
      const usernameVal = updates.username !== undefined ? updates.username.trim() : current.username;
      const avatarUrlVal = updates.avatar_url !== undefined ? updates.avatar_url : current.avatar_url;

      const { data: updateData, error: updateError } = await supabase
        .from('profiles')
        .update({
          full_name: fullNameVal || null,
          username: usernameVal !== '' ? usernameVal : null,
          avatar_url: avatarUrlVal || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)
        .select();

      if (updateError) throw updateError;

      if (!updateData || updateData.length === 0) {
        const { error: insertError } = await supabase
          .from('profiles')
          .insert({
            id: user.id,
            full_name: fullNameVal || null,
            username: usernameVal !== '' ? usernameVal : null,
            avatar_url: avatarUrlVal || null,
            updated_at: new Date().toISOString(),
          });

        if (insertError) throw insertError;
      }

      set((state) => ({
        profile: {
          ...state.profile,
          full_name: fullNameVal || '',
          username: usernameVal || '',
          avatar_url: avatarUrlVal || '',
        },
        isLoading: false,
      }));

      return true;
    } catch (err: unknown) {
      let errorMessage =
        (err && typeof err === 'object' && 'message' in err && typeof (err as { message?: unknown }).message === 'string'
          ? (err as { message: string }).message
          : null) ||
        (err && typeof err === 'object' && 'details' in err && typeof (err as { details?: unknown }).details === 'string'
          ? (err as { details: string }).details
          : null) ||
        (err instanceof Error ? err.message : 'Error al actualizar el perfil');

      if (
        errorMessage.includes('profiles_username_key') ||
        (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505')
      ) {
        errorMessage = 'Este nombre de usuario ya está en uso. Por favor, elige otro.';
      }

      console.error('Error updating profile in useProfileStore:', errorMessage, err);
      set({ error: errorMessage, isLoading: false });
      return false;
    }
  },
}));
