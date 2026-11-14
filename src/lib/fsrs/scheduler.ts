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
 * Normaliza los intervalos de transición en estados de corto plazo (New / Learning / Relearning)
 * para evitar el bucle de 15m en 'Hard' y garantizar que la tarjeta progrese hacia intervalos en días.
 */
function applyShortTermGraduationSafeguards(
  fsrsCard: Card,
  result: RecordLogItem,
  rating: FSRSRating,
  now: Date
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
    }
  } else if (isShortTermState && rating === 3) {
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
}

/**
 * Convierte los campos de Supabase o entrada genérica a la estructura Card de ts-fsrs.
 */
export function toFSRSCard(input?: FSRSCardInput): Card {
  if (!input) {
    return createEmptyCard();
  }

  const now = new Date();
  const due = input.due ? (input.due instanceof Date ? input.due : new Date(input.due)) : now;
  const last_review = input.last_review
    ? input.last_review instanceof Date
      ? input.last_review
      : new Date(input.last_review)
    : undefined;

  let elapsed_days = 0;
  if (last_review) {
    const diffMs = Math.max(0, now.getTime() - last_review.getTime());
    elapsed_days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  return {
    due,
    stability: Number(input.stability) || 0,
    difficulty: Number(input.difficulty) || 0,
    elapsed_days,
    scheduled_days: 0,
    reps: Number(input.reps) || 0,
    lapses: Number(input.lapses) || 0,
    state: typeof input.state === 'number' ? input.state : State.New,
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

  const engine = customParams
    ? fsrs(generatorParameters({ ...defaultFSRSParams, ...customParams }))
    : f;
  const fsrsCard = toFSRSCard(card);
  const now = reviewDate instanceof Date ? reviewDate : new Date(reviewDate);

  const result = engine.next(fsrsCard, now, rating as Grade);

  applyShortTermGraduationSafeguards(fsrsCard, result, rating, now);

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

  const engine = customParams
    ? fsrs(generatorParameters({ ...defaultFSRSParams, ...customParams }))
    : f;
  const fsrsCard = toFSRSCard(card);
  const now = reviewDate instanceof Date ? reviewDate : new Date(reviewDate);

  const result = engine.next(fsrsCard, now, rating as Grade);

  applyShortTermGraduationSafeguards(fsrsCard, result, rating, now);

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
