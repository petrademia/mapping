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

/** The cards that each need your one Normal Summon a turn (the document's Normal Summon Group). */
function normalSummonCards(doc: MappingDocument): ReadonlySet<number> {
  const group = doc.normal_summon_group_id
    ? doc.groups.find((entry) => entry.id === doc.normal_summon_group_id)
    : undefined;
  return new Set(group?.card_ids ?? []);
}

/**
 * Runs `test` as if only one card that needs the Normal Summon could be used: you
 * choose which one (or none) before the opponent answers, and succeed when any
 * choice passes. `rows` are the hand positions of those cards. The hand is put back.
 */
function withNormalSummon(hand: number[], rows: readonly number[], test: () => boolean): boolean {
  const present = rows.filter((row) => hand[row]! > 0);
  if (present.length === 0) return test();
  const saved = rows.map((row) => hand[row]!);
  for (const choice of [...present, -1]) {
    rows.forEach((row) => {
      hand[row] = row === choice ? 1 : 0;
    });
    const ok = test();
    rows.forEach((row, index) => {
      hand[row] = saved[index]!;
    });
    if (ok) return true;
  }
  return false;
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

  // Cards that share the Normal Summon: the Group is already part of what tells rows apart.
  const normalSummon = normalSummonCards(doc);
  const normalSummonRows = deck.flatMap((card, row) => (normalSummon.has(card.card_id) ? [row] : []));

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
        if (
          passes &&
          withNormalSummon(hand, normalSummonRows, () => survives(hand, goal, scenario.handtrapIds, 0))
        ) {
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

export interface HandVersusGoal {
  setId: string;
  name: string;
  /** The goal holds for the hand as drawn. */
  holds: boolean;
  /** It still holds however the opponent uses the handtraps. */
  survives: boolean;
  /** When it does not survive: the cards the opponent negates to break it. */
  negated: number[];
}

/**
 * One drawn hand against the handtraps in `handtrapIds`: for each Hand Goal,
 * whether it holds and, if the opponent can break it, which cards they hit.
 */
export function handVersus(
  doc: MappingDocument,
  cardCounts: Readonly<Record<number, number>>,
  handtrapIds: readonly string[],
): HandVersusGoal[] {
  const deck = doc.main;
  const groups = new Map<string, ReadonlySet<number>>(groupsToMembership(doc.groups));
  for (const handtrap of doc.handtraps) {
    groups.set(`__hits:${handtrap.id}`, new Set(handtrap.hits));
  }
  const conditionById = new Map(doc.hand_conditions.map((c) => [c.id, c]));
  const hand = deck.map((card) => cardCounts[card.card_id] ?? 0);
  const handtrapById = new Map(doc.handtraps.map((h) => [h.id, h]));

  const holds = (members: readonly HandConditionLike[]): boolean =>
    members.some((condition) => handConditionHolds(hand, deck, condition, groups));

  // The cards to negate that break the goal, or null when it always survives.
  function breakWith(members: readonly HandConditionLike[], at: number): number[] | null {
    if (at === handtrapIds.length) return holds(members) ? null : [];
    const idle = breakWith(members, at + 1); // doing nothing is an option
    if (idle) return idle;
    const hits = handtrapById.get(handtrapIds[at]!)?.hits ?? [];
    for (const cardId of hits) {
      const row = deck.findIndex((card) => card.card_id === cardId);
      if (row < 0 || hand[row]! <= 0) continue;
      hand[row]! -= 1;
      const rest = breakWith(members, at + 1);
      hand[row]! += 1;
      if (rest) return [cardId, ...rest];
    }
    return null;
  }

  // You choose which card that needs the Normal Summon to use, then the opponent
  // answers: the goal is broken only when every choice can be broken.
  const normalSummon = normalSummonCards(doc);
  const normalSummonRows = deck.flatMap((card, row) => (normalSummon.has(card.card_id) ? [row] : []));
  function breakChoosing(members: readonly HandConditionLike[]): number[] | null {
    const present = normalSummonRows.filter((row) => hand[row]! > 0);
    if (present.length === 0) return breakWith(members, 0);
    const saved = normalSummonRows.map((row) => hand[row]!);
    let shown: number[] | null = null;
    for (const choice of [...present, -1]) {
      normalSummonRows.forEach((row) => {
        hand[row] = row === choice ? 1 : 0;
      });
      const result = breakWith(members, 0);
      normalSummonRows.forEach((row, index) => {
        hand[row] = saved[index]!;
      });
      if (result === null) return null; // this choice survives every answer
      // Show a break that names cards, when there is one.
      if (shown === null || (shown.length === 0 && result.length > 0)) shown = result;
    }
    return shown;
  }

  return doc.hand_condition_sets
    .map((set) => ({
      set,
      members: [...new Set(set.condition_ids)]
        .map((id) => conditionById.get(id))
        .filter((c): c is NonNullable<typeof c> => c !== undefined) as HandConditionLike[],
    }))
    .filter((goal) => goal.members.length > 0)
    .map(({ set, members }) => {
      const base = holds(members);
      const broken = base ? breakChoosing(members) : null;
      return {
        setId: set.id,
        name: set.name,
        holds: base,
        survives: base && broken === null,
        negated: broken ?? [],
      };
    });
}
