import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { calculateStreak, fetchUserStreak, type StreakInfo } from '@/lib/stats/streak';

interface StreakState {
  streak: StreakInfo;
  isLoading: boolean;
  fetchStreak: (userId?: string) => Promise<StreakInfo>;
  setStreakFromTimestamps: (timestamps: (string | Date | number | null | undefined)[]) => void;
}

export const useStreakStore = create<StreakState>((set, get) => ({
  streak: { current: 0, max: 0, studiedToday: false, totalActiveDays: 0 },
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
      const empty: StreakInfo = { current: 0, max: 0, studiedToday: false, totalActiveDays: 0 };
      set({ streak: empty, isLoading: false });
      return empty;
    }

    set({ isLoading: true });
    try {
      const result = await fetchUserStreak(resolvedUserId);
      set({ streak: result, isLoading: false });
      return result;
    } catch (err) {
      console.warn('Error fetching streak in store:', err);
      set({ isLoading: false });
      return get().streak;
    }
  },

  setStreakFromTimestamps: (timestamps) => {
    const computed = calculateStreak(timestamps);
    set({ streak: computed, isLoading: false });
  },
}));
