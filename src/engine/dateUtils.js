import { WEEKDAY_LABELS } from './constants';

export function getMonthMeta(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();

  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const dayNumber = index + 1;
    const date = new Date(year, month - 1, dayNumber);
    const weekday = date.getDay();

    return {
      dayNumber,
      weekday,
      weekdayLabel: WEEKDAY_LABELS[weekday],
      isWeekend: weekday === 6
    };
  });

  return { year, month, daysInMonth, days };
}

export function getCurrentMonthKey() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function shiftMonth(monthKey, delta) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  const nextMonth = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${nextMonth}`;
}

export function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  return new Intl.DateTimeFormat('he-IL', {
    month: 'long',
    year: 'numeric'
  }).format(date);
}
