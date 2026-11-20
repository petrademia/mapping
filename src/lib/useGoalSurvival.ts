import { computeGoalSurvival, type GoalSurvivalRequest, type GoalSurvivalResult } from "./goalSurvival";
import { createWorkerHook } from "./useWorkerResult";

/**
 * How many interruptions each Hand Goal can take for one turn order, worked out in a Web Worker.
 * `key` must change whenever the request changes in a way that changes the figures. While new
 * ones are on their way the previous ones stay and `pending` is true.
 */
export const useGoalSurvival = createWorkerHook<GoalSurvivalRequest, GoalSurvivalResult>(
  () => new Worker(new URL("./goalSurvival.worker.ts", import.meta.url), { type: "module" }),
  computeGoalSurvival,
  6,
);
