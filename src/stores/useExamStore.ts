import { create } from 'zustand';
import type { CardRow } from './useCardStore';

export type PenaltyFormula = 'none' | 'one_third' | 'one_fourth';
export type FormatFilter = 'all' | 'objective_only';

export interface ExamConfig {
  totalQuestions: number;
  timeLimitMinutes: number; // 0 = sin límite
  penaltyFormula: PenaltyFormula;
  formatFilter: FormatFilter;
}

export const DEFAULT_EXAM_CONFIG: ExamConfig = {
  totalQuestions: 10,
  timeLimitMinutes: 15,
  penaltyFormula: 'none',
  formatFilter: 'all',
};

export interface ExamScoreResult {
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  blankCount: number;
  penaltyPoints: number;
  netScore: number; // Nota calculada
  scoreOutOf10: number; // Normalizada sobre 10
  passed: boolean; // >= 5.0
}

interface ExamState {
  // Configuración
  config: ExamConfig;
  setConfig: (partial: Partial<ExamConfig>) => void;

  // Estado de la sesión
  cards: CardRow[];
  currentIndex: number;
  answers: Record<string, string>; // cardId -> valor respondido ('a', 'b', 'verdadero', 'falso', o texto abierto)
  selfEvaluations: Record<string, 'correct' | 'incorrect'>; // cardId -> auto-evaluación para basic/cloze
  flagged: string[]; // cardIds con bandera de duda 🚩
  isStarted: boolean;
  isFinished: boolean;
  elapsedSeconds: number;

  // Acciones
  initExam: (allCards: CardRow[], customConfig?: Partial<ExamConfig>) => void;
  selectAnswer: (cardId: string, answer: string) => void;
  setSelfEvaluation: (cardId: string, result: 'correct' | 'incorrect') => void;
  toggleFlag: (cardId: string) => void;
  goToQuestion: (index: number) => void;
  finishExam: (elapsedSec?: number) => void;
  resetExam: () => void;
  computeResults: () => ExamScoreResult;
}

/**
 * Función pura para evaluar si una respuesta objetiva es correcta.
 */
export function evaluateObjectiveAnswer(
  card: CardRow,
  userAnswer?: string
): 'correct' | 'incorrect' | 'blank' {
  if (!userAnswer || userAnswer.trim() === '') {
    return 'blank';
  }

  const format =
    card.cardFormat ||
    card.card_format ||
    (card.card_type === 'cloze' ? 'cloze' : 'basic');

  if (format === 'multiple_choice') {
    const match = card.back.match(/^\s*([a-dA-D])[.)\]\-:]/);
    if (!match) return 'blank';
    const correctLetter = match[1].toLowerCase();
    return userAnswer.trim().toLowerCase() === correctLetter ? 'correct' : 'incorrect';
  }

  if (format === 'true_false') {
    const isTrue = /^(verdadero|\*\*verdadero\*\*)/i.test(card.back.trim());
    const isFalse = /^(falso|\*\*falso\*\*)/i.test(card.back.trim());
    const ans = userAnswer.trim().toLowerCase();

    if (isTrue && (ans === 'verdadero' || ans === 'true' || ans === 'v')) return 'correct';
    if (isFalse && (ans === 'falso' || ans === 'false' || ans === 'f')) return 'correct';
    return 'incorrect';
  }

  return 'blank';
}

/**
 * Mezcla aleatoria Fisher-Yates sin mutar el array original.
 */
function shuffleArray<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export const useExamStore = create<ExamState>((set, get) => ({
  config: DEFAULT_EXAM_CONFIG,
  setConfig: (partial) => {
    set((state) => ({ config: { ...state.config, ...partial } }));
  },

  cards: [],
  currentIndex: 0,
  answers: {},
  selfEvaluations: {},
  flagged: [],
  isStarted: false,
  isFinished: false,
  elapsedSeconds: 0,

  initExam: (allCards, customConfig) => {
    const mergedConfig = { ...get().config, ...customConfig };

    // 1. Filtrar por tipo si se pide solo tipo test / objetivo
    let filtered = allCards;
    if (mergedConfig.formatFilter === 'objective_only') {
      filtered = allCards.filter((c) => {
        const fmt = c.cardFormat || c.card_format || (c.card_type === 'cloze' ? 'cloze' : 'basic');
        return fmt === 'multiple_choice' || fmt === 'true_false';
      });
      // Fallback si no hay suficientes tarjetas objetivas
      if (filtered.length === 0) {
        filtered = allCards;
      }
    }

    // 2. Barajar aleatoriamente y recortar al tamaño seleccionado
    const shuffled = shuffleArray(filtered);
    const count = Math.min(mergedConfig.totalQuestions, shuffled.length);
    const selected = shuffled.slice(0, count);

    set({
      config: mergedConfig,
      cards: selected,
      currentIndex: 0,
      answers: {},
      selfEvaluations: {},
      flagged: [],
      isStarted: true,
      isFinished: false,
      elapsedSeconds: 0,
    });
  },

  selectAnswer: (cardId, answer) => {
    set((state) => {
      const isAnswered = typeof answer === 'string' && answer.trim().length > 0;
      const nextFlagged =
        isAnswered && state.flagged.includes(cardId)
          ? state.flagged.filter((id) => id !== cardId)
          : state.flagged;

      return {
        answers: {
          ...state.answers,
          [cardId]: answer,
        },
        flagged: nextFlagged,
      };
    });
  },

  setSelfEvaluation: (cardId, result) => {
    set((state) => ({
      selfEvaluations: {
        ...state.selfEvaluations,
        [cardId]: result,
      },
    }));
  },

  toggleFlag: (cardId) => {
    set((state) => {
      const isAlready = state.flagged.includes(cardId);
      const next = isAlready
        ? state.flagged.filter((id) => id !== cardId)
        : [...state.flagged, cardId];
      return { flagged: next };
    });
  },

  goToQuestion: (index) => {
    const total = get().cards.length;
    if (index >= 0 && index < total) {
      set({ currentIndex: index });
    }
  },

  finishExam: (elapsedSec) => {
    set((state) => ({
      isFinished: true,
      elapsedSeconds: typeof elapsedSec === 'number' ? elapsedSec : state.elapsedSeconds,
    }));
  },

  resetExam: () => {
    set({
      cards: [],
      currentIndex: 0,
      answers: {},
      selfEvaluations: {},
      flagged: [],
      isStarted: false,
      isFinished: false,
      elapsedSeconds: 0,
    });
  },

  computeResults: () => {
    const state = get();
    const { cards, answers, selfEvaluations, config } = state;
    const total = cards.length;

    let correctCount = 0;
    let incorrectCount = 0;
    let blankCount = 0;

    cards.forEach((card) => {
      const format =
        card.cardFormat ||
        card.card_format ||
        (card.card_type === 'cloze' ? 'cloze' : 'basic');

      const isObjective = format === 'multiple_choice' || format === 'true_false';

      if (isObjective) {
        const evalResult = evaluateObjectiveAnswer(card, answers[card.id]);
        if (evalResult === 'correct') correctCount++;
        else if (evalResult === 'incorrect') incorrectCount++;
        else blankCount++;
      } else {
        // basic o cloze: guiada por selfEvaluations
        const selfResult = selfEvaluations[card.id];
        const userTyped = answers[card.id];

        if (selfResult === 'correct') {
          correctCount++;
        } else if (selfResult === 'incorrect') {
          incorrectCount++;
        } else if (userTyped && userTyped.trim() !== '') {
          // Si respondió algo pero aún no calificó, no penalizar como fallo automático
          incorrectCount++;
        } else {
          blankCount++;
        }
      }
    });

    // Penalización según fórmula oficial
    let penaltyDivider = 0;
    if (config.penaltyFormula === 'one_third') penaltyDivider = 3;
    if (config.penaltyFormula === 'one_fourth') penaltyDivider = 4;

    const penaltyPoints = penaltyDivider > 0 ? incorrectCount / penaltyDivider : 0;
    const netScore = Math.max(0, correctCount - penaltyPoints);
    const scoreOutOf10 = total > 0 ? Math.round(((netScore / total) * 10) * 100) / 100 : 0;

    return {
      totalQuestions: total,
      correctCount,
      incorrectCount,
      blankCount,
      penaltyPoints: Math.round(penaltyPoints * 100) / 100,
      netScore: Math.round(netScore * 100) / 100,
      scoreOutOf10,
      passed: scoreOutOf10 >= 5.0,
    };
  },
}));
