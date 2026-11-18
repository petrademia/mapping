import type { MappingDocument } from "./document";
import { analyzeVersus, type VersusOutcome } from "./handtrapVersus";
import { reply, type WorkerReply } from "./workerReply";

/**
 * Handtrap versus for the Handtraps tab, run off the page's main thread: it walks every hand
 * once per handtrap and pair, which blocks the page when done on it.
 */
export interface VersusRequest {
  doc: MappingDocument;
}

export function computeVersus(request: VersusRequest): VersusOutcome {
  return analyzeVersus(request.doc);
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<VersusRequest>) => void) | null;
  postMessage: (message: WorkerReply<VersusOutcome>) => void;
};

scope.onmessage = (event) => scope.postMessage(reply(computeVersus, event.data));
