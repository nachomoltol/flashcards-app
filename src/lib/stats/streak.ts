import { supabase } from '@/lib/supabase';

export interface StreakInfo {
  current: number;
  max: number;
  studiedToday: boolean;
  totalActiveDays: number;
}

/**
 * Convierte un Date o timestamp a la cadena de fecha local 'YYYY-MM-DD'
 */
export function toLocalDateString(dateInput: Date | string | number): string {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calcula la racha activa y máxima a partir de una lista de marcas de tiempo de repaso.
 */
export function calculateStreak(
  timestamps: (string | Date | number | null | undefined)[]
): StreakInfo {
  const dateSet = new Set<string>();

  for (const item of timestamps) {
    if (!item) continue;
    const dateStr = toLocalDateString(item);
    if (dateStr) {
      dateSet.add(dateStr);
    }
  }

  if (dateSet.size === 0) {
    return {
      current: 0,
      max: 0,
      studiedToday: false,
      totalActiveDays: 0,
    };
  }

  const now = new Date();
  const todayStr = toLocalDateString(now);

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toLocalDateString(yesterday);

  const studiedToday = dateSet.has(todayStr);
  const studiedYesterday = dateSet.has(yesterdayStr);

  // 1. Racha Actual
  let current = 0;
  if (studiedToday) {
    current = 1;
    const checkDate = new Date(now);
    while (true) {
      checkDate.setDate(checkDate.getDate() - 1);
      const str = toLocalDateString(checkDate);
      if (dateSet.has(str)) {
        current++;
      } else {
        break;
      }
    }
  } else if (studiedYesterday) {
    // Si no ha estudiado hoy pero sí ayer, la racha sigue viva pendiente de repasar hoy
    current = 1;
    const checkDate = new Date(yesterday);
    while (true) {
      checkDate.setDate(checkDate.getDate() - 1);
      const str = toLocalDateString(checkDate);
      if (dateSet.has(str)) {
        current++;
      } else {
        break;
      }
    }
  } else {
    current = 0;
  }

  // 2. Racha Máxima
  const sortedDates = Array.from(dateSet).sort();
  let max = current;
  let tempStreak = 0;
  let prevDate: Date | null = null;

  for (const dateStr of sortedDates) {
    const [y, m, d] = dateStr.split('-').map(Number);
    // Usar las 12:00:00 (mediodía) para evitar alteraciones por horario de verano (DST)
    const currentDate = new Date(y, m - 1, d, 12, 0, 0);

    if (!prevDate) {
      tempStreak = 1;
    } else {
      const diffMs = currentDate.getTime() - prevDate.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        tempStreak++;
      } else if (diffDays > 1) {
        tempStreak = 1;
      }
    }

    prevDate = currentDate;
    if (tempStreak > max) {
      max = tempStreak;
    }
  }

  return {
    current,
    max: Math.max(max, current),
    studiedToday,
    totalActiveDays: dateSet.size,
  };
}

/**
 * Consulta la base de datos de Supabase para obtener todas las fechas de repaso del usuario
 * combinando logs de reviews y registros de tarjetas.
 */
export async function fetchUserStreak(userId: string): Promise<StreakInfo> {
  if (!userId) {
    return { current: 0, max: 0, studiedToday: false, totalActiveDays: 0 };
  }

  try {
    const timestamps: (string | Date)[] = [];

    // 1. Obtener los mazos del usuario
    const { data: userDecks, error: decksErr } = await supabase
      .from('decks')
      .select('id')
      .eq('user_id', userId);

    if (decksErr || !userDecks || userDecks.length === 0) {
      return { current: 0, max: 0, studiedToday: false, totalActiveDays: 0 };
    }

    const deckIds = userDecks.map((d) => d.id);

    // 2. Obtener tarjetas de esos mazos
    const { data: userCards, error: cardsErr } = await supabase
      .from('cards')
      .select('id, last_review')
      .in('deck_id', deckIds);

    if (!cardsErr && userCards && userCards.length > 0) {
      userCards.forEach((c) => {
        if (c.last_review) timestamps.push(c.last_review);
      });

      const cardIds = userCards.map((c) => c.id);

      // 3. Obtener reviews de esas tarjetas
      const { data: userReviews } = await supabase
        .from('reviews')
        .select('created_at')
        .in('card_id', cardIds)
        .order('created_at', { ascending: false });

      if (userReviews) {
        userReviews.forEach((r) => {
          if (r.created_at) timestamps.push(r.created_at);
        });
      }
    }

    return calculateStreak(timestamps);
  } catch (err) {
    console.warn('Error al calcular racha del usuario:', err);
    return { current: 0, max: 0, studiedToday: false, totalActiveDays: 0 };
  }
}
