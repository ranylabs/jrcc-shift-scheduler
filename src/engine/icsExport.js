import { SHIFT_CODES } from './constants';
import { getMonthMeta } from './dateUtils';

const CALENDAR_HEADER = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//SCHED RCC APP//Shift Export//EN',
  'CALSCALE:GREGORIAN',
  'METHOD:PUBLISH'
];

const CALENDAR_FOOTER = ['END:VCALENDAR'];

export function exportEmployeeScheduleToIcs({ monthKey, employee, schedule }) {
  const events = buildEmployeeShiftEvents({ monthKey, employee, schedule });

  if (events.length === 0) {
    return { hasEvents: false, fileName: buildIcsFileName(employee?.name ?? 'employee'), content: '' };
  }

  const lines = [...CALENDAR_HEADER];

  for (const event of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${event.uid}`);
    lines.push(`DTSTAMP:${event.dtStamp}`);
    lines.push(`DTSTART:${event.dtStart}`);
    lines.push(`DTEND:${event.dtEnd}`);
    lines.push(`SUMMARY:${escapeIcsText(event.summary)}`);
    lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
    lines.push('END:VEVENT');
  }

  lines.push(...CALENDAR_FOOTER);

  const content = `${lines.join('\r\n')}\r\n`;
  downloadIcsFile(content, buildIcsFileName(employee.name));

  return { hasEvents: true, fileName: buildIcsFileName(employee.name), content };
}

function buildEmployeeShiftEvents({ monthKey, employee, schedule }) {
  const monthMeta = getMonthMeta(monthKey);
  const events = [];

  for (const day of monthMeta.days) {
    const shiftCode = schedule?.[day.dayNumber]?.[employee.id];

    if (shiftCode !== SHIFT_CODES.MORNING && shiftCode !== SHIFT_CODES.NIGHT) {
      continue;
    }

    const startDate =
      shiftCode === SHIFT_CODES.MORNING
        ? new Date(monthMeta.year, monthMeta.month - 1, day.dayNumber, 7, 0, 0)
        : new Date(monthMeta.year, monthMeta.month - 1, day.dayNumber, 19, 0, 0);
    const endDate =
      shiftCode === SHIFT_CODES.MORNING
        ? new Date(monthMeta.year, monthMeta.month - 1, day.dayNumber, 19, 0, 0)
        : new Date(monthMeta.year, monthMeta.month - 1, day.dayNumber + 1, 7, 0, 0);

    events.push({
      uid: buildUid(monthKey, employee.id, day.dayNumber, shiftCode),
      dtStamp: formatUtcDateTime(new Date()),
      dtStart: formatLocalDateTime(startDate),
      dtEnd: formatLocalDateTime(endDate),
      summary: shiftCode === SHIFT_CODES.MORNING ? 'משמרת בוקר' : 'משמרת לילה',
      description: employee.name ?? ''
    });
  }

  return events;
}

function buildUid(monthKey, employeeId, dayNumber, shiftCode) {
  return `${monthKey}-${employeeId}-${dayNumber}-${shiftCode}@sched-rcc-app`;
}

function formatLocalDateTime(date) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('') + `T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function formatUtcDateTime(date) {
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate())
  ].join('') + `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function escapeIcsText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function buildIcsFileName(employeeName) {
  const safeName = String(employeeName ?? 'employee')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 80) || 'employee';

  return `schedule-${safeName}.ics`;
}

function downloadIcsFile(content, fileName) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
