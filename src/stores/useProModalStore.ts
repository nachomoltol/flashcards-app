import { create } from 'zustand';

interface ProModalState {
  isOpen: boolean;
  isLimitReached: boolean;
  openProModal: (isLimitReached?: boolean) => void;
  closeProModal: () => void;
}

export const useProModalStore = create<ProModalState>((set) => ({
  isOpen: false,
  isLimitReached: false,
  openProModal: (isLimitReached = false) => set({ isOpen: true, isLimitReached }),
  closeProModal: () => set({ isOpen: false, isLimitReached: false }),
}));
