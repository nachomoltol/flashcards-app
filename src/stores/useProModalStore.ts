import { create } from 'zustand';

export type ProFeatureName = 'pdf' | 'audio' | 'youtube' | 'print' | 'general' | null;

interface ProModalState {
  isOpen: boolean;
  isLimitReached: boolean;
  featureName?: ProFeatureName;
  openProModal: (isLimitReached?: boolean, featureName?: ProFeatureName) => void;
  closeProModal: () => void;
}

export const useProModalStore = create<ProModalState>((set) => ({
  isOpen: false,
  isLimitReached: false,
  featureName: null,
  openProModal: (isLimitReached = false, featureName = null) =>
    set({ isOpen: true, isLimitReached, featureName }),
  closeProModal: () => set({ isOpen: false, isLimitReached: false, featureName: null }),
}));
