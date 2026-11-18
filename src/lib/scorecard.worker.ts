import type { MappingDocument } from "./document";
import { scorecard, type ScorecardResult, type ScorecardSettings } from "./scorecard";

/**
 * The Scorecard calculation, run off the page's main thread so a deck with many routes does not
 * freeze the page while it works. It answers one request, then the page ends the worker.
 */
export interface ScorecardRequest {
  doc: MappingDocument;
  goalId: string | null;
  settings: ScorecardSettings;
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ScorecardRequest>) => void) | null;
  postMessage: (message: ScorecardResult) => void;
};

scope.onmessage = (event) => {
  const { doc, goalId, settings } = event.data;
  let result: ScorecardResult;
  try {
    result = scorecard(doc, goalId, settings);
  } catch (caught) {
    result = { error: caught instanceof Error ? caught.message : "The Scorecard could not be calculated." };
  }
  scope.postMessage(result);
};
