import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

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
          full_name: initialProfile.full_name,
          username: initialProfile.username,
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
      const message = err instanceof Error ? err.message : 'Error al cargar los ajustes de usuario';
      console.error('Error fetching settings:', err);
      set({ error: message, isLoading: false });
      return null;
    }
  },

  updateSettings: async (newSettings: Partial<FSRSSettings>) => {
    set({ isSaving: true, error: null, successMessage: null });
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('Debes iniciar sesión para guardar tus preferencias.');
      }

      const merged: FSRSSettings = {
        ...get().settings,
        ...newSettings,
      };

      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          full_name: merged.full_name,
          username: merged.username,
          request_retention: merged.request_retention,
          maximum_interval: merged.maximum_interval,
          enable_fuzz: merged.enable_fuzz,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      set({
        settings: merged,
        isSaving: false,
        successMessage: '¡Configuración FSRS guardada permanentemente en Supabase!',
      });

      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al guardar la configuración';
      console.error('Error saving settings:', err);
      set({ error: message, isSaving: false });
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
