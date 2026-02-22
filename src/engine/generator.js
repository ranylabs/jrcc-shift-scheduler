import { SHIFT_CODES, ROLE } from './constants';
import { getMonthMeta } from './dateUtils';

export function generateSchedule({ monthKey, employees, schedule, scheduleMeta }) {
  const nextSchedule = structuredClone(schedule);
  const nextScheduleMeta = structuredClone(scheduleMeta ?? {});
  const month = getMonthMeta(monthKey);
  const stats = buildStats(employees, nextSchedule, month.daysInMonth);

  for (const day of month.days) {
    nextSchedule[day.dayNumber] = nextSchedule[day.dayNumber] ?? {};
    nextScheduleMeta[day.dayNumber] = nextScheduleMeta[day.dayNumber] ?? {};

    fillShift({
      employees,
      day,
      dayCells: nextSchedule[day.dayNumber],
      dayMeta: nextScheduleMeta[day.dayNumber],
      shiftCode: SHIFT_CODES.MORNING,
      maxTypeKey: 'maxMorningShifts',
      stats,
      schedule: nextSchedule
    });

    fillShift({
      employees,
      day,
      dayCells: nextSchedule[day.dayNumber],
      dayMeta: nextScheduleMeta[day.dayNumber],
      shiftCode: SHIFT_CODES.NIGHT,
      maxTypeKey: 'maxNightShifts',
      stats,
      schedule: nextSchedule
    });
  }

  return {
    schedule: nextSchedule,
    scheduleMeta: nextScheduleMeta
  };
}

function fillShift({ employees, day, dayCells, dayMeta, shiftCode, maxTypeKey, stats, schedule }) {
  let assigned = employees.filter((employee) => dayCells[employee.id] === shiftCode);

  if (assigned.length >= 2) {
    return;
  }

  while (assigned.length < 2) {
    const needsResponsible = !assigned.some((worker) => worker.role === ROLE.RESPONSIBLE);

    const candidates = employees
      .filter((employee) =>
        isAvailableForShift(employee, day, dayCells, shiftCode, maxTypeKey, stats, schedule)
      )
      .filter((employee) => (needsResponsible ? employee.role === ROLE.RESPONSIBLE : true))
      .sort((a, b) => compareCandidates(a, b, stats, shiftCode));

    const fallbackCandidates =
      candidates.length > 0
        ? candidates
        : employees
            .filter((employee) =>
              isAvailableForShift(
                employee,
                day,
                dayCells,
                shiftCode,
                maxTypeKey,
                stats,
                schedule,
                true
              )
            )
            .sort((a, b) => compareCandidates(a, b, stats, shiftCode));

    const nextWorker = fallbackCandidates[0];
    if (!nextWorker) {
      break;
    }

    dayCells[nextWorker.id] = shiftCode;
    dayMeta[nextWorker.id] = 'generated';
    assigned.push(nextWorker);

    const workerStats = stats[nextWorker.id];
    workerStats.total += 1;
    if (shiftCode === SHIFT_CODES.MORNING) {
      workerStats.morning += 1;
    } else {
      workerStats.night += 1;
    }
  }
}

function isAvailableForShift(
  employee,
  day,
  dayCells,
  shiftCode,
  maxTypeKey,
  stats,
  schedule,
  ignoreSoftLimits = false
) {
  const currentCell = getCellValue(dayCells[employee.id]);
  if (currentCell !== SHIFT_CODES.EMPTY) {
    return false;
  }

  if ((employee.unavailableWeekdays ?? []).includes(day.weekday)) {
    return false;
  }

  const workerStats = stats[employee.id];
  if (!ignoreSoftLimits && workerStats.total >= employee.targetShifts) {
    return false;
  }

  const shiftCount = shiftCode === SHIFT_CODES.MORNING ? workerStats.morning : workerStats.night;
  if (!ignoreSoftLimits && shiftCount >= employee[maxTypeKey]) {
    return false;
  }

  if (shiftCode === SHIFT_CODES.MORNING) {
    const previousDayValue = getScheduleValue(schedule, day.dayNumber - 1, employee.id);
    if (previousDayValue === SHIFT_CODES.NIGHT) {
      return false;
    }

    const previousMorning = getScheduleValue(schedule, day.dayNumber - 1, employee.id);
    const twoDaysBackMorning = getScheduleValue(schedule, day.dayNumber - 2, employee.id);
    if (previousMorning === SHIFT_CODES.MORNING && twoDaysBackMorning === SHIFT_CODES.MORNING) {
      return false;
    }
  }

  return true;
}

function buildStats(employees, schedule, daysInMonth) {
  const stats = {};

  for (const employee of employees) {
    stats[employee.id] = { morning: 0, night: 0, total: 0 };
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const cells = schedule[day] ?? {};

    for (const employee of employees) {
      const value = getCellValue(cells[employee.id]);
      if (value === SHIFT_CODES.MORNING) {
        stats[employee.id].morning += 1;
        stats[employee.id].total += 1;
      }
      if (value === SHIFT_CODES.NIGHT) {
        stats[employee.id].night += 1;
        stats[employee.id].total += 1;
      }
    }
  }

  return stats;
}

function getCellValue(cell) {
  if (cell && typeof cell === 'object') {
    return cell.value ?? SHIFT_CODES.EMPTY;
  }

  return cell ?? SHIFT_CODES.EMPTY;
}

function compareCandidates(a, b, stats, shiftCode) {
  const aStats = stats[a.id];
  const bStats = stats[b.id];

  const aShiftLoad = shiftCode === SHIFT_CODES.MORNING ? aStats.morning : aStats.night;
  const bShiftLoad = shiftCode === SHIFT_CODES.MORNING ? bStats.morning : bStats.night;

  if (aStats.total !== bStats.total) {
    return aStats.total - bStats.total;
  }

  if (aShiftLoad !== bShiftLoad) {
    return aShiftLoad - bShiftLoad;
  }

  return a.name.localeCompare(b.name, 'he');
}

function getScheduleValue(schedule, dayNumber, employeeId) {
  if (dayNumber < 1) {
    return SHIFT_CODES.EMPTY;
  }

  const dayCells = schedule?.[dayNumber] ?? schedule?.[String(dayNumber)] ?? {};
  return getCellValue(dayCells?.[employeeId]);
}
