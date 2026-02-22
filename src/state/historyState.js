import { useMemo, useState } from 'react';

export function useHistoryReducer(reducer, initialPresent) {
  const [history, setHistory] = useState({
    past: [],
    present: initialPresent,
    future: []
  });

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
        return {
          past: [],
          present: next,
          future: []
        };
      }

      if (action?.type === 'SET_EMPLOYEES') {
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
