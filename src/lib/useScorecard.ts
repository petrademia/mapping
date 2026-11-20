import { useEffect, useMemo, useRef, useState } from "react";
import type { MappingDocument } from "./document";
import { scorecard, type ScorecardResult, type ScorecardSettings } from "./scorecard";
import type { ScorecardRequest } from "./scorecard.worker";

/** Results already worked out, by deck content and settings, so returning to a tab shows them at once. */
const finished = new Map<string, ScorecardResult>();
const KEEP = 24;

function remember(key: string, result: ScorecardResult): void {
  finished.delete(key);
  finished.set(key, result);
  while (finished.size > KEEP) finished.delete(finished.keys().next().value as string);
}

const keyOf = (goalId: string | null, settings: ScorecardSettings): string =>
  `${goalId ?? ""}|${JSON.stringify(settings)}`;

/**
 * What the Scorecard depends on in a deck: everything except the name, with the cards in a fixed
 * order. Renaming the deck or moving a card around does not change the Scorecard, so it must not
 * start the calculation again.
 */
export function contentKey(doc: MappingDocument): string {
  const byId = <T extends { card_id: number }>(cards: readonly T[]): T[] =>
    [...cards].sort((a, b) => a.card_id - b.card_id);
  // The list of Post-Side configurations and which one is open do not change what is scored: the
  // cards of the open list are already in main/extra/side. Adding a Post-Side or switching to one with
  // the same cards must not count everything again.
  const { configurations: _configurations, active_configuration_id: _active, ...scored } = doc;
  return JSON.stringify({ ...scored, name: "", main: byId(doc.main), extra: byId(doc.extra), side: byId(doc.side) });
}

/** Wait this long after the last change before starting, so a burst of edits is one calculation. */
const SETTLE_MS = 150;

export interface ScorecardState {
  /** The Scorecard, or null when none has been worked out yet for these settings. */
  result: ScorecardResult | null;
  /** True while the result shown is for an earlier version of the deck and a new one is on its way. */
  pending: boolean;
}

/**
 * The Scorecard for a deck, worked out in a Web Worker so the page stays responsive. It starts
 * over, dropping the old work, when the deck's content or the settings change. While the new
 * result is on its way the previous one stays (so the panels do not collapse and jump) and
 * `pending` is true; it is null only when nothing has been worked out yet for these settings.
 * With `enabled` false nothing is calculated.
 */
export function useScorecardState(
  doc: MappingDocument,
  goalId: string | null,
  settings: ScorecardSettings,
  enabled = true,
): ScorecardState {
  const settingsKey = keyOf(goalId, settings);
  const content = useMemo(() => contentKey(doc), [doc]);
  const key = `${settingsKey}#${content}`;
  const docRef = useRef(doc);
  docRef.current = doc;
  const [arrived, setArrived] = useState<{ key: string; result: ScorecardResult } | null>(null);
  const lastGood = useRef<{ settingsKey: string; result: ScorecardResult } | null>(null);

  useEffect(() => {
    if (!enabled || finished.has(key)) return;
    const current = docRef.current;
    let worker: Worker | null = null;
    const done = (result: ScorecardResult) => {
      remember(key, result);
      setArrived({ key, result });
    };
    const timer = setTimeout(() => {
      if (typeof Worker === "undefined") {
        done(scorecard(current, goalId, settings));
        return;
      }
      try {
        worker = new Worker(new URL("./scorecard.worker.ts", import.meta.url), { type: "module" });
        worker.onmessage = (event: MessageEvent<ScorecardResult>) => {
          worker?.terminate();
          done(event.data);
        };
        worker.onerror = () => {
          worker?.terminate();
          // The worker could not start: work it out here instead.
          done(scorecard(current, goalId, settings));
        };
        const request: ScorecardRequest = { doc: current, goalId, settings };
        worker.postMessage(request);
      } catch {
        done(scorecard(current, goalId, settings));
      }
    }, SETTLE_MS);
    return () => {
      clearTimeout(timer);
      worker?.terminate();
    };
    // `settings` is covered by `settingsKey`, the deck by `content`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  if (!enabled) return { result: null, pending: false };
  const ready = finished.get(key) ?? (arrived && arrived.key === key ? arrived.result : undefined);
  if (ready) {
    lastGood.current = { settingsKey, result: ready };
    return { result: ready, pending: false };
  }
  // Keep showing the last result for the same goal and settings while the new one is counted.
  if (lastGood.current && lastGood.current.settingsKey === settingsKey) {
    return { result: lastGood.current.result, pending: true };
  }
  return { result: null, pending: true };
}

/** Like `useScorecardState`, for callers that only need the result. */
export function useScorecard(
  doc: MappingDocument,
  goalId: string | null,
  settings: ScorecardSettings,
  enabled = true,
): ScorecardResult | null {
  return useScorecardState(doc, goalId, settings, enabled).result;
}
