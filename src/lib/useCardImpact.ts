import type { CardImpact } from "./cardImpact";
import { runCardImpact, type CardImpactRequest } from "./cardImpact.worker";
import { createWorkerHook } from "./useWorkerResult";

/**
 * Card Impact for a Hand Goal, worked out in a Web Worker. `key` must change whenever the
 * request changes in a way that changes the result. While a new result is on its way the
 * previous one stays and `pending` is true.
 */
export const useCardImpact = createWorkerHook<CardImpactRequest, CardImpact>(
  () => new Worker(new URL("./cardImpact.worker.ts", import.meta.url), { type: "module" }),
  runCardImpact,
);
