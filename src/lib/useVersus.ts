import type { VersusOutcome } from "./handtrapVersus";
import { computeVersus, type VersusRequest } from "./handtrapVersus.worker";
import { createWorkerHook } from "./useWorkerResult";

/**
 * How each Hand Goal holds up against the handtraps and pairs, worked out in a Web Worker. `key`
 * must change whenever the request changes in a way that changes the result. While a new result
 * is on its way the previous one stays and `pending` is true.
 */
export const useVersus = createWorkerHook<VersusRequest, VersusOutcome>(
  () => new Worker(new URL("./handtrapVersus.worker.ts", import.meta.url), { type: "module" }),
  computeVersus,
  8,
);
