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
