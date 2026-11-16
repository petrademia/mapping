import { useEffect, useState } from "react";
import type { MappingDocument } from "./document";
import { scorecard, type ScorecardResult, type ScorecardSettings } from "./scorecard";
import type { ScorecardRequest } from "./scorecard.worker";

/** Results already worked out, per deck object, so returning to a tab shows them at once. */
const finished = new WeakMap<MappingDocument, Map<string, ScorecardResult>>();

const keyOf = (goalId: string | null, settings: ScorecardSettings): string =>
  `${goalId ?? ""}|${JSON.stringify(settings)}`;

/** Wait this long after the last change before starting, so a burst of edits is one calculation. */
const SETTLE_MS = 150;

/**
 * The Scorecard for a deck, worked out in a Web Worker so the page stays responsive. It is
 * null while that runs, and starts over, dropping the old work, when the deck or the settings
 * change. A result already worked out for the same deck is returned at once. With `enabled`
 * false nothing is calculated.
 */
export function useScorecard(
  doc: MappingDocument,
  goalId: string | null,
  settings: ScorecardSettings,
  enabled = true,
): ScorecardResult | null {
  const key = keyOf(goalId, settings);
  const [arrived, setArrived] = useState<{ doc: MappingDocument; key: string; result: ScorecardResult } | null>(null);

  useEffect(() => {
    if (!enabled || finished.get(doc)?.has(key)) return;
    let worker: Worker | null = null;
    const done = (result: ScorecardResult) => {
      const results = finished.get(doc) ?? new Map<string, ScorecardResult>();
      results.set(key, result);
      finished.set(doc, results);
      setArrived({ doc, key, result });
    };
    const timer = setTimeout(() => {
      if (typeof Worker === "undefined") {
        done(scorecard(doc, goalId, settings));
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
          done(scorecard(doc, goalId, settings));
        };
        const request: ScorecardRequest = { doc, goalId, settings };
        worker.postMessage(request);
      } catch {
        done(scorecard(doc, goalId, settings));
      }
    }, SETTLE_MS);
    return () => {
      clearTimeout(timer);
      worker?.terminate();
    };
    // `settings` is covered by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, goalId, key, enabled]);

  if (!enabled) return null;
  const cached = finished.get(doc)?.get(key);
  if (cached) return cached;
  return arrived && arrived.doc === doc && arrived.key === key ? arrived.result : null;
}
