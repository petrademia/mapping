import type { MappingCard } from "./document";
import { computeCardImpact, type CardImpact } from "./cardImpact";
import type { GroupMembership, HandConditionLike, HandConditionSetLike } from "./handExplorer";
import { reply, type WorkerReply } from "./workerReply";

/**
 * Card Impact for one Hand Goal, run off the page's main thread: it is a pass over every hand
 * for each card, which takes long enough to make the page stutter on every edit.
 */
export interface CardImpactRequest {
  deck: MappingCard[];
  sample: number;
  conditions: HandConditionLike[];
  set: HandConditionSetLike;
  groups: GroupMembership;
}

export function runCardImpact(request: CardImpactRequest): CardImpact {
  return computeCardImpact(request.deck, request.sample, request.conditions, request.set, request.groups);
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<CardImpactRequest>) => void) | null;
  postMessage: (message: WorkerReply<CardImpact>) => void;
};

scope.onmessage = (event) => scope.postMessage(reply(runCardImpact, event.data));
