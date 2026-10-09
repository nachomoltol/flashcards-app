import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';
import { useProfileStore } from './useProfileStore';

export type ProfileRow = Database['public']['Tables']['profiles']['Row'];

export interface FSRSSettings {
  request_retention: number;
  maximum_interval: number;
  enable_fuzz: boolean;
  full_name: string;
  username: string;
}

export const DEFAULT_FSRS_SETTINGS: FSRSSettings = {
  request_retention: 0.90,
  maximum_interval: 365,
  enable_fuzz: true,
  full_name: '',
  username: '',
};

interface SettingsState {
  settings: FSRSSettings;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  successMessage: string | null;
  fetchSettings: () => Promise<FSRSSettings | null>;
  updateSettings: (newSettings: Partial<FSRSSettings>) => Promise<boolean>;
  resetToDefaults: () => Promise<boolean>;
  reset: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_FSRS_SETTINGS,
  isLoading: false,
  isSaving: false,
  error: null,
  successMessage: null,

  reset: () => {
    set({
      settings: DEFAULT_FSRS_SETTINGS,
      isLoading: false,
      isSaving: false,
      error: null,
      successMessage: null,
    });
  },

  fetchSettings: async () => {
    set({ isLoading: true, error: null, successMessage: null });
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        set({ isLoading: false });
        return null;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        // Si el perfil aún no existe, inicializarlo en Supabase
        const initialProfile: FSRSSettings = {
          ...DEFAULT_FSRS_SETTINGS,
          full_name: user.user_metadata?.full_name || '',
          username: user.email?.split('@')[0] || '',
        };

        await supabase.from('profiles').insert({
          id: user.id,
          full_name: initialProfile.full_name || null,
          username: initialProfile.username || null,
          request_retention: initialProfile.request_retention,
          maximum_interval: initialProfile.maximum_interval,
          enable_fuzz: initialProfile.enable_fuzz,
        });

        set({ settings: initialProfile, isLoading: false });
        return initialProfile;
      }

      const loadedSettings: FSRSSettings = {
        request_retention:
          typeof data.request_retention === 'number'
            ? data.request_retention
            : Number(data.request_retention) || DEFAULT_FSRS_SETTINGS.request_retention,
        maximum_interval: data.maximum_interval ?? DEFAULT_FSRS_SETTINGS.maximum_interval,
        enable_fuzz: data.enable_fuzz ?? DEFAULT_FSRS_SETTINGS.enable_fuzz,
        full_name: data.full_name || '',
        username: data.username || '',
      };

      set({ settings: loadedSettings, isLoading: false });
      return loadedSettings;
    } catch (err: unknown) {
      const message =
        (err && typeof err === 'object' && 'message' in err && typeof (err as { message?: unknown }).message === 'string'
          ? (err as { message: string }).message
          : null) ||
        (err instanceof Error ? err.message : 'Error al cargar los ajustes de usuario');
      console.error('Error fetching settings:', message, err);
      set({ error: message, isLoading: false });
      return null;
    }
  },

  updateSettings: async (newSettings: Partial<FSRSSettings>) => {
    set({ isSaving: true, error: null, successMessage: null });
    try {
      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser();

      if (authErr || !user) {
        throw new Error(authErr?.message || 'Debes iniciar sesión para guardar tus preferencias.');
      }

      const merged: FSRSSettings = {
        ...get().settings,
        ...newSettings,
      };

      const fullNameVal = merged.full_name !== undefined ? merged.full_name.trim() : null;
      const usernameVal = merged.username !== undefined && merged.username.trim() !== '' ? merged.username.trim() : null;

      // 1. Ejecutar UPDATE sobre la tabla profiles en Supabase filtrando por el ID
      const { data: updateData, error: updateError } = await supabase
        .from('profiles')
        .update({
          full_name: fullNameVal,
          username: usernameVal,
          request_retention: merged.request_retention,
          maximum_interval: merged.maximum_interval,
          enable_fuzz: merged.enable_fuzz,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)
        .select();

      if (updateError) throw updateError;

      // 2. Si la fila no existía previamente, realizar insert
      if (!updateData || updateData.length === 0) {
        const { error: insertError } = await supabase
          .from('profiles')
          .insert({
            id: user.id,
            full_name: fullNameVal,
            username: usernameVal,
            request_retention: merged.request_retention,
            maximum_interval: merged.maximum_interval,
            enable_fuzz: merged.enable_fuzz,
            updated_at: new Date().toISOString(),
          });

        if (insertError) throw insertError;
      }

      // 3. Sincronizar inmediatamente el store global useProfileStore para reflejar cambios en tiempo real
      useProfileStore.getState().setProfile({
        full_name: fullNameVal || '',
        username: usernameVal || '',
      });

      // 4. Actualizar estado local del settings store
      set({
        settings: {
          ...merged,
          full_name: fullNameVal || '',
          username: usernameVal || '',
        },
        isSaving: false,
        successMessage: '¡Cambios guardados correctamente en tu perfil y configuración!',
      });

      return true;
    } catch (err: unknown) {
      let errorMessage =
        (err && typeof err === 'object' && 'message' in err && typeof (err as { message?: unknown }).message === 'string'
          ? (err as { message: string }).message
          : null) ||
        (err && typeof err === 'object' && 'details' in err && typeof (err as { details?: unknown }).details === 'string'
          ? (err as { details: string }).details
          : null) ||
        (err instanceof Error ? err.message : 'Error al guardar la configuración');

      if (
        errorMessage.includes('profiles_username_key') ||
        (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505')
      ) {
        errorMessage = 'Este nombre de usuario ya está en uso. Por favor, elige otro.';
      }

      console.error('Error saving settings:', errorMessage, err);
      set({ error: errorMessage, isSaving: false });
      return false;
    }
  },

  resetToDefaults: async () => {
    const current = get().settings;
    return get().updateSettings({
      request_retention: DEFAULT_FSRS_SETTINGS.request_retention,
      maximum_interval: DEFAULT_FSRS_SETTINGS.maximum_interval,
      enable_fuzz: DEFAULT_FSRS_SETTINGS.enable_fuzz,
      full_name: current.full_name,
      username: current.username,
    });
  },
}));
