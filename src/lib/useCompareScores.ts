import { computeCompare, type CompareRequest, type CompareScores } from "./compare.worker";
import { createWorkerHook } from "./useWorkerResult";

/**
 * The scores of the two decks on the Compare tab, worked out in a Web Worker. `key` must change
 * whenever the request changes in a way that changes the scores. While new scores are on their
 * way the previous ones stay and `pending` is true.
 */
export const useCompareScores = createWorkerHook<CompareRequest, CompareScores>(
  () => new Worker(new URL("./compare.worker.ts", import.meta.url), { type: "module" }),
  computeCompare,
  6,
);
