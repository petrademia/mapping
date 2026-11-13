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

/**
 * The Groups marked as a shared bottleneck, as hand positions: for each, the rows of its
 * cards in `deck`. Groups with no card in the deck are left out.
 */
function chokePointRows(doc: MappingDocument, deck: readonly { card_id: number }[]): number[][] {
  const rows: number[][] = [];
  for (const id of doc.choke_point_group_ids) {
    const group = doc.groups.find((entry) => entry.id === id);
    if (!group) continue;
    const members = new Set(group.card_ids);
    const inDeck = deck.flatMap((card, row) => (members.has(card.card_id) ? [row] : []));
    if (inDeck.length > 0) rows.push(inDeck);
  }
  return rows;
}

/**
 * Runs `test` as if only one card of each choke-point Group could be used: for each
 * Group you choose which card (or none) before the opponent answers, and it
 * succeeds when any combination of choices passes. The hand is put back.
 */
function withChokePoints(
  hand: number[],
  groups: readonly (readonly number[])[],
  test: () => boolean,
  index = 0,
): boolean {
  if (index === groups.length) return test();
  const rows = groups[index]!;
  const present = rows.filter((row) => hand[row]! > 0);
  if (present.length === 0) return withChokePoints(hand, groups, test, index + 1);
  const saved = rows.map((row) => hand[row]!);
  for (const choice of [...present, -1]) {
    rows.forEach((row) => {
      hand[row] = row === choice ? 1 : 0;
    });
    const ok = withChokePoints(hand, groups, test, index + 1);
    rows.forEach((row, at) => {
      hand[row] = saved[at]!;
    });
    if (ok) return true;
  }
  return false;
}

/**
 * Who the opponent is.
 * - "worst_case": every handtrap is used on the card that hurts you most, or not at all.
 * - "priority": every handtrap goes to the first card or Group of the document's
 *   `hit_priority` list that it can stop and that is in your hand, whether or not that
 *   breaks your plan. When none is in reach, that handtrap falls back to the worst case.
 */
export type OpponentModel = "worst_case" | "priority";

export function analyzeVersus(
  doc: MappingDocument,
  scenarios: readonly VersusScenario[] = scenariosFor(doc),
  options: { opponent?: OpponentModel } = {},
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
  // What the opponent goes for, as hidden Groups too, so a listed card stays a row of its own.
  const priority = options.opponent === "priority" ? doc.hit_priority : [];
  priority.forEach((target, index) => {
    if (target.kind === "card") groups.set(`__prio:${index}`, new Set([target.card_id]));
  });

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
  const targetRows = priority
    .map((target, index) => {
      const members = target.kind === "card" ? groups.get(`__prio:${index}`)! : (groups.get(target.group_id) ?? new Set<number>());
      return deck.flatMap((card, row) => (members.has(card.card_id) ? [row] : []));
    })
    .filter((rows) => rows.length > 0);

  // Cards that share a bottleneck: each Group is already part of what tells rows apart.
  const chokeRows = chokePointRows(doc, deck);

  const baseline = goals.map(() => 0n);
  const survived = scenarios.map(() => goals.map(() => 0n));
  const total = combinations(deckSize, sample);

  const holds = (hand: readonly number[], goal: number): boolean =>
    goals[goal]!.members.some((condition) => handConditionHolds(hand, deck, condition, groups));

  // True when the goal still holds against the opponent from handtrap `at` on.
  function survives(hand: number[], goal: number, traps: readonly string[], at: number): boolean {
    if (at === traps.length) return holds(hand, goal);
    const capable = hitRows.get(traps[at]!) ?? [];
    // The first listed target this handtrap can stop and that you hold: it goes there.
    for (const rows of targetRows) {
      const reachable = rows.filter((row) => capable.includes(row) && hand[row]! > 0);
      if (reachable.length === 0) continue;
      // A card is one row. For a Group you choose which of its cards is the one stopped.
      for (const row of reachable) {
        hand[row]! -= 1;
        const ok = survives(hand, goal, traps, at + 1);
        hand[row]! += 1;
        if (ok) return true;
      }
      return false;
    }
    // Nothing listed in reach: the worst case, the card that hurts most or no card at all.
    if (!survives(hand, goal, traps, at + 1)) return false;
    for (const row of capable) {
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
    // A line marked as having a second path finishes through one stop, whatever is hit.
    const insulated = goals.map((goal) =>
      goal.members.some(
        (condition) =>
          condition.survives_one_interruption === true &&
          handConditionHolds(hand, deck, condition, groups),
      ),
    );
    scenarios.forEach((scenario, index) => {
      base.forEach((passes, goal) => {
        if (
          passes &&
          ((scenario.handtrapIds.length <= 1 && insulated[goal]) ||
            withChokePoints(hand, chokeRows, () => survives(hand, goal, scenario.handtrapIds, 0)))
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

  // For each choke-point Group you choose which of its cards to use, then the opponent
  // answers: the goal is broken only when every combination of choices can be broken.
  const chokeRows = chokePointRows(doc, deck);
  function breakChoosing(members: readonly HandConditionLike[], index = 0): number[] | null {
    if (index === chokeRows.length) return breakWith(members, 0);
    const rows = chokeRows[index]!;
    const present = rows.filter((row) => hand[row]! > 0);
    if (present.length === 0) return breakChoosing(members, index + 1);
    const saved = rows.map((row) => hand[row]!);
    let shown: number[] | null = null;
    for (const choice of [...present, -1]) {
      rows.forEach((row) => {
        hand[row] = row === choice ? 1 : 0;
      });
      const result = breakChoosing(members, index + 1);
      rows.forEach((row, at) => {
        hand[row] = saved[at]!;
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
      const insulated =
        handtrapIds.length <= 1 &&
        members.some(
          (condition) =>
            condition.survives_one_interruption === true &&
            handConditionHolds(hand, deck, condition, groups),
        );
      const broken = base && !insulated ? breakChoosing(members) : null;
      return {
        setId: set.id,
        name: set.name,
        holds: base,
        survives: base && broken === null,
        negated: broken ?? [],
      };
    });
}
