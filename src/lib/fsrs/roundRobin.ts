/**
 * Algoritmo Round-Robin de Práctica Intercalada para Mazos Combinados (Cognitive Interleaving).
 *
 * Principio Pedagógico:
 * La práctica intercalada (interleaved practice) entre múltiples dominios o temas
 * incrementa significativamente la retención y la capacidad de discriminación conceptual,
 * en contraste con la práctica en bloques masivos (blocked practice).
 *
 * Reglas de Prioridad:
 * 1. Tarjetas de Repaso / Aprendizaje con historial FSRS activo (state !== 0 || reps > 0 || last_review != null):
 *    - Se ordenan estrictamente según el algoritmo FSRS: tarjetas vencidas primero (due <= now)
 *      por orden de vencimiento ascendente (mayor desfase temporal / urgencia de memoria).
 * 2. Tarjetas Nuevas sin historial FSRS (state === 0 && reps === 0 && !last_review):
 *    - Se agrupan por mazo (deck_id).
 *    - Se entrelazan matemáticamente mediante un ciclo Round-Robin estricto:
 *      Ronda 0: Mazo A (tarjeta 0), Mazo B (tarjeta 0), Mazo C (tarjeta 0)...
 *      Ronda 1: Mazo A (tarjeta 1), Mazo B (tarjeta 1), Mazo C (tarjeta 1)...
 *      Si un mazo agota sus tarjetas nuevas, se salta y se continúa con los restantes.
 * 3. Composición de la Cola de Estudio:
 *    - Primero se presentan los repasos vencidos (máxima prioridad para evitar olvido biológico).
 *    - A continuación se presentan las tarjetas nuevas intercaladas en Round-Robin.
 *    - Finalmente, repasos futuros si la sesión se solicita por adelantado.
 */

export interface CardQueueItem {
  id?: string;
  deck_id?: string;
  deckId?: string;
  due: string | Date;
  state?: number; // 0: New, 1: Learning, 2: Review, 3: Relearning
  reps?: number;
  lapses?: number;
  last_review?: string | Date | null;
  created_at?: string;
}

export interface QueueOptions {
  includeFuture?: boolean;
}

/**
 * Entrelaza cíclicamente (Round-Robin) una colección de tarjetas agrupándolas por su mazo de origen.
 * Dentro de cada mazo se preserva el orden interno de prioridad previamente establecido.
 */
function interleaveCardsByDeck<T extends CardQueueItem>(
  cardsToInterleave: T[],
  deckOrder?: string[]
): T[] {
  if (!cardsToInterleave || cardsToInterleave.length === 0) return [];

  const deckGroups = new Map<string, T[]>();

  for (const card of cardsToInterleave) {
    const dId = card.deck_id || card.deckId || 'unknown';
    if (!deckGroups.has(dId)) {
      deckGroups.set(dId, []);
    }
    deckGroups.get(dId)!.push(card);
  }

  // Respetar el orden en que el usuario seleccionó los mazos si se proporciona
  const distinctDecks =
    deckOrder && deckOrder.length > 0
      ? Array.from(new Set([...deckOrder, ...Array.from(deckGroups.keys())])).filter((id) =>
          deckGroups.has(id)
        )
      : Array.from(deckGroups.keys());

  let maxGroupLength = 0;
  for (const group of deckGroups.values()) {
    if (group.length > maxGroupLength) {
      maxGroupLength = group.length;
    }
  }

  const interleaved: T[] = [];
  for (let round = 0; round < maxGroupLength; round++) {
    for (const dId of distinctDecks) {
      const group = deckGroups.get(dId);
      if (group && round < group.length) {
        interleaved.push(group[round]);
      }
    }
  }

  return interleaved;
}

export function buildInterleavedCombinedQueue<T extends CardQueueItem>(
  cards: T[],
  deckOrder?: string[],
  options: QueueOptions = { includeFuture: false }
): T[] {
  if (!cards || cards.length === 0) return [];

  const nowTime = Date.now();

  // 1. Clasificar entre tarjetas con historial FSRS (vencidas vs futuras) y tarjetas nuevas
  const dueReviewCards: T[] = [];
  const futureReviewCards: T[] = [];
  const newCards: T[] = [];

  for (const card of cards) {
    const isNew =
      (card.state === 0 || card.state === undefined) &&
      (!card.reps || card.reps === 0);

    if (isNew) {
      newCards.push(card);
    } else {
      const dueTime = new Date(card.due).getTime();
      if (dueTime <= nowTime) {
        dueReviewCards.push(card);
      } else {
        futureReviewCards.push(card);
      }
    }
  }

  // 2. Ordenar internamente los repasos por urgencia de vencimiento (mayor retraso primero)
  //    antes de agruparlos y repartirlos en Round-Robin por mazo de origen
  dueReviewCards.sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());
  futureReviewCards.sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());

  // 3. Construir la cola activa por mazo (dentro de cada mazo: primero sus repasos vencidos y luego sus nuevas)
  //    y aplicar Round-Robin estricto entre todos los mazos seleccionados para garantizar interleaving real
  //    tanto entre mazos con repasos como entre mazos con tarjetas nuevas.
  const interleavedDueReviews = interleaveCardsByDeck(dueReviewCards, deckOrder);
  const interleavedNewCards = interleaveCardsByDeck(newCards, deckOrder);

  // Combinar por mazo para que cada turno de Round-Robin tome 1 tarjeta activa (repaso vencido o nueva)
  // de cada mazo seleccionado, evitando que un mazo con muchos repasos bloquee a otro mazo.
  const activeCardsByDeckPriority = [...interleavedDueReviews, ...interleavedNewCards];
  const interleavedActiveQueue = interleaveCardsByDeck(activeCardsByDeckPriority, deckOrder);

  if (options.includeFuture && futureReviewCards.length > 0) {
    const interleavedFutureReviews = interleaveCardsByDeck(futureReviewCards, deckOrder);
    return [...interleavedActiveQueue, ...interleavedFutureReviews];
  }

  return interleavedActiveQueue;
}

