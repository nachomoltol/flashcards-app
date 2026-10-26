import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { toLocalDateString } from '@/lib/stats/streak';
import { SmartNotificationService } from '@/lib/notifications';
import { useLanguageStore } from './useLanguageStore';

export interface StreakInfo {
  current: number;
  max: number;
  lastStudyDate: string | null;
  studiedToday: boolean;
}

interface StreakState extends StreakInfo {
  /** Alias agrupado para consumo en componentes (compatibilidad). */
  streak: StreakInfo;
  isLoading: boolean;
  fetchStreak: (userId?: string) => Promise<StreakInfo>;
  syncDailyStudy: (dateStr: string) => Promise<StreakInfo | null>;
}

const EMPTY: StreakInfo = { current: 0, max: 0, lastStudyDate: null, studiedToday: false };

function previousDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  // Mediodía para evitar saltos por horario de verano
  return toLocalDateString(new Date(y, m - 1, d - 1, 12, 0, 0));
}

/** Convierte los valores persistidos en el estado efectivo a día de hoy (racha rota => 0). */
function resolveInfo(current: number, max: number, lastStudyDate: string | null): StreakInfo {
  const today = toLocalDateString(new Date());
  const studiedToday = lastStudyDate === today;
  const alive = studiedToday || lastStudyDate === previousDay(today);
  return {
    current: alive ? current : 0,
    max: Math.max(max, alive ? current : 0),
    lastStudyDate,
    studiedToday,
  };
}

function withInfo(info: StreakInfo) {
  return { ...info, streak: info };
}

export const useStreakStore = create<StreakState>((set, get) => ({
  ...EMPTY,
  streak: EMPTY,
  isLoading: false,

  fetchStreak: async (userId?: string) => {
    let resolvedUserId = userId;
    if (!resolvedUserId) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      resolvedUserId = user?.id;
    }

    if (!resolvedUserId) {
      set({ ...withInfo(EMPTY), isLoading: false });
      return EMPTY;
    }

    set({ isLoading: true });
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('current_streak, longest_streak, last_study_date')
        .eq('id', resolvedUserId)
        .maybeSingle();

      if (error) throw error;

      const info = data
        ? resolveInfo(data.current_streak ?? 0, data.longest_streak ?? 0, data.last_study_date ?? null)
        : EMPTY;

      set({ ...withInfo(info), isLoading: false });

      // Mantener el recordatorio predictivo alineado con el estado real
      void SmartNotificationService.scheduleStudyReminder(
        info.studiedToday,
        info.current,
        useLanguageStore.getState().language
      );

      return info;
    } catch (err) {
      console.warn('Error fetching streak in store:', err);
      set({ isLoading: false });
      return get().streak;
    }
  },

  syncDailyStudy: async (dateStr: string) => {
    try {
      const { data, error } = await supabase.rpc('record_daily_study', { p_study_date: dateStr });
      if (error) throw error;

      const row = data as { current_streak: number; longest_streak: number; last_study_date: string | null } | null;
      if (!row) return null;

      const info = resolveInfo(row.current_streak, row.longest_streak, row.last_study_date);
      set({ ...withInfo(info), isLoading: false });

      // Solicitar permiso (no-op en Web) y aplazar el aviso al día siguiente
      await SmartNotificationService.requestNotificationPermission();
      await SmartNotificationService.scheduleStudyReminder(
        true,
        info.current,
        useLanguageStore.getState().language
      );

      return info;
    } catch (err) {
      console.warn('Error sincronizando estudio diario:', err);
      return null;
    }
  },
}));
