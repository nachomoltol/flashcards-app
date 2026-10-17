import { create } from 'zustand';

interface FeedbackModalState {
  isOpen: boolean;
  openFeedbackModal: () => void;
  closeFeedbackModal: () => void;
  openModal: () => void;
  closeModal: () => void;
  openFeedback: () => void;
  closeFeedback: () => void;
  setIsOpen: (isOpen: boolean) => void;
}

export const useFeedbackModalStore = create<FeedbackModalState>((set) => ({
  isOpen: false,
  openFeedbackModal: () => set({ isOpen: true }),
  closeFeedbackModal: () => set({ isOpen: false }),
  openModal: () => set({ isOpen: true }),
  closeModal: () => set({ isOpen: false }),
  openFeedback: () => set({ isOpen: true }),
  closeFeedback: () => set({ isOpen: false }),
  setIsOpen: (isOpen: boolean) => set({ isOpen }),
}));
