import { useEffect, useMemo, useState } from 'react';

const HISTORY_STORAGE_PREFIX = 'JRCC_HISTORY_V1';

export function useHistoryReducer(reducer, initialPresent, options = {}) {
  const [history, setHistory] = useState(() => loadInitialHistory(initialPresent, options));

  const dispatch = (action) => {
    if (action?.type === 'UNDO') {
      setHistory((current) => {
        if (current.past.length === 0) {
          return current;
        }

        const previous = current.past[current.past.length - 1];
        return {
          past: current.past.slice(0, -1),
          present: previous,
          future: [current.present, ...current.future]
        };
      });
      return;
    }

    if (action?.type === 'REDO') {
      setHistory((current) => {
        if (current.future.length === 0) {
          return current;
        }

        const [next, ...rest] = current.future;
        return {
          past: [...current.past, current.present],
          present: next,
          future: rest
        };
      });
      return;
    }

    if (action?.type === 'REPLACE') {
      setHistory((current) => ({
        past: [...current.past, current.present],
        present: action.payload,
        future: []
      }));
      return;
    }

    if (action?.type === 'RESET') {
      setHistory({
        past: [],
        present: action.payload,
        future: []
      });
      return;
    }

    setHistory((current) => {
      const next = reducer(current.present, action);
      if (next === current.present) {
        return current;
      }

      if (action?.type === 'SET_MONTH') {
        const restored = loadStoredHistory(buildStorageKey(options, next?.monthKey));
        if (restored) {
          return restored;
        }

        return {
          past: [],
          present: next,
          future: []
        };
      }

      if (action?.type === 'SET_EMPLOYEES') {
        return {
          past: current.past.map((entry) => reducer(entry, action)),
          present: next,
          future: current.future.map((entry) => reducer(entry, action))
        };
      }

      if (action?.type === 'LOAD_MONTH') {
        return {
          past: current.past,
          present: next,
          future: current.future
        };
      }

      return {
        past: [...current.past, current.present],
        present: next,
        future: []
      };
    });
  };

  useEffect(() => {
    const storageKey = buildStorageKey(options, history.present?.monthKey);
    if (!storageKey) {
      return;
    }

    persistHistory(storageKey, history);
  }, [history, options]);

  return useMemo(
    () => ({
      state: history.present,
      dispatch,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0
    }),
    [history]
  );
}

function loadInitialHistory(initialPresent, options) {
  const restored = loadStoredHistory(buildStorageKey(options, initialPresent?.monthKey));
  if (restored) {
    return restored;
  }

  return {
    past: [],
    present: initialPresent,
    future: []
  };
}

function buildStorageKey(options, monthKey) {
  if (!monthKey) {
    return '';
  }

  const prefix = options.storagePrefix ?? HISTORY_STORAGE_PREFIX;
  return `${prefix}:${monthKey}`;
}

function loadStoredHistory(storageKey) {
  if (!storageKey || typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!isValidHistoryShape(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function persistHistory(storageKey, history) {
  if (!storageKey || typeof window === 'undefined') {
    return;
  }

  let nextHistory = history;

  while (true) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(nextHistory));
      return;
    } catch {
      const trimmed = trimHistoryForStorage(nextHistory);
      if (!trimmed) {
        return;
      }
      nextHistory = trimmed;
    }
  }
}

function trimHistoryForStorage(history) {
  const past = history.past ?? [];
  const future = history.future ?? [];

  if (past.length === 0 && future.length === 0) {
    return null;
  }

  const pastTrimCount = Math.max(1, Math.ceil(past.length * 0.1));
  const futureTrimCount = Math.max(1, Math.ceil(future.length * 0.1));

  return {
    past: past.length > 0 ? past.slice(pastTrimCount) : past,
    present: history.present,
    future: future.length > 0 ? future.slice(0, Math.max(0, future.length - futureTrimCount)) : future
  };
}

function isValidHistoryShape(value) {
  return (
    value &&
    typeof value === 'object' &&
    Array.isArray(value.past) &&
    'present' in value &&
    Array.isArray(value.future)
  );
}
