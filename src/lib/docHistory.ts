import { useCallback, useRef, useState } from "react";
import type { MappingDocument } from "./document";

/** How many edits can be undone. */
export const HISTORY_LIMIT = 100;

export interface History<T> {
  present: T;
  past: T[];
  future: T[];
}

export const startHistory = <T,>(present: T): History<T> => ({ present, past: [], future: [] });

/** True when the two documents differ only in their name, so typing a name is one undo step. */
function onlyRenamed(a: MappingDocument, b: MappingDocument): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (key === "name") continue;
    if ((a as unknown as Record<string, unknown>)[key] !== (b as unknown as Record<string, unknown>)[key]) {
      return false;
    }
  }
  return true;
}

/** Records an edit. The old document goes on the undo stack and anything to redo is dropped. */
export function record(history: History<MappingDocument>, next: MappingDocument): History<MappingDocument> {
  if (next === history.present) return history;
  const last = history.past[history.past.length - 1];
  const coalesce =
    history.future.length === 0 &&
    last !== undefined &&
    onlyRenamed(history.present, next) &&
    onlyRenamed(last, history.present) &&
    last.name !== history.present.name;
  const past = coalesce ? history.past : [...history.past, history.present].slice(-HISTORY_LIMIT);
  return { present: next, past, future: [] };
}

export function undo<T>(history: History<T>): History<T> {
  const previous = history.past[history.past.length - 1];
  if (previous === undefined) return history;
  return { present: previous, past: history.past.slice(0, -1), future: [history.present, ...history.future] };
}

export function redo<T>(history: History<T>): History<T> {
  const [next, ...rest] = history.future;
  if (next === undefined) return history;
  return { present: next, past: [...history.past, history.present], future: rest };
}

export interface DocHistoryControls {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/** The deck being edited, with Undo and Redo of every change made to it. */
export function useDocHistory(
  initial: () => MappingDocument,
): [MappingDocument, (next: MappingDocument | ((current: MappingDocument) => MappingDocument)) => void, DocHistoryControls] {
  const [history, setHistory] = useState(() => startHistory(initial()));
  const apply = useRef(setHistory);
  apply.current = setHistory;
  const setDoc = useCallback(
    (next: MappingDocument | ((current: MappingDocument) => MappingDocument)) =>
      apply.current((current) =>
        record(current, typeof next === "function" ? next(current.present) : next),
      ),
    [],
  );
  const controls: DocHistoryControls = {
    undo: () => setHistory(undo),
    redo: () => setHistory(redo),
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
  return [history.present, setDoc, controls];
}
