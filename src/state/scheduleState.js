import { useMemo } from 'react';
import { CELL_CYCLE, ROLE, SHIFT_CODES } from '../engine/constants';
import { normalizeCellText } from '../engine/textNormalize';
import { normalizeUnavailableShiftsByWeekday } from '../engine/employeeAvailability';
import { getCurrentMonthKey, getMonthMeta } from '../engine/dateUtils';
import { generateSchedule } from '../engine/generator';
import { useHistoryReducer } from './historyState';

const DEFAULT_NAMES = ['נועה', 'עמית', 'ליאור', 'מאיה', 'דניאל', 'גל', 'יעל', 'עומר', 'רוני', 'עדי', 'שי', 'ניב'];
const HISTORY_OPTIONS = { storagePrefix: 'JRCC_SCHEDULE_HISTORY_V1' };
const SCHEDULE_DIRTY_STORAGE_PREFIX = 'JRCC_SCHEDULE_DIRTY_V1';
const scheduleDirtyTokens = new Map();

export function markScheduleDirty(monthKey) {
  if (!monthKey) {
    return '';
  }

  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  scheduleDirtyTokens.set(monthKey, token);
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(`${SCHEDULE_DIRTY_STORAGE_PREFIX}:${monthKey}`, token);
    }
  } catch {
    // Keep the in-memory marker when browser storage is unavailable.
  }
  return token;
}

export function getScheduleDirtyToken(monthKey) {
  if (!monthKey) {
    return '';
  }

  try {
    if (typeof window !== 'undefined') {
      const storedToken = window.localStorage.getItem(`${SCHEDULE_DIRTY_STORAGE_PREFIX}:${monthKey}`);
      if (storedToken) {
        scheduleDirtyTokens.set(monthKey, storedToken);
        return storedToken;
      }
    }
  } catch {
    // Fall back to the in-memory marker.
  }

  return scheduleDirtyTokens.get(monthKey) ?? '';
}

export function clearScheduleDirty(monthKey, expectedToken) {
  if (!monthKey || !expectedToken || getScheduleDirtyToken(monthKey) !== expectedToken) {
    return;
  }

  scheduleDirtyTokens.delete(monthKey);
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(`${SCHEDULE_DIRTY_STORAGE_PREFIX}:${monthKey}`);
    }
  } catch {
    // Keep local history as the recovery source if browser storage is unavailable.
  }
}



export function createInitialState(monthKey = getCurrentMonthKey()) {
  const employees = DEFAULT_NAMES.map((name, index) => ({
    id: `default-${index + 1}`,
    name,
    targetShifts: 8,
    maxNightShifts: 6,
    maxMorningShifts: 6,
    unavailableWeekdays: [],
    unavailableShiftsByWeekday: {},
    role: index < 4 ? ROLE.RESPONSIBLE : ROLE.OPERATOR
  }));

  const schedule = createEmptySchedule(monthKey, employees);

  return {
    monthKey,
    employees,
    schedule,
    scheduleMeta: {},
    dayEvents: {},
    selectedEmployeeId: employees[0]?.id ?? null
  };
}

export function scheduleReducer(state, action) {
  switch (action.type) {
    case 'SET_MONTH': {
      const monthKey = action.payload;
      return {
        ...state,
        monthKey,
        schedule: {},
        scheduleMeta: {},
        dayEvents: {}
      };
    }

    case 'SET_EMPLOYEES': {
      const employees = (action.payload ?? []).map(normalizeEmployee);
      const selectedEmployeeId = employees.some((employee) => employee.id === state.selectedEmployeeId)
        ? state.selectedEmployeeId
        : employees[0]?.id ?? null;
      return {
        ...state,
        employees,
        schedule: sanitizeLoadedSchedule(state.monthKey, state.schedule, employees),
        scheduleMeta: sanitizeScheduleMeta(state.monthKey, state.scheduleMeta, employees),
        selectedEmployeeId
      };
    }

    case 'SET_SELECTED_EMPLOYEE': {
      return {
        ...state,
        selectedEmployeeId: action.payload ?? null
      };
    }

    case 'SET_DAY_EVENTS': {
      const dayEvents = sanitizeDayEvents(state.monthKey, action.payload);
      if (areDayEventsEqual(state.dayEvents, dayEvents)) {
        return state;
      }
      return { ...state, dayEvents };
    }

    case 'SET_CELL': {
      const { dayNumber, employeeId, value } = action.payload;
      const normalizedValue = normalizeCellText(value);
      const nextSchedule = structuredClone(state.schedule);
      const nextMeta = structuredClone(state.scheduleMeta);
      nextSchedule[dayNumber] = nextSchedule[dayNumber] ?? {};
      nextMeta[dayNumber] = nextMeta[dayNumber] ?? {};
      nextSchedule[dayNumber][employeeId] = normalizedValue;
      nextMeta[dayNumber][employeeId] = 'manual';
      return {
        ...state,
        schedule: nextSchedule,
        scheduleMeta: nextMeta,
        selectedEmployeeId: employeeId ?? state.selectedEmployeeId
      };
    }

    case 'CYCLE_CELL': {
      const { dayNumber, employeeId } = action.payload;
      const current = state.schedule?.[dayNumber]?.[employeeId] ?? SHIFT_CODES.EMPTY;
      const next = CELL_CYCLE[(CELL_CYCLE.indexOf(current) + 1) % CELL_CYCLE.length];
      const nextSchedule = structuredClone(state.schedule);
      const nextMeta = structuredClone(state.scheduleMeta);
      nextSchedule[dayNumber] = nextSchedule[dayNumber] ?? {};
      nextMeta[dayNumber] = nextMeta[dayNumber] ?? {};
      nextSchedule[dayNumber][employeeId] = next;
      nextMeta[dayNumber][employeeId] = 'manual';
      return {
        ...state,
        schedule: nextSchedule,
        scheduleMeta: nextMeta,
        selectedEmployeeId: employeeId ?? state.selectedEmployeeId
      };
    }

    case 'ADD_EMPLOYEE': {
      const newEmployee = normalizeEmployee({
        ...action.payload,
        id: action.payload?.id ?? createId()
      });

      const employees = [...state.employees, newEmployee];
      const schedule = structuredClone(state.schedule);
      const scheduleMeta = structuredClone(state.scheduleMeta);
      const monthMeta = getMonthMeta(state.monthKey);

      for (const day of monthMeta.days) {
        schedule[day.dayNumber] = schedule[day.dayNumber] ?? {};
        scheduleMeta[day.dayNumber] = scheduleMeta[day.dayNumber] ?? {};
        schedule[day.dayNumber][newEmployee.id] = SHIFT_CODES.EMPTY;
      }

      return { ...state, employees, schedule, scheduleMeta };
    }

    case 'UPDATE_EMPLOYEE': {
      const { id, updates } = action.payload;
      const employees = state.employees.map((employee) =>
        employee.id === id ? normalizeEmployee({ ...employee, ...updates, id }) : employee
      );
      return { ...state, employees };
    }

    case 'DELETE_EMPLOYEE': {
      const employeeId = action.payload;
      const employees = state.employees.filter((employee) => employee.id !== employeeId);
      const schedule = structuredClone(state.schedule);
      const scheduleMeta = structuredClone(state.scheduleMeta);
      const monthMeta = getMonthMeta(state.monthKey);

      for (const day of monthMeta.days) {
        if (schedule[day.dayNumber]) {
          delete schedule[day.dayNumber][employeeId];
        }
        if (scheduleMeta[day.dayNumber]) {
          delete scheduleMeta[day.dayNumber][employeeId];
        }
      }

      return {
        ...state,
        employees,
        schedule,
        scheduleMeta,
        selectedEmployeeId:
          state.selectedEmployeeId === employeeId ? employees[0]?.id ?? null : state.selectedEmployeeId
      };
    }

    case 'AUTO_FILL':
    case 'GENERATE_SCHEDULE': {
      const generated = generateSchedule(state);
      return {
        ...state,
        schedule: generated.schedule,
        scheduleMeta: generated.scheduleMeta
      };
    }

    case 'CLEAR_GENERATED': {
      const nextSchedule = structuredClone(state.schedule);
      const nextMeta = structuredClone(state.scheduleMeta);
      const monthMeta = getMonthMeta(state.monthKey);

      for (const day of monthMeta.days) {
        const dayMeta = nextMeta[day.dayNumber] ?? {};
        for (const [employeeId, source] of Object.entries(dayMeta)) {
          if (source === 'generated') {
            nextSchedule[day.dayNumber] = nextSchedule[day.dayNumber] ?? {};
            nextSchedule[day.dayNumber][employeeId] = SHIFT_CODES.EMPTY;
            delete nextMeta[day.dayNumber][employeeId];
          }
        }
      }

      return {
        ...state,
        schedule: nextSchedule,
        scheduleMeta: nextMeta
      };
    }

    case 'LOAD_MONTH': {
      const schedulePayload = action.payload?.schedule ?? action.payload ?? {};
      const scheduleMetaPayload = action.payload?.scheduleMeta ?? {};
      const normalized = normalizeLoadedSchedulePayload(schedulePayload, scheduleMetaPayload);
      const nextSchedule = sanitizeLoadedSchedule(state.monthKey, normalized.schedule, state.employees);
      const nextScheduleMeta = sanitizeScheduleMeta(state.monthKey, normalized.scheduleMeta, state.employees);
      const nextDayEvents = sanitizeDayEvents(state.monthKey, action.payload?.dayEvents);

      if (
        areNestedMapsEqual(state.schedule, nextSchedule) &&
        areNestedMapsEqual(state.scheduleMeta, nextScheduleMeta) &&
        areDayEventsEqual(state.dayEvents, nextDayEvents)
      ) {
        return state;
      }

      return {
        ...state,
        schedule: nextSchedule,
        scheduleMeta: nextScheduleMeta,
        dayEvents: nextDayEvents
      };
    }

    default:
      return state;
  }
}

export function useScheduleStore() {
  const { state, dispatch: historyDispatch, canUndo, canRedo } = useHistoryReducer(
    scheduleReducer,
    createInitialState(),
    HISTORY_OPTIONS
  );

  const dispatch = (action) => {
    if (isScheduleMutation(action)) {
      const monthKey =
        action.type === 'REPLACE' || action.type === 'RESET'
          ? action.payload?.monthKey ?? state.monthKey
          : state.monthKey;
      markScheduleDirty(monthKey);
    }
    historyDispatch(action);
  };

  return useMemo(
    () => ({
      state,
      dispatch,
      canUndo,
      canRedo,
      undo: () => dispatch({ type: 'UNDO' }),
      redo: () => dispatch({ type: 'REDO' }),
      replace: (payload) => dispatch({ type: 'REPLACE', payload }),
      reset: (payload) => dispatch({ type: 'RESET', payload })
    }),
    [state, dispatch, canUndo, canRedo]
  );
}

function isScheduleMutation(action) {
  return [
    'ADD_EMPLOYEE',
    'AUTO_FILL',
    'CLEAR_GENERATED',
    'CYCLE_CELL',
    'DELETE_EMPLOYEE',
    'GENERATE_SCHEDULE',
    'REDO',
    'REPLACE',
    'RESET',
    'SET_CELL',
    'SET_DAY_EVENTS',
    'UNDO'
  ].includes(action?.type);
}

function normalizeLoadedSchedulePayload(schedulePayload, scheduleMetaPayload) {
  const schedule = {};
  const scheduleMeta = structuredClone(scheduleMetaPayload ?? {});

  for (const [dayNumber, dayCells] of Object.entries(schedulePayload ?? {})) {
    schedule[dayNumber] = {};

    for (const [employeeId, cell] of Object.entries(dayCells ?? {})) {
      if (cell && typeof cell === 'object') {
        schedule[dayNumber][employeeId] = cell.value ?? SHIFT_CODES.EMPTY;

        if (cell.source) {
          scheduleMeta[dayNumber] = scheduleMeta[dayNumber] ?? {};
          scheduleMeta[dayNumber][employeeId] = cell.source;
        }
      } else {
        schedule[dayNumber][employeeId] = cell ?? SHIFT_CODES.EMPTY;
      }
    }
  }

  return { schedule, scheduleMeta };
}

function sanitizeLoadedSchedule(monthKey, loadedSchedule, employees) {
  const monthMeta = getMonthMeta(monthKey);
  const employeeIds = new Set(employees.map((employee) => employee.id));
  const next = {};

  for (const day of monthMeta.days) {
    const cells = loadedSchedule?.[day.dayNumber] ?? loadedSchedule?.[String(day.dayNumber)] ?? {};
    const dayMap = {};

    for (const [employeeId, value] of Object.entries(cells)) {
      if (employeeIds.has(employeeId)) {
        dayMap[employeeId] = value;
      }
    }

    if (Object.keys(dayMap).length > 0) {
      next[day.dayNumber] = dayMap;
    }
  }

  return next;
}

function sanitizeScheduleMeta(monthKey, loadedMeta, employees) {
  const monthMeta = getMonthMeta(monthKey);
  const employeeIds = new Set(employees.map((employee) => employee.id));
  const next = {};

  for (const day of monthMeta.days) {
    const cells = loadedMeta?.[day.dayNumber] ?? loadedMeta?.[String(day.dayNumber)] ?? {};
    const dayMap = {};

    for (const [employeeId, source] of Object.entries(cells)) {
      if (employeeIds.has(employeeId) && (source === 'manual' || source === 'generated')) {
        dayMap[employeeId] = source;
      }
    }

    if (Object.keys(dayMap).length > 0) {
      next[day.dayNumber] = dayMap;
    }
  }

  return next;
}

function sanitizeDayEvents(monthKey, loadedEvents) {
  const { days } = getMonthMeta(monthKey);
  const next = {};

  for (const { dayNumber } of days) {
    const event = loadedEvents?.[dayNumber] ?? loadedEvents?.[String(dayNumber)];
    if (!event || typeof event !== 'object') {
      continue;
    }

    const color = /^#[\da-f]{6}$/i.test(String(event.color ?? '')) ? event.color : '#fff2cc';
    next[dayNumber] = {
      label: String(event.label ?? '').trim().slice(0, 40),
      symbol: String(event.symbol ?? '').trim().slice(0, 2),
      color
    };
  }

  return next;
}

function areDayEventsEqual(left, right) {
  const leftKeys = Object.keys(left ?? {});
  const rightKeys = Object.keys(right ?? {});
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => JSON.stringify(left[key]) === JSON.stringify(right[key]))
  );
}

function createEmptySchedule(monthKey, employees) {
  const monthMeta = getMonthMeta(monthKey);
  const schedule = {};

  for (const day of monthMeta.days) {
    schedule[day.dayNumber] = {};
    for (const employee of employees) {
      schedule[day.dayNumber][employee.id] = SHIFT_CODES.EMPTY;
    }
  }

  return schedule;
}

function createId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 11);
}

function normalizeEmployee(employee) {
  return {
    ...employee,
    id: employee.id,
    name: employee.name ?? '',
    role: employee.role === ROLE.RESPONSIBLE ? ROLE.RESPONSIBLE : ROLE.OPERATOR,
    targetShifts: Number(employee.targetShifts ?? employee.monthlyTargetShifts ?? 8),
    maxNightShifts: Number(employee.maxNightShifts ?? 6),
    maxMorningShifts: Number(employee.maxMorningShifts ?? employee.maxDayShifts ?? 6),
    unavailableWeekdays: Array.isArray(employee.unavailableWeekdays) ? employee.unavailableWeekdays : [],
    unavailableShiftsByWeekday: normalizeUnavailableShiftsByWeekday(employee.unavailableShiftsByWeekday)
  };
}

function areNestedMapsEqual(left, right) {
  const leftKeys = Object.keys(left ?? {});
  const rightKeys = Object.keys(right ?? {});

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  for (const key of leftKeys) {
    const leftValue = left?.[key] ?? {};
    const rightValue = right?.[key] ?? {};
    const leftChildKeys = Object.keys(leftValue);
    const rightChildKeys = Object.keys(rightValue);

    if (leftChildKeys.length !== rightChildKeys.length) {
      return false;
    }

    for (const childKey of leftChildKeys) {
      if (leftValue[childKey] !== rightValue[childKey]) {
        return false;
      }
    }
  }

  return true;
}
