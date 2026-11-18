import { observedCards } from "./analysisContext";
import { deckViolations, type Banlist, type Format } from "./banlist";
import { withDerivedLabels } from "./derivedLabels";
import { addCard, analysisContextOf, removeCard, sectionSize, setQuantity, type MappingDocument } from "./document";
import { analyzeVersus, type VersusScenario } from "./handtrapVersus";

export type TuningChange =
  | { kind: "cut"; cut: number }
  | { kind: "add"; add: number }
  | { kind: "swap"; cut: number; add: number };

export function applyTuning(doc: MappingDocument, change: TuningChange): MappingDocument {
  let next = doc;
  if ("cut" in change) {
    const copies = doc.main.find((card) => card.card_id === change.cut)?.quantity ?? 0;
    next = copies > 1
      ? setQuantity(doc, "main", change.cut, copies - 1)
      : removeCard(doc, "main", change.cut);
  }
  if ("add" in change) {
    const source = next.main.find((card) => card.card_id === change.add)
      ?? next.side.find((card) => card.card_id === change.add);
    next = source
      ? addCard(next, "main", { ...source, quantity: 1 })
      : setQuantity(next, "main", change.add, 1);
  }
  return next;
}

/** Each addition multiplies the swap search, so the shortlist is bounded. */
export const MAX_ADDITIONS = 10;

export interface TuningRequest {
  doc: MappingDocument;
  goalId: string;
  scenarios: VersusScenario[];
  cuts: number[];
  additions: number[];
  banlist: Banlist;
  format: Format;
}

interface Odds {
  uninterrupted: number;
  survival: number[];
}

export type TuningResult = { error: string } | {
  baseline: Odds;
  candidates: { change: TuningChange; size: number; odds: Odds }[];
};

export function tuneDeck({ doc, goalId, scenarios, cuts, additions, banlist, format }: TuningRequest): TuningResult {
  const goals = doc.hand_condition_sets.filter((goal) => goal.id === goalId);
  const goal = goals[0];
  if (!goal) return { error: "Choose a Hand Goal." };
  if (new Set(additions).size > MAX_ADDITIONS) {
    return { error: `Shortlist at most ${MAX_ADDITIONS} additions.` };
  }
  const sample = observedCards(analysisContextOf(doc), doc.analysis.opening_hand_size);
  const oddsFor = (deck: MappingDocument): Odds | null => {
    const result = analyzeVersus({ ...withDerivedLabels(deck), hand_condition_sets: goals }, scenarios);
    if ("error" in result || !result.baseline[0]) return null;
    return {
      uninterrupted: result.baseline[0].probability,
      survival: result.scenarios.map(({ goals: [entry] }) => entry?.probability ?? 0),
    };
  };
  const baseline = oddsFor(doc);
  if (!baseline) return { error: "The current deck cannot be evaluated for this Hand Goal." };
  if (sectionSize(doc.extra) > 15 || sectionSize(doc.side) > 15) {
    return { error: "Deck Tuning requires at most 15 cards each in Extra and Side." };
  }

  // A change is rejected only if it makes a card exceed its limit further than the
  // current deck already does, so an existing violation does not hide every candidate.
  const existing = new Map(deckViolations(doc, banlist, format).map((entry) => [entry.card_id, entry.copies]));
  const worsens = (deck: MappingDocument) =>
    deckViolations(deck, banlist, format).some((entry) => entry.copies > (existing.get(entry.card_id) ?? 0));

  const changes: TuningChange[] = [];
  for (const cut of new Set(cuts)) {
    if (!doc.main.some((card) => card.card_id === cut)) continue;
    changes.push({ kind: "cut", cut });
    for (const add of new Set(additions)) {
      if (add !== cut) changes.push({ kind: "swap", cut, add });
    }
  }
  for (const add of new Set(additions)) changes.push({ kind: "add", add });

  const candidates: Extract<TuningResult, { baseline: Odds }>["candidates"] = [];
  for (const change of changes) {
    const deck = applyTuning(doc, change);
    const size = sectionSize(deck.main);
    if (size < Math.max(40, sample) || size > 60 || worsens(deck)) continue;
    const odds = oddsFor(deck);
    if (odds) candidates.push({ change, size, odds });
  }
  const score = (odds: Odds) => odds.survival.length ? Math.min(...odds.survival) : odds.uninterrupted;
  candidates.sort((a, b) => score(b.odds) - score(a.odds) || b.odds.uninterrupted - a.odds.uninterrupted);
  return { baseline, candidates };
}
