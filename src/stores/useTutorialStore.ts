import { create } from 'zustand';

interface TutorialState {
  isOpen: boolean;
  initialSlide: number;
  openTutorial: (slide?: number) => void;
  closeTutorial: () => void;
}

export const useTutorialStore = create<TutorialState>((set) => ({
  isOpen: false,
  initialSlide: 0,
  openTutorial: (slide = 0) => set({ isOpen: true, initialSlide: slide }),
  closeTutorial: () => set({ isOpen: false }),
}));
