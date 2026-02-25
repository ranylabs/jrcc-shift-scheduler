import { useMemo } from 'react';
import { CELL_CYCLE, ROLE, SHIFT_CODES } from '../engine/constants';
import { normalizeCellText } from '../engine/textNormalize';
import { getCurrentMonthKey, getMonthMeta } from '../engine/dateUtils';
import { generateSchedule } from '../engine/generator';
import { useHistoryReducer } from './historyState';

const DEFAULT_NAMES = ['נועה', 'עמית', 'ליאור', 'מאיה', 'דניאל', 'גל', 'יעל', 'עומר', 'רוני', 'עדי', 'שי', 'ניב'];

export function createInitialState(monthKey = getCurrentMonthKey()) {
  const employees = DEFAULT_NAMES.map((name, index) => ({
    id: `default-${index + 1}`,
    name,
    targetShifts: 8,
    maxNightShifts: 6,
    maxMorningShifts: 6,
    unavailableWeekdays: [],
    role: index < 4 ? ROLE.RESPONSIBLE : ROLE.OPERATOR
  }));

  const schedule = createEmptySchedule(monthKey, employees);

  return {
    monthKey,
    employees,
    schedule,
    scheduleMeta: {}
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
        scheduleMeta: {}
      };
    }

    case 'SET_EMPLOYEES': {
      const employees = (action.payload ?? []).map(normalizeEmployee);
      return {
        ...state,
        employees,
        schedule: sanitizeLoadedSchedule(state.monthKey, state.schedule, employees),
        scheduleMeta: sanitizeScheduleMeta(state.monthKey, state.scheduleMeta, employees)
      };
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
      return { ...state, schedule: nextSchedule, scheduleMeta: nextMeta };
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
      return { ...state, schedule: nextSchedule, scheduleMeta: nextMeta };
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

      return { ...state, employees, schedule, scheduleMeta };
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

      return {
        ...state,
        schedule: sanitizeLoadedSchedule(state.monthKey, normalized.schedule, state.employees),
        scheduleMeta: sanitizeScheduleMeta(state.monthKey, normalized.scheduleMeta, state.employees)
      };
    }

    default:
      return state;
  }
}

export function useScheduleStore() {
  const { state, dispatch, canUndo, canRedo } = useHistoryReducer(
    scheduleReducer,
    createInitialState()
  );

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
    unavailableWeekdays: Array.isArray(employee.unavailableWeekdays) ? employee.unavailableWeekdays : []
  };
}
