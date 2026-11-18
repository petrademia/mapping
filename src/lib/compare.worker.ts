import { scoreDeck, type DeckScoreResult } from "./compareDecks";
import type { MappingDocument } from "./document";
import { scorecard, type ScorecardResult } from "./scorecard";
import { reply, type WorkerReply } from "./workerReply";

/**
 * Scores two decks for the Compare tab, run off the page's main thread: each score is an exact
 * count over every hand, which blocks the page for most of a second when done on it.
 */
export interface CompareRequest {
  doc: MappingDocument;
  compared: MappingDocument;
  /** The ranking, best first, that both decks are judged by. */
  ranking: number[] | null;
}

export interface CompareScores {
  a: DeckScoreResult;
  b: DeckScoreResult;
  /** The Scorecard of each deck, for this deck's default Hand Goal (the other deck uses it too when it has it). */
  cardA: ScorecardResult;
  cardB: ScorecardResult;
}

export function computeCompare(request: CompareRequest): CompareScores {
  const cardA = scorecard(request.doc, null);
  return {
    a: scoreDeck(request.doc, request.ranking),
    b: scoreDeck(request.compared, request.ranking),
    cardA,
    cardB: scorecard(request.compared, "goalId" in cardA ? cardA.goalId : null),
  };
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<CompareRequest>) => void) | null;
  postMessage: (message: WorkerReply<CompareScores>) => void;
};

scope.onmessage = (event) => scope.postMessage(reply(computeCompare, event.data));
