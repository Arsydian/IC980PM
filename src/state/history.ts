export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  /** Consecutive edits with the same key (e.g. typing in one cell) merge into one undo step. */
  lastKey?: string;
  lastAt?: number;
}

export type HistoryAction<T> =
  | { type: 'set'; value: T; coalesceKey?: string }
  | { type: 'update'; fn: (value: T) => T; coalesceKey?: string }
  | { type: 'reset'; value: T }
  | { type: 'undo' }
  | { type: 'redo' };

const LIMIT = 200;
const COALESCE_MS = 1500;

export function createHistory<T>(value: T): History<T> {
  return { past: [], present: value, future: [] };
}

export function historyReducer<T>(state: History<T>, action: HistoryAction<T>): History<T> {
  switch (action.type) {
    case 'update':
      return historyReducer(state, { type: 'set', value: action.fn(state.present), coalesceKey: action.coalesceKey });
    case 'set': {
      if (action.value === state.present) return state;
      const now = Date.now();
      const merge = action.coalesceKey !== undefined && action.coalesceKey === state.lastKey && now - (state.lastAt ?? 0) < COALESCE_MS;
      return {
        past: merge ? state.past : [...state.past, state.present].slice(-LIMIT),
        present: action.value,
        future: [],
        lastKey: action.coalesceKey,
        lastAt: now
      };
    }
    case 'reset':
      return createHistory(action.value);
    case 'undo': {
      if (state.past.length === 0) return state;
      return {
        past: state.past.slice(0, -1),
        present: state.past[state.past.length - 1],
        future: [state.present, ...state.future]
      };
    }
    case 'redo': {
      if (state.future.length === 0) return state;
      return {
        past: [...state.past, state.present],
        present: state.future[0],
        future: state.future.slice(1)
      };
    }
  }
}
