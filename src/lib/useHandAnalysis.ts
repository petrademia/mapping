import type { HandEventAnalysis } from "./handExplorer";
import { computeHandAnalysis, type HandAnalysisRequest } from "./handAnalysis.worker";
import { createWorkerHook } from "./useWorkerResult";

const useResult = createWorkerHook<HandAnalysisRequest, HandEventAnalysis>(
  () => new Worker(new URL("./handAnalysis.worker.ts", import.meta.url), { type: "module" }),
  computeHandAnalysis,
);

export interface HandAnalysisState {
  /** The latest odds worked out. While a newer calculation runs this is the previous one. */
  analysis: HandEventAnalysis | undefined;
  /** True while the odds on screen are for an earlier version of the deck. */
  pending: boolean;
  /** Set when the odds cannot be worked out for these sizes. */
  error?: string;
}

/**
 * The exact odds of the Hand Conditions and Hand Goals, worked out in a Web Worker so the page
 * stays responsive. `key` must change whenever `request` changes in a way that changes the odds.
 */
export function useHandAnalysis(key: string, request: HandAnalysisRequest | null): HandAnalysisState {
  const { result, pending, error } = useResult(key, request);
  return { analysis: result, pending, error };
}
