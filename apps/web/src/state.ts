import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CabinClass, FareProduct, Segment } from '@rtw/shared';

export interface PlannerState {
  product: FareProduct;
  cabin: CabinClass;
  /** Origin airport chosen before any segments exist. */
  origin: string | null;
  segments: Segment[];
}

export const INITIAL_STATE: PlannerState = {
  product: 'explorer',
  cabin: 'economy',
  origin: null,
  segments: [],
};

function encodeHash(s: PlannerState): string {
  const payload = JSON.stringify(s);
  return btoa(unescape(encodeURIComponent(payload)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function decodeHash(hash: string): PlannerState | null {
  try {
    const b64 = hash.replace(/-/g, '+').replace(/_/g, '/');
    const s = JSON.parse(decodeURIComponent(escape(atob(b64))));
    if (!s || typeof s !== 'object' || !Array.isArray(s.segments)) return null;
    return { ...INITIAL_STATE, ...s };
  } catch {
    return null;
  }
}

/** Planner state with undo/redo and URL-hash persistence (shareable links). */
export function usePlannerState() {
  const [state, setStateRaw] = useState<PlannerState>(() => {
    const fromHash = window.location.hash.slice(1);
    return (fromHash && decodeHash(fromHash)) || INITIAL_STATE;
  });
  const undoStack = useRef<PlannerState[]>([]);
  const redoStack = useRef<PlannerState[]>([]);
  const [, bump] = useState(0);

  const setState = useCallback((next: PlannerState | ((prev: PlannerState) => PlannerState)) => {
    setStateRaw((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      undoStack.current.push(prev);
      if (undoStack.current.length > 200) undoStack.current.shift();
      redoStack.current = [];
      return value;
    });
  }, []);

  const undo = useCallback(() => {
    setStateRaw((prev) => {
      const last = undoStack.current.pop();
      if (!last) return prev;
      redoStack.current.push(prev);
      bump((n) => n + 1);
      return last;
    });
  }, []);

  const redo = useCallback(() => {
    setStateRaw((prev) => {
      const next = redoStack.current.pop();
      if (!next) return prev;
      undoStack.current.push(prev);
      bump((n) => n + 1);
      return next;
    });
  }, []);

  useEffect(() => {
    const empty = !state.origin && state.segments.length === 0;
    const hash = empty ? '' : `#${encodeHash(state)}`;
    if (window.location.hash !== hash) {
      history.replaceState(null, '', hash || window.location.pathname);
    }
  }, [state]);

  const canUndo = undoStack.current.length > 0;
  const canRedo = redoStack.current.length > 0;

  return useMemo(
    () => ({ state, setState, undo, redo, canUndo, canRedo }),
    [state, setState, undo, redo, canUndo, canRedo],
  );
}

/** Current end of the itinerary (where the next segment departs from). */
export function currentPoint(state: PlannerState): string | null {
  if (state.segments.length > 0) return state.segments[state.segments.length - 1].to;
  return state.origin;
}
