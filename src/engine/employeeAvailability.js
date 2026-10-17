import { SHIFT_CODES } from './constants';

const VALID_SHIFT_CODES = new Set([SHIFT_CODES.MORNING, SHIFT_CODES.NIGHT]);

export function normalizeUnavailableShiftsByWeekday(restrictions) {
  if (!restrictions || typeof restrictions !== 'object' || Array.isArray(restrictions)) {
    return {};
  }

  const normalized = {};
  for (const [weekdayValue, shifts] of Object.entries(restrictions)) {
    const weekday = Number(weekdayValue);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || !Array.isArray(shifts)) {
      continue;
    }

    const uniqueShifts = [...new Set(shifts.filter((shift) => VALID_SHIFT_CODES.has(shift)))];
    if (uniqueShifts.length > 0) {
      normalized[weekday] = uniqueShifts;
    }
  }

  return normalized;
}

export function isEmployeeUnavailableForShift(employee, weekday, shiftCode) {
  if ((employee?.unavailableWeekdays ?? []).includes(weekday)) {
    return true;
  }

  const blockedShifts = employee?.unavailableShiftsByWeekday?.[weekday];
  return Array.isArray(blockedShifts) && blockedShifts.includes(shiftCode);
}
