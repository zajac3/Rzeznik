// Date utility functions for PakoMat

/**
 * Format Date do formatu YYYY-MM-DD
 */
export function formatDateToISO(date: Date): string {
  try {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
}

/**
 * Parsowanie YYYY-MM-DD do Date w lokalnej strefie
 */
export function parseISODate(isoString: string): Date {
  if (!isoString || typeof isoString !== 'string') return new Date();
  try {
    const parts = isoString.split('-').map(Number);
    if (parts.length >= 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
    }
  } catch {
    // fallback
  }
  return new Date();
}

export const POLISH_DAYS_SHORT = ['Pn', 'Wt', 'Śr', 'Czw', 'Pt', 'Sb', 'Nd'];
export const POLISH_DAYS_FULL = [
  'Niedziela',
  'Poniedziałek',
  'Wtorek',
  'Środa',
  'Czwartek',
  'Piątek',
  'Sobota',
];

export const POLISH_MONTHS = [
  'stycznia',
  'lutego',
  'marca',
  'kwietnia',
  'maja',
  'czerwca',
  'lipca',
  'sierpnia',
  'września',
  'października',
  'listopada',
  'grudnia',
];

export const POLISH_MONTHS_NOMINATIVE = [
  'Styczeń',
  'Luty',
  'Marzec',
  'Kwiecień',
  'Maj',
  'Czerwiec',
  'Lipiec',
  'Sierpień',
  'Wrzesień',
  'Październik',
  'Listopad',
  'Grudzień',
];

export function formatPolishFriendlyDate(isoString: string): string {
  if (!isoString || typeof isoString !== 'string') return '';
  try {
    const parts = isoString.split('-');
    if (parts.length < 3) return isoString;
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    if (isNaN(year) || isNaN(month) || isNaN(day)) return isoString;
    const date = new Date(year, month - 1, day, 12, 0, 0);
    const dayName = POLISH_DAYS_FULL[date.getDay()] || '';
    const monthName = POLISH_MONTHS[date.getMonth()] || '';
    return `${dayName}, ${day} ${monthName} ${year}`;
  } catch {
    return isoString;
  }
}

export function isSameDay(d1: Date, d2: Date): boolean {
  try {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  } catch {
    return false;
  }
}

export function getTodayISO(): string {
  return formatDateToISO(new Date());
}

export interface CalendarMonthDay {
  date: Date;
  dateISO: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
}

/**
 * Zwraca komórki siatki kalendarza dla danego miesiąca (poniedziałek - niedziela)
 */
export function getMonthCalendarCells(year: number, month: number): CalendarMonthDay[] {
  const firstDayOfMonth = new Date(year, month, 1, 12, 0, 0);
  const lastDayOfMonth = new Date(year, month + 1, 0, 12, 0, 0);

  // Dzień tygodnia pierwszego dnia (0 = niedziela, 1 = poniedziałek)
  let firstDayWeekIndex = firstDayOfMonth.getDay() - 1;
  if (firstDayWeekIndex === -1) firstDayWeekIndex = 6; // niedziela

  const cells: CalendarMonthDay[] = [];
  const todayISO = getTodayISO();

  // Dni z poprzedniego miesiąca dopełniające pierwszy tydzień
  for (let i = firstDayWeekIndex; i > 0; i--) {
    const d = new Date(year, month, 1 - i, 12, 0, 0);
    const dateISO = formatDateToISO(d);
    cells.push({
      date: d,
      dateISO,
      dayNumber: d.getDate(),
      isCurrentMonth: false,
      isToday: dateISO === todayISO,
    });
  }

  // Dni bieżącego miesiąca
  for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
    const d = new Date(year, month, i, 12, 0, 0);
    const dateISO = formatDateToISO(d);
    cells.push({
      date: d,
      dateISO,
      dayNumber: i,
      isCurrentMonth: true,
      isToday: dateISO === todayISO,
    });
  }

  // Dni z kolejnego miesiąca dopełniające siatkę (wielokrotność 7)
  const remaining = (7 - (cells.length % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i, 12, 0, 0);
    const dateISO = formatDateToISO(d);
    cells.push({
      date: d,
      dateISO,
      dayNumber: d.getDate(),
      isCurrentMonth: false,
      isToday: dateISO === todayISO,
    });
  }

  return cells;
}
