import {
  fsrs,
  generatorParameters,
  createEmptyCard,
  Rating,
  State,
  default_w,
  type Card,
  type Grade,
  type RecordLogItem,
  type FSRSParameters,
} from 'ts-fsrs';
import type { Database } from '@/types/database';

/**
 * Calificaciones estándar de FSRS:
 * 1 = Again (Repetir / Fallo)
 * 2 = Hard (Difícil)
 * 3 = Good (Bueno / Correcto)
 * 4 = Easy (Fácil)
 */
export type FSRSRating = 1 | 2 | 3 | 4;

/**
 * Estructura de entrada con los datos FSRS actuales de la tarjeta.
 * Compatible con la fila de Supabase o cualquier objeto con campos FSRS.
 */
export interface FSRSCardInput {
  due?: string | Date;
  stability?: number;
  difficulty?: number;
  state?: number; // 0: New, 1: Learning, 2: Review, 3: Relearning
  reps?: number;
  lapses?: number;
  last_review?: string | Date | null;
}

/**
 * Objeto limpio y fuertemente tipado para guardar directamente en la tabla 'cards' de Supabase.
 */
export type FSRSUpdatedCard = Pick<
  Database['public']['Tables']['cards']['Update'],
  'due' | 'stability' | 'difficulty' | 'state' | 'reps' | 'lapses' | 'last_review'
> & {
  due: string;
  stability: number;
  difficulty: number;
  state: number;
  reps: number;
  lapses: number;
  last_review: string;
};

/**
 * Registro de revisión listo para insertar en la tabla 'reviews' de Supabase.
 */
export interface FSRSReviewLog {
  rating: number;
  state: number;
  stability: number;
  difficulty: number;
  due: string;
  reviewed_at: string;
}

// Instancia global con configuración predeterminada de FSRS y curva de espaciado optimizada
export const initialFSRSWeights: number[] = [...default_w];
initialFSRSWeights[1] = 1.0; // Difícil: base monotónica de 1 día tras paso inicial
initialFSRSWeights[2] = 2.3; // Correcto: al menos 2 días de estabilidad inicial en tarjetas nuevas
initialFSRSWeights[3] = 4.5; // Fácil: 4 a 5 días de estabilidad inicial

export const defaultFSRSParams = generatorParameters({
  enable_fuzz: true,
  learning_steps: ['10m'], // Fallo: 10 minutos
  relearning_steps: ['10m'],
  w: initialFSRSWeights,
});
export const f = fsrs(defaultFSRSParams);

/**
 * Normaliza request_retention a un rango saludable [0.75, 0.94/0.95].
 * Si un perfil tiene > 0.95 (ej. 0.99) o < 0.75, lo restablece a 0.90 para evitar
 * que la función exponencial de ts-fsrs comprima todos los intervalos a 1 día.
 */
export function sanitizeRequestRetention(retention?: number): number {
  if (typeof retention !== 'number' || Number.isNaN(retention) || retention > 0.95 || retention < 0.75) {
    return 0.90;
  }
  return retention;
}

/**
 * Obtiene una instancia configurada de FSRS aplicando saneamiento sobre request_retention.
 */
export function getFSRSInstance(customParams?: Partial<FSRSParameters>) {
  if (!customParams) return f;
  const sanitizedRetention = sanitizeRequestRetention(customParams.request_retention);
  return fsrs(
    generatorParameters({
      ...defaultFSRSParams,
      ...customParams,
      request_retention: sanitizedRetention,
    })
  );
}

/**
 * Devuelve el final del día natural en hora local (23:59:59.999) para la fecha dada.
 */
export function getEndOfLocalDay(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
}

/**
 * Determina de forma canónica si una tarjeta es elegible para estudiarse hoy:
 * - Nueva (state === 0 && reps === 0): siempre true.
 * - Aprendizaje / Reaprendizaje intradía (state === 1 || state === 3): compara contra el instante actual (due <= now)
 *   para respetar los pasos cortos de 10m y 3h.
 * - Repaso en días (state === 2 o reps > 0): compara contra el final del día natural local de hoy (23:59:59.999),
 *   de modo que toda tarjeta de repaso que vence hoy esté disponible desde primera hora de la mañana.
 */
export function isCardDueForStudy(card: FSRSCardInput, now: Date = new Date()): boolean {
  const state = card.state ?? 0;
  const reps = card.reps ?? 0;

  if (state === State.New && reps === 0) {
    return true;
  }

  if (!card.due) {
    return true;
  }

  const dueTime = (card.due instanceof Date ? card.due : new Date(card.due)).getTime();
  if (Number.isNaN(dueTime)) {
    return true;
  }

  if (state === State.Learning || state === State.Relearning) {
    return dueTime <= now.getTime();
  }

  const endOfTodayTime = getEndOfLocalDay(now).getTime();
  return dueTime <= endOfTodayTime;
}

/**
 * Devuelve true únicamente si la tarjeta NO es nueva (tiene historial o state !== 0)
 * y está vencida para repasar hoy según isCardDueForStudy.
 */
export function isReviewCardDueToday(card: FSRSCardInput, now: Date = new Date()): boolean {
  const state = card.state ?? 0;
  const reps = card.reps ?? 0;
  const isNew = state === State.New && reps === 0;
  if (isNew) return false;
  return isCardDueForStudy(card, now);
}

/**
 * Ordena dos tarjetas de repaso vencidas dando prioridad a las del ciclo actual
 * (estudiadas ayer/hoy o con vencimiento entre ayer y hoy) antes que al remanente antiguo,
 * y dentro de cada grupo por fecha de vencimiento ascendente.
 */
export function compareDueReviewsFreshFirst(
  a: FSRSCardInput,
  b: FSRSCardInput,
  now: Date = new Date()
): number {
  const yesterdayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 1,
    0,
    0,
    0,
    0
  ).getTime();

  const aDue = a.due ? new Date(a.due).getTime() : 0;
  const bDue = b.due ? new Date(b.due).getTime() : 0;
  const aLast = a.last_review ? new Date(a.last_review).getTime() : 0;
  const bLast = b.last_review ? new Date(b.last_review).getTime() : 0;

  const aIsFresh = aLast >= yesterdayStart || aDue >= yesterdayStart;
  const bIsFresh = bLast >= yesterdayStart || bDue >= yesterdayStart;

  if (aIsFresh !== bIsFresh) {
    return aIsFresh ? -1 : 1;
  }

  return aDue - bDue;
}

/**
 * Intercala tarjetas de Repaso vencidas y tarjetas Nuevas siguiendo una proporción equilibrada
 * (por defecto 3 de Repaso por cada 1 Nueva: patrón 3:1).
 * Cuando una de las dos listas se agota, añade el resto de la otra lista.
 */
export function mixReviewsAndNewCards<T>(
  dueReviewCards: T[],
  newCards: T[],
  reviewsPerNew: number = 3
): T[] {
  if (dueReviewCards.length === 0) return [...newCards];
  if (newCards.length === 0) return [...dueReviewCards];

  const mixed: T[] = [];
  const ratio = Math.max(1, reviewsPerNew);
  let rIdx = 0;
  let nIdx = 0;

  while (rIdx < dueReviewCards.length || nIdx < newCards.length) {
    for (let i = 0; i < ratio && rIdx < dueReviewCards.length; i++) {
      mixed.push(dueReviewCards[rIdx++]);
    }
    if (nIdx < newCards.length) {
      mixed.push(newCards[nIdx++]);
    }
  }

  return mixed;
}

/**
 * Filtra las tarjetas elegibles hoy, prioriza los repasos frescos del ciclo actual (hoy/ayer)
 * y construye una cola equilibrada 3:1 (3 Repasos vencidos por cada 1 tarjeta Nueva).
 */
export function sortStudyQueuePrioritizingReviews<
  T extends FSRSCardInput & { created_at?: string }
>(cards: T[], now: Date = new Date()): T[] {
  if (!cards || cards.length === 0) return [];

  const eligible = cards.filter((c) => isCardDueForStudy(c, now));
  const dueReviewCards: T[] = [];
  const newCards: T[] = [];

  for (const card of eligible) {
    const isNew = (card.state === 0 || card.state === undefined) && (card.reps ?? 0) === 0;
    if (isNew) {
      newCards.push(card);
    } else {
      dueReviewCards.push(card);
    }
  }

  dueReviewCards.sort((a, b) => compareDueReviewsFreshFirst(a, b, now));

  newCards.sort((a, b) => {
    const aSource = a.created_at || a.due;
    const bSource = b.created_at || b.due;
    const aTime = aSource ? new Date(aSource).getTime() : 0;
    const bTime = bSource ? new Date(bSource).getTime() : 0;
    return aTime - bTime;
  });

  return mixReviewsAndNewCards(dueReviewCards, newCards, 3);
}

/**
 * Normaliza los intervalos de transición en estados de corto plazo (New / Learning / Relearning)
 * para evitar el bucle de 15m en 'Hard' y garantizar que la tarjeta progrese hacia intervalos en días.
 */
function applyShortTermGraduationSafeguards(
  fsrsCard: Card,
  result: RecordLogItem,
  rating: FSRSRating,
  now: Date,
  customParams?: Partial<FSRSParameters>
): void {
  const isNewCard = fsrsCard.state === State.New || fsrsCard.reps === 0;
  const isShortTermState =
    fsrsCard.state === State.Learning || fsrsCard.state === State.Relearning;

  if (rating === 2) {
    if (isNewCard) {
      // Tarjeta nueva en 'Difícil': primer repaso a las 3 horas
      const due3h = new Date(now.getTime() + 3 * 60 * 60 * 1000);
      result.card.due = due3h;
      result.log.due = due3h;
      return;
    } else if (isShortTermState) {
      // Tarjeta en Learning (1) o Relearning (3) calificada como 'Difícil':
      // graduación segura a 1 día (24h) para romper el bucle de 15 minutos de ts-fsrs
      const due1d = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
      result.card.due = due1d;
      result.card.state = State.Review;
      result.card.scheduled_days = 1;
      result.card.stability = Math.max(result.card.stability, 1.0);
      result.log.due = due1d;
      result.log.state = State.Review;
      result.log.scheduled_days = 1;
      result.log.stability = result.card.stability;
      return;
    }
  } else if (rating === 3) {
    if (isNewCard) {
      // Tarjeta nueva calificada como 'Good (3)': garantizar mínimo 2 días
      const minDays = 2;
      const minStability = 2.3;
      if (result.card.stability < minStability) {
        result.card.stability = minStability;
        result.log.stability = minStability;
      }
      const minDueTime = now.getTime() + minDays * 24 * 60 * 60 * 1000;
      if (result.card.due.getTime() < minDueTime || result.card.scheduled_days < minDays) {
        const safeDue = new Date(minDueTime);
        result.card.due = safeDue;
        result.card.state = State.Review;
        result.card.scheduled_days = Math.max(result.card.scheduled_days, minDays);
        result.log.due = safeDue;
        result.log.state = State.Review;
        result.log.scheduled_days = result.card.scheduled_days;
      }
    } else if (isShortTermState) {
      // Si sale de Learning/Relearning en el mismo día con 'Good' tras un fallo previo,
      // asegurar estabilidad mínima saludable para no estancarse en 0.24d en días sucesivos
      const minGoodStability = fsrsCard.state === State.Learning ? 2.0 : 1.5;
      if (result.card.stability < minGoodStability) {
        result.card.stability = minGoodStability;
        result.log.stability = minGoodStability;
      }
      const minGoodDays = fsrsCard.state === State.Learning ? 2 : 1;
      const minDueTime = now.getTime() + minGoodDays * 24 * 60 * 60 * 1000;
      if (result.card.due.getTime() < minDueTime) {
        const safeDue = new Date(minDueTime);
        result.card.due = safeDue;
        result.card.scheduled_days = minGoodDays;
        result.log.due = safeDue;
        result.log.scheduled_days = minGoodDays;
      }
    }
  } else if (rating === 4 && (isNewCard || isShortTermState)) {
    // Tarjeta nueva o en aprendizaje calificada como 'Easy (4)': garantizar mínimo 4 días
    const minEasyDays = 4;
    const minEasyStability = 4.5;
    if (result.card.stability < minEasyStability) {
      result.card.stability = minEasyStability;
      result.log.stability = minEasyStability;
    }
    const minDueTime = now.getTime() + minEasyDays * 24 * 60 * 60 * 1000;
    if (result.card.due.getTime() < minDueTime || result.card.scheduled_days < minEasyDays) {
      const safeDue = new Date(minDueTime);
      result.card.due = safeDue;
      result.card.state = State.Review;
      result.card.scheduled_days = Math.max(result.card.scheduled_days, minEasyDays);
      result.log.due = safeDue;
      result.log.state = State.Review;
      result.log.scheduled_days = result.card.scheduled_days;
    }
  }

  // Escalera progresiva estricta de intervalos para State.Review (rating 2, 3 o 4):
  // Impide saltos de 30-60 días ("2 meses") por acumulación de elapsed_days y fija un tope absoluto de 21 días.
  if (result.card.state === State.Review && rating >= 2) {
    const nextReps = Math.max(1, result.card.reps || 1);
    let minAllowedDays = 1;
    let maxAllowedDays = 21;

    if (nextReps <= 1) {
      // 1.ª vez graduada: Hard = 1d, Good = 2d, Easy = 4d
      if (rating === 2) {
        minAllowedDays = 1;
        maxAllowedDays = 1;
      } else if (rating === 3) {
        minAllowedDays = 2;
        maxAllowedDays = 2;
      } else if (rating === 4) {
        minAllowedDays = 4;
        maxAllowedDays = 4;
      }
    } else if (nextReps === 2) {
      // 2.ª vez: Hard = 2d, Good = 3-4d (máx 4d), Easy = 5-7d (máx 7d)
      if (rating === 2) {
        minAllowedDays = 2;
        maxAllowedDays = 2;
      } else if (rating === 3) {
        minAllowedDays = 3;
        maxAllowedDays = 4;
      } else if (rating === 4) {
        minAllowedDays = 5;
        maxAllowedDays = 7;
      }
    } else if (nextReps === 3) {
      // 3.ª vez: Hard = 3d, Good = 6-8d (máx 8d), Easy = 9-12d (máx 12d)
      if (rating === 2) {
        minAllowedDays = 3;
        maxAllowedDays = 3;
      } else if (rating === 3) {
        minAllowedDays = 6;
        maxAllowedDays = 8;
      } else if (rating === 4) {
        minAllowedDays = 9;
        maxAllowedDays = 12;
      }
    } else if (nextReps === 4) {
      // 4.ª vez: Hard = 5d, Good = 10-14d (máx 14d), Easy = 15-18d (máx 18d)
      if (rating === 2) {
        minAllowedDays = 5;
        maxAllowedDays = 5;
      } else if (rating === 3) {
        minAllowedDays = 10;
        maxAllowedDays = 14;
      } else if (rating === 4) {
        minAllowedDays = 15;
        maxAllowedDays = 18;
      }
    } else {
      // 5.ª vez o más (nextReps >= 5): Hard máx 7d, Good máx 18d, Easy tope absoluto de 21 días
      if (rating === 2) {
        minAllowedDays = 5;
        maxAllowedDays = 7;
      } else if (rating === 3) {
        minAllowedDays = 12;
        maxAllowedDays = 18;
      } else {
        minAllowedDays = 16;
        maxAllowedDays = 21;
      }
    }

    if (customParams?.maximum_interval && customParams.maximum_interval > 0) {
      maxAllowedDays = Math.min(maxAllowedDays, customParams.maximum_interval);
      minAllowedDays = Math.min(minAllowedDays, maxAllowedDays);
    }

    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const rawDiffDays = Math.round((result.card.due.getTime() - now.getTime()) / MS_PER_DAY);
    const currentDays = Math.max(result.card.scheduled_days || 0, rawDiffDays);
    const targetDays = Math.min(maxAllowedDays, Math.max(minAllowedDays, currentDays));

    const adjustedDue = new Date(now.getTime() + targetDays * MS_PER_DAY);
    const clampedStability = Math.min(
      maxAllowedDays,
      Math.max(minAllowedDays, result.card.stability || targetDays)
    );

    result.card.scheduled_days = targetDays;
    result.card.stability = clampedStability;
    result.card.due = adjustedDue;
    result.log.scheduled_days = targetDays;
    result.log.stability = clampedStability;
    result.log.due = adjustedDue;
  }
}

/**
 * Convierte los campos de Supabase o entrada genérica a la estructura Card de ts-fsrs.
 */
export function toFSRSCard(input?: FSRSCardInput, referenceNow: Date = new Date()): Card {
  if (!input) {
    return createEmptyCard(referenceNow);
  }

  const now = referenceNow;
  const due = input.due ? (input.due instanceof Date ? input.due : new Date(input.due)) : now;
  const last_review = input.last_review
    ? input.last_review instanceof Date
      ? input.last_review
      : new Date(input.last_review)
    : undefined;

  const rawState = typeof input.state === 'number' ? input.state : State.New;
  const rawStability = Number(input.stability) || 0;
  const rawDifficulty = Number(input.difficulty) || 0;
  const stability = rawState === State.New ? 0 : rawStability > 0 ? rawStability : 0;
  const difficulty = stability > 0 ? rawDifficulty : 0;
  const state = stability === 0 && rawState !== State.New ? State.New : rawState;

  let elapsed_days = 0;
  if (last_review && stability > 0) {
    const diffMs = Math.max(0, now.getTime() - last_review.getTime());
    const rawElapsed = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    // Limitar el elapsed_days efectivo para evitar que el overdue bonus exponencial de ts-fsrs
    // dispare la estabilidad cuando una tarjeta lleva semanas acumulada sin repasarse
    const maxEffectiveElapsed = Math.max(2, Math.ceil(stability * 2));
    elapsed_days = Math.min(rawElapsed, maxEffectiveElapsed);
  }

  return {
    due,
    stability,
    difficulty,
    elapsed_days,
    scheduled_days: Math.max(0, Math.round(stability)),
    reps: Number(input.reps) || 0,
    lapses: Number(input.lapses) || 0,
    state,
    last_review,
    learning_steps: 0,
  };
}

/**
 * Función principal del algoritmo FSRS:
 * Recibe los datos actuales de una tarjeta y una calificación del 1 al 4 (1=Again, 2=Hard, 3=Good, 4=Easy).
 * Calcula y devuelve el nuevo 'state', 'stability', 'difficulty', 'reps', 'lapses' y 'due',
 * soportando tarjetas nuevas (New), en aprendizaje (Learning), en repaso (Review) y en reaprendizaje (Relearning).
 *
 * @param card Datos actuales de la tarjeta en Supabase
 * @param rating Calificación del 1 al 4 (1=Again, 2=Hard, 3=Good, 4=Easy)
 * @param reviewDate Fecha opcional del repaso (por defecto ahora)
 * @param customParams Parámetros FSRS personalizados opcionales
 * @returns Objeto limpio y tipado para guardar directamente en Supabase
 */
export function scheduleReview(
  card: FSRSCardInput,
  rating: FSRSRating,
  reviewDate: Date | string = new Date(),
  customParams?: Partial<FSRSParameters>
): FSRSUpdatedCard {
  if (rating < 1 || rating > 4) {
    throw new Error(
      `Calificación inválida (${rating}). Debe ser un número del 1 al 4 (1=Again, 2=Hard, 3=Good, 4=Easy).`
    );
  }

  const engine = getFSRSInstance(customParams);
  const now = reviewDate instanceof Date ? reviewDate : new Date(reviewDate);
  const fsrsCard = toFSRSCard(card, now);

  const result = engine.next(fsrsCard, now, rating as Grade);

  applyShortTermGraduationSafeguards(fsrsCard, result, rating, now, customParams);

  return {
    due: result.card.due.toISOString(),
    stability: Number(result.card.stability.toFixed(4)),
    difficulty: Number(result.card.difficulty.toFixed(4)),
    state: result.card.state,
    reps: result.card.reps,
    lapses: result.card.lapses,
    last_review: now.toISOString(),
  };
}

/**
 * Ejecuta el cálculo FSRS y devuelve tanto la tarjeta actualizada como el log para la tabla 'reviews'.
 */
export function scheduleReviewWithLog(
  card: FSRSCardInput,
  rating: FSRSRating,
  reviewDate: Date | string = new Date(),
  customParams?: Partial<FSRSParameters>
): { card: FSRSUpdatedCard; review: FSRSReviewLog } {
  if (rating < 1 || rating > 4) {
    throw new Error(
      `Calificación inválida (${rating}). Debe ser un número del 1 al 4 (1=Again, 2=Hard, 3=Good, 4=Easy).`
    );
  }

  const engine = getFSRSInstance(customParams);
  const now = reviewDate instanceof Date ? reviewDate : new Date(reviewDate);
  const fsrsCard = toFSRSCard(card, now);

  const result = engine.next(fsrsCard, now, rating as Grade);

  applyShortTermGraduationSafeguards(fsrsCard, result, rating, now, customParams);

  const updatedCard: FSRSUpdatedCard = {
    due: result.card.due.toISOString(),
    stability: Number(result.card.stability.toFixed(4)),
    difficulty: Number(result.card.difficulty.toFixed(4)),
    state: result.card.state,
    reps: result.card.reps,
    lapses: result.card.lapses,
    last_review: now.toISOString(),
  };

  const reviewLog: FSRSReviewLog = {
    rating,
    state: result.log.state,
    stability: Number(result.log.stability.toFixed(4)),
    difficulty: Number(result.log.difficulty.toFixed(4)),
    due: result.log.due.toISOString(),
    reviewed_at: now.toISOString(),
  };

  return { card: updatedCard, review: reviewLog };
}

/**
 * Previsualiza las 4 calificaciones posibles para una tarjeta (Again, Hard, Good, Easy).
 * Ideal para renderizar el intervalo o fecha próxima en los botones de repaso de la interfaz.
 */
export function previewNextIntervals(
  card: FSRSCardInput,
  reviewDate: Date | string = new Date(),
  customParams?: Partial<FSRSParameters>
): Record<FSRSRating, FSRSUpdatedCard> {
  return {
    1: scheduleReview(card, 1, reviewDate, customParams),
    2: scheduleReview(card, 2, reviewDate, customParams),
    3: scheduleReview(card, 3, reviewDate, customParams),
    4: scheduleReview(card, 4, reviewDate, customParams),
  };
}

/**
 * Devuelve los valores FSRS iniciales para insertar una tarjeta nueva en Supabase.
 */
export function createInitialCardValues(now: Date = new Date()): FSRSUpdatedCard {
  return {
    due: now.toISOString(),
    stability: 0,
    difficulty: 0,
    state: State.New,
    reps: 0,
    lapses: 0,
    last_review: now.toISOString(),
  };
}

// Re-exportar tipos y utilidades clave de ts-fsrs
export { Rating, State, createEmptyCard };
export type { Card, Grade, RecordLogItem };
