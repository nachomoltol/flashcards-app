import { create } from 'zustand';

export type ProFeatureName = 'pdf' | 'audio' | 'youtube' | 'print' | 'general' | null;

interface ProModalState {
  isOpen: boolean;
  isLimitReached: boolean;
  featureName?: ProFeatureName;
  onRewardSuccess?: (() => void) | null;
  openProModal: (
    isLimitReached?: boolean,
    featureName?: ProFeatureName,
    onRewardSuccess?: (() => void) | null
  ) => void;
  closeProModal: () => void;
}

export const useProModalStore = create<ProModalState>((set) => ({
  isOpen: false,
  isLimitReached: false,
  featureName: null,
  onRewardSuccess: null,
  openProModal: (isLimitReached = false, featureName = null, onRewardSuccess = null) =>
    set({ isOpen: true, isLimitReached, featureName, onRewardSuccess }),
  closeProModal: () =>
    set({ isOpen: false, isLimitReached: false, featureName: null, onRewardSuccess: null }),
}));
