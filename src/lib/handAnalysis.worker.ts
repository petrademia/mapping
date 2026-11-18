import type { MappingCard } from "./document";
import {
  analyzeHandConditions,
  type GroupMembership,
  type HandConditionLike,
  type HandConditionSetLike,
  type HandEventAnalysis,
} from "./handExplorer";
import { reply, type WorkerReply } from "./workerReply";

/**
 * The exact odds of every Hand Condition and Hand Goal, run off the page's main thread so an
 * edit does not freeze the page for the half second or so it takes. It answers one request, then
 * the page ends the worker.
 */
export interface HandAnalysisRequest {
  main: MappingCard[];
  sample: number;
  conditions: HandConditionLike[];
  sets: HandConditionSetLike[];
  groups: GroupMembership;
  turnOrder?: "going_first" | "going_second";
}

export function computeHandAnalysis(request: HandAnalysisRequest): HandEventAnalysis {
  return analyzeHandConditions(
    request.main,
    request.sample,
    request.conditions,
    request.sets,
    request.groups,
    request.turnOrder,
  );
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<HandAnalysisRequest>) => void) | null;
  postMessage: (message: WorkerReply<HandEventAnalysis>) => void;
};

scope.onmessage = (event) => scope.postMessage(reply(computeHandAnalysis, event.data));
