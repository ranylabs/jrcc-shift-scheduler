import { SHIFT_CODES, ROLE } from './constants';
import { getMonthMeta } from './dateUtils';

export function validateSchedule({ monthKey, employees, schedule, scheduleMeta }) {
  const month = getMonthMeta(monthKey);
  const dayIssues = {};
  const employeeIssues = {};
  const statsByEmployee = {};

  for (const employee of employees) {
    statsByEmployee[employee.id] = { morning: 0, night: 0, total: 0 };
    employeeIssues[employee.id] = [];
  }

  for (const day of month.days) {
    const dayCells = schedule[day.dayNumber] ?? {};
    const morningWorkers = [];
    const nightWorkers = [];

    for (const employee of employees) {
      const cell = getCellValue(dayCells[employee.id]);
      if (cell === SHIFT_CODES.MORNING) {
        morningWorkers.push(employee);
        statsByEmployee[employee.id].morning += 1;
        statsByEmployee[employee.id].total += 1;
      }
      if (cell === SHIFT_CODES.NIGHT) {
        nightWorkers.push(employee);
        statsByEmployee[employee.id].night += 1;
        statsByEmployee[employee.id].total += 1;
      }

      const unavailable = employee.unavailableWeekdays ?? [];
      if (
        (cell === SHIFT_CODES.MORNING || cell === SHIFT_CODES.NIGHT) &&
        unavailable.includes(day.weekday)
      ) {
        dayIssues[day.dayNumber] = dayIssues[day.dayNumber] ?? [];
        dayIssues[day.dayNumber].push(`${employee.name}: הוקצה ביום חסום`);
      }
    }

    validateShift(dayIssues, day.dayNumber, morningWorkers, 'בוקר');
    validateShift(dayIssues, day.dayNumber, nightWorkers, 'לילה');
  }

  for (const employee of employees) {
    for (let dayNumber = 1; dayNumber <= month.daysInMonth; dayNumber += 1) {
      const currentValue = getScheduleValue(schedule, dayNumber, employee.id);

      if (currentValue !== SHIFT_CODES.MORNING) {
        continue;
      }

      const previousValue = getScheduleValue(schedule, dayNumber - 1, employee.id);
      if (previousValue === SHIFT_CODES.NIGHT) {
        dayIssues[dayNumber] = dayIssues[dayNumber] ?? [];
        dayIssues[dayNumber].push(`${employee.name}: בוקר אחרי לילה אסור`);
      }

      const twoDaysBackValue = getScheduleValue(schedule, dayNumber - 2, employee.id);
      if (previousValue === SHIFT_CODES.MORNING && twoDaysBackValue === SHIFT_CODES.MORNING) {
        const source = getScheduleSource(scheduleMeta, dayNumber, employee.id);
        if (source === 'generated') {
          dayIssues[dayNumber] = dayIssues[dayNumber] ?? [];
          dayIssues[dayNumber].push(`${employee.name}: 3 משמרות בוקר רצופות`);
        }
      }
    }
  }

  for (const employee of employees) {
    const stats = statsByEmployee[employee.id];

    if (stats.morning > employee.maxMorningShifts) {
      employeeIssues[employee.id].push(
        `משמרות בוקר ${stats.morning}/${employee.maxMorningShifts}`
      );
    }

    if (stats.night > employee.maxNightShifts) {
      employeeIssues[employee.id].push(
        `משמרות לילה ${stats.night}/${employee.maxNightShifts}`
      );
    }

    if (stats.total > employee.targetShifts) {
      employeeIssues[employee.id].push(
        `סך משמרות ${stats.total}/${employee.targetShifts}`
      );
    }
  }

  return {
    dayIssues,
    employeeIssues,
    statsByEmployee,
    hasIssues:
      Object.keys(dayIssues).length > 0 ||
      Object.values(employeeIssues).some((issues) => issues.length > 0)
  };
}

function getCellValue(cell) {
  if (cell && typeof cell === 'object') {
    return cell.value ?? SHIFT_CODES.EMPTY;
  }

  return cell ?? SHIFT_CODES.EMPTY;
}

function validateShift(dayIssues, dayNumber, workers, shiftName) {
  if (workers.length !== 2) {
    dayIssues[dayNumber] = dayIssues[dayNumber] ?? [];
    dayIssues[dayNumber].push(`${shiftName}: נדרשים בדיוק 2 עובדים`);
  }

  if (workers.length > 0 && !workers.some((worker) => worker.role === ROLE.RESPONSIBLE)) {
    dayIssues[dayNumber] = dayIssues[dayNumber] ?? [];
    dayIssues[dayNumber].push(`${shiftName}: נדרש לפחות אחראי אחד`);
  }
}

function getScheduleValue(schedule, dayNumber, employeeId) {
  if (dayNumber < 1) {
    return SHIFT_CODES.EMPTY;
  }

  const dayCells = schedule?.[dayNumber] ?? schedule?.[String(dayNumber)] ?? {};
  return getCellValue(dayCells?.[employeeId]);
}

function getScheduleSource(scheduleMeta, dayNumber, employeeId) {
  if (dayNumber < 1) {
    return 'manual';
  }

  const dayMeta = scheduleMeta?.[dayNumber] ?? scheduleMeta?.[String(dayNumber)] ?? {};
  const source = dayMeta?.[employeeId];
  return source === 'generated' ? 'generated' : 'manual';
}
