import { observedCards } from "./analysisContext";
import { analysisContextOf, sectionSize, type MappingDocument } from "./document";
import { groupsToMembership } from "./handCondition";
import {
  compressDeck,
  forEachHandComposition,
  handConditionHolds,
  type HandConditionLike,
} from "./handExplorer";
import { pairLabel } from "./handtrap";
import { combinations, ratioToNumber } from "./probability";

/**
 * Handtrap versus: how often each Hand Goal still holds when the opponent
 * holds a handtrap, or two. A handtrap negates one copy of a card in your hand
 * that it can stop (the cards you picked for it). The opponent always chooses
 * the card that hurts your goal most, or does nothing if that is better for
 * them, so every number is the worst case, exact over every possible hand.
 */
export interface VersusScenario {
  id: string;
  label: string;
  /** Handtraps in play; the same id twice means two copies. */
  handtrapIds: string[];
}

export interface GoalSurvival {
  setId: string;
  name: string;
  /** Hands where the goal holds and survives the scenario. */
  weight: bigint;
  probability: number;
}

export interface ScenarioResult {
  scenario: VersusScenario;
  goals: GoalSurvival[];
}

export interface VersusAnalysis {
  /** Number of possible hands. */
  total: bigint;
  /** Cards drawn (5, or 6 going second on the first turn). */
  sample: number;
  /** The goals with no handtrap in play. */
  baseline: GoalSurvival[];
  scenarios: ScenarioResult[];
}

export type VersusOutcome = VersusAnalysis | { error: string };

/** Every handtrap alone, then every saved pair. */
export function scenariosFor(doc: MappingDocument): VersusScenario[] {
  return [
    ...doc.handtraps.map((handtrap) => ({
      id: handtrap.id,
      label: handtrap.name,
      handtrapIds: [handtrap.id],
    })),
    ...doc.handtrap_pairs.map((pair) => ({
      id: pair.id,
      label: pairLabel(pair, doc.handtraps),
      handtrapIds: [...pair.handtrap_ids],
    })),
  ];
}

export function analyzeVersus(
  doc: MappingDocument,
  scenarios: readonly VersusScenario[] = scenariosFor(doc),
): VersusOutcome {
  const context = analysisContextOf(doc);
  const sample = observedCards(context, doc.analysis.opening_hand_size);
  const deckSize = sectionSize(doc.main);
  if (deckSize === 0) return { error: "Add Main Deck cards first." };
  if (sample > deckSize) {
    return { error: `The Main Deck has ${deckSize} cards, fewer than the ${sample} drawn.` };
  }

  const conditionById = new Map(doc.hand_conditions.map((c) => [c.id, c]));
  const goals = doc.hand_condition_sets
    .map((set) => ({
      set,
      members: [...new Set(set.condition_ids)]
        .map((id) => conditionById.get(id))
        .filter((c): c is NonNullable<typeof c> => c !== undefined) as HandConditionLike[],
    }))
    .filter((goal) => goal.members.length > 0);
  if (goals.length === 0) {
    return { error: "Define a Hand Goal with at least one Hand Condition first." };
  }

  // Each handtrap's targets become a hidden Group, so cards that are alike for
  // the goals and for every handtrap merge into one row and the count stays small.
  const used = [...new Set(scenarios.flatMap((s) => s.handtrapIds))];
  const handtrapById = new Map(doc.handtraps.map((h) => [h.id, h]));
  const groups = new Map<string, ReadonlySet<number>>(groupsToMembership(doc.groups));
  for (const id of used) groups.set(`__hits:${id}`, new Set(handtrapById.get(id)?.hits ?? []));

  const allConditions = goals.flatMap((goal) => goal.members);
  const deck = compressDeck(doc.main, allConditions, groups);
  const hitRows = new Map<string, number[]>();
  for (const id of used) {
    const targets = groups.get(`__hits:${id}`)!;
    hitRows.set(
      id,
      deck.flatMap((card, row) => (targets.has(card.card_id) ? [row] : [])),
    );
  }

  const baseline = goals.map(() => 0n);
  const survived = scenarios.map(() => goals.map(() => 0n));
  const total = combinations(deckSize, sample);

  const holds = (hand: readonly number[], goal: number): boolean =>
    goals[goal]!.members.some((condition) => handConditionHolds(hand, deck, condition, groups));

  // True when the goal still holds however the opponent uses the handtraps from `at` on.
  function survives(hand: number[], goal: number, traps: readonly string[], at: number): boolean {
    if (at === traps.length) return holds(hand, goal);
    if (!survives(hand, goal, traps, at + 1)) return false; // doing nothing is an option
    for (const row of hitRows.get(traps[at]!) ?? []) {
      if (hand[row]! <= 0) continue;
      hand[row]! -= 1;
      const ok = survives(hand, goal, traps, at + 1);
      hand[row]! += 1;
      if (!ok) return false;
    }
    return true;
  }

  forEachHandComposition(deck, sample, (view, weight) => {
    const hand = view as number[];
    const base = goals.map((_, goal) => holds(hand, goal));
    base.forEach((passes, goal) => {
      if (passes) baseline[goal] = baseline[goal]! + weight;
    });
    if (!base.some(Boolean)) return;
    scenarios.forEach((scenario, index) => {
      base.forEach((passes, goal) => {
        if (passes && survives(hand, goal, scenario.handtrapIds, 0)) {
          survived[index]![goal] = survived[index]![goal]! + weight;
        }
      });
    });
  });

  const rows = (weights: bigint[]): GoalSurvival[] =>
    goals.map((goal, index) => ({
      setId: goal.set.id,
      name: goal.set.name,
      weight: weights[index]!,
      probability: ratioToNumber(weights[index]!, total),
    }));

  return {
    total,
    sample,
    baseline: rows(baseline),
    scenarios: scenarios.map((scenario, index) => ({ scenario, goals: rows(survived[index]!) })),
  };
}
