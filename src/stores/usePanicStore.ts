import { create } from 'zustand';
import type { CardRow } from './useCardStore';

export type PanicFilter = 'weak_points' | 'at_risk' | 'all' | 'exam_errors';

export interface PanicState {
  // Estado de la sesión
  queue: CardRow[];
  initialCount: number;
  completedCount: number;
  failedCount: number;
  selectedFilter: PanicFilter;
  isStarted: boolean;
  isFinished: boolean;
  deckId: string | null;
  customCardIds: string[];

  // Acciones
  initPanicSession: (
    cards: CardRow[],
    filterType: PanicFilter,
    deckId?: string,
    customCardIds?: string[]
  ) => void;
  markKnown: () => void;
  markFailed: () => void;
  resetSession: () => void;
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

/**
 * Filtra y ordena tarjetas para el Modo Pánico de forma inteligente.
 * 100% de solo lectura y memoria.
 */
export function filterPanicCards(
  cards: CardRow[],
  filterType: PanicFilter,
  customCardIds?: string[]
): CardRow[] {
  if (!cards || cards.length === 0) return [];

  switch (filterType) {
    case 'weak_points': {
      // Capturar tanto los olvidos como las tarjetas con esfuerzo real (dificultad >= 7.0 o en reaprendizaje tras fallo)
      const matching = cards.filter(
        (card) => (card.lapses ?? 0) >= 1 || (card.difficulty ?? 0) >= 7.0 || card.state === 3
      );

      // Ordenar: primero por mayor número de lapses descendente, y en caso de empate por mayor difficulty descendente
      return matching.sort((a, b) => {
        const lapsesDiff = (b.lapses ?? 0) - (a.lapses ?? 0);
        if (lapsesDiff !== 0) return lapsesDiff;
        return (b.difficulty ?? 0) - (a.difficulty ?? 0);
      });
    }

    case 'at_risk': {
      const now = new Date();
      // Tarjetas vulnerables: baja estabilidad (<= 4.0d), vencidas o en aprendizaje/reaprendizaje (state 1 o 3)
      const matching = cards.filter(
        (card) =>
          (card.stability !== undefined && card.stability > 0 && card.stability <= 4.0) ||
          (card.due && new Date(card.due) <= now) ||
          card.state === 1 ||
          card.state === 3
      );

      // Ordenar: menor estabilidad primero (más vulnerables al inicio)
      return matching.sort((a, b) => {
        const stabA = a.stability !== undefined && a.stability > 0 ? a.stability : 0;
        const stabB = b.stability !== undefined && b.stability > 0 ? b.stability : 0;
        if (stabA !== stabB) return stabA - stabB;
        const timeA = a.due ? new Date(a.due).getTime() : 0;
        const timeB = b.due ? new Date(b.due).getTime() : 0;
        return timeA - timeB;
      });
    }

    case 'all': {
      return shuffleArray(cards);
    }

    case 'exam_errors': {
      if (!customCardIds || customCardIds.length === 0) return [];
      const idSet = new Set(customCardIds);
      return cards.filter((c) => idSet.has(c.id));
    }

    default:
      return cards;
  }
}

export const usePanicStore = create<PanicState>((set, get) => ({
  queue: [],
  initialCount: 0,
  completedCount: 0,
  failedCount: 0,
  selectedFilter: 'weak_points',
  isStarted: false,
  isFinished: false,
  deckId: null,
  customCardIds: [],

  initPanicSession: (cards, filterType, deckId, customCardIds) => {
    const filtered = filterPanicCards(cards, filterType, customCardIds);

    set({
      queue: filtered,
      initialCount: filtered.length,
      completedCount: 0,
      failedCount: 0,
      selectedFilter: filterType,
      isStarted: true,
      isFinished: filtered.length === 0,
      deckId: deckId || null,
      customCardIds: customCardIds || [],
    });
  },

  markKnown: () => {
    const { queue, completedCount } = get();
    if (queue.length === 0) return;

    const nextQueue = queue.slice(1);
    const nextCompleted = completedCount + 1;

    set({
      queue: nextQueue,
      completedCount: nextCompleted,
      isFinished: nextQueue.length === 0,
    });
  },

  markFailed: () => {
    const { queue, failedCount } = get();
    if (queue.length === 0) return;

    // Mueve la tarjeta fallada al final de la cola para volver a verla en esta sesión
    const [currentCard, ...rest] = queue;
    const nextQueue = [...rest, currentCard];

    set({
      queue: nextQueue,
      failedCount: failedCount + 1,
    });
  },

  resetSession: () => {
    set({
      queue: [],
      initialCount: 0,
      completedCount: 0,
      failedCount: 0,
      isStarted: false,
      isFinished: false,
      deckId: null,
      customCardIds: [],
    });
  },
}));
