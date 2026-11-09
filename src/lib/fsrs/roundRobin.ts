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

export function buildInterleavedCombinedQueue<T extends CardQueueItem>(
  cards: T[],
  deckOrder?: string[],
  options: QueueOptions = { includeFuture: false }
): T[] {
  if (!cards || cards.length === 0) return [];

  const nowTime = Date.now();

  // 1. Clasificar entre tarjetas con historial FSRS y tarjetas nuevas
  const reviewCards: T[] = [];
  const newCards: T[] = [];

  for (const card of cards) {
    const isNew =
      (card.state === 0 || card.state === undefined) &&
      (!card.reps || card.reps === 0);

    if (isNew) {
      newCards.push(card);
    } else {
      reviewCards.push(card);
    }
  }

  // 2. Ordenamiento FSRS estricto para tarjetas de repaso / aprendizaje
  reviewCards.sort((a, b) => {
    const timeA = new Date(a.due).getTime();
    const timeB = new Date(b.due).getTime();
    const aIsDue = timeA <= nowTime;
    const bIsDue = timeB <= nowTime;

    // Tarjetas vencidas siempre antes que tarjetas futuras
    if (aIsDue && !bIsDue) return -1;
    if (!aIsDue && bIsDue) return 1;

    // Dentro del mismo grupo, la más antigua / mayor vencimiento primero
    return timeA - timeB;
  });

  // 3. Algoritmo Round-Robin para tarjetas nuevas
  const interleavedNewCards: T[] = [];

  if (newCards.length > 0) {
    const deckGroups = new Map<string, T[]>();

    for (const card of newCards) {
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

    // Calcular el número máximo de tarjetas en cualquier mazo
    let maxGroupLength = 0;
    for (const group of deckGroups.values()) {
      if (group.length > maxGroupLength) {
        maxGroupLength = group.length;
      }
    }

    // Entrelazar cíclicamente (A1, B1, C1, A2, B2, C2...)
    for (let round = 0; round < maxGroupLength; round++) {
      for (const dId of distinctDecks) {
        const group = deckGroups.get(dId);
        if (group && round < group.length) {
          interleavedNewCards.push(group[round]);
        }
      }
    }
  }

  // 4. Composición de la Cola Final:
  // [Repasos FSRS Vencidos] -> [Nuevas Intercaladas Round-Robin]
  // Salvo que se solicite includeFuture: true explícitamente, se descartan futureReviews
  const dueReviews = reviewCards.filter((c) => new Date(c.due).getTime() <= nowTime);
  const futureReviews = reviewCards.filter((c) => new Date(c.due).getTime() > nowTime);

  if (options.includeFuture) {
    return [...dueReviews, ...interleavedNewCards, ...futureReviews];
  }

  return [...dueReviews, ...interleavedNewCards];
}

