import type { MappingCard } from "./document";
import {
  combinations,
  ProbabilityError,
  ratioToNumber,
} from "./probability";
import type { Role } from "./taxonomy";

export const COUNT_OPERATORS = [
  "eq",
  "neq",
  "gte",
  "lte",
  "gt",
  "lt",
] as const;

export type CountOperator = (typeof COUNT_OPERATORS)[number];

export type HandCondition =
  | { kind: "card"; card_id: number; op: CountOperator; count: number }
  | { kind: "role"; role: Role; op: CountOperator; count: number }
  | { kind: "group"; group_id: string; op: CountOperator; count: number };

/** Optional group membership lookup for `kind: "group"` subjects. */
export type GroupMembership = ReadonlyMap<string, ReadonlySet<number>>;

export interface ProbabilityComparison {
  conditionA: HandCondition;
  conditionB: HandCondition;
}

/**
 * Exact opening-hand probabilities for two conditions.
 * Conditional fields are `null` when the conditioning event has probability 0
 * (undefined), never coerced to 0%.
 */
export interface ProbabilityResult {
  pA: number;
  pB: number;
  pIntersection: number;
  pBGivenA: number | null;
  pAGivenB: number | null;
  weightA: bigint;
  weightB: bigint;
  weightAB: bigint;
  total: bigint;
}

export function matchesCount(
  actual: number,
  op: CountOperator,
  expected: number,
): boolean {
  switch (op) {
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "gte":
      return actual >= expected;
    case "lte":
      return actual <= expected;
    case "gt":
      return actual > expected;
    case "lt":
      return actual < expected;
  }
}

export function countForCondition(
  hand: readonly number[],
  deck: readonly MappingCard[],
  condition: HandCondition,
  groups: GroupMembership = new Map(),
): number {
  if (condition.kind === "card") {
    const index = deck.findIndex((card) => card.card_id === condition.card_id);
    return index === -1 ? 0 : (hand[index] ?? 0);
  }
  if (condition.kind === "group") {
    const members = groups.get(condition.group_id);
    if (!members || members.size === 0) return 0;
    let total = 0;
    for (let i = 0; i < deck.length; i += 1) {
      const copies = hand[i] ?? 0;
      if (copies === 0) continue;
      if (members.has(deck[i]!.card_id)) total += copies;
    }
    return total;
  }
  let total = 0;
  for (let i = 0; i < deck.length; i += 1) {
    const copies = hand[i] ?? 0;
    if (copies === 0) continue;
    if (deck[i]!.taxonomy.roles.includes(condition.role)) {
      total += copies;
    }
  }
  return total;
}

export function conditionHolds(
  hand: readonly number[],
  deck: readonly MappingCard[],
  condition: HandCondition,
  groups: GroupMembership = new Map(),
): boolean {
  return matchesCount(
    countForCondition(hand, deck, condition, groups),
    condition.op,
    condition.count,
  );
}

/** ALL OF requirements. Empty requirement lists do not hold (incomplete condition). */
export function allRequirementsHold(
  hand: readonly number[],
  deck: readonly MappingCard[],
  requirements: readonly HandCondition[],
  groups: GroupMembership = new Map(),
): boolean {
  if (requirements.length === 0) return false;
  return requirements.every((requirement) =>
    conditionHolds(hand, deck, requirement, groups),
  );
}

function handWeight(deck: readonly MappingCard[], hand: readonly number[]): bigint {
  let weight = 1n;
  for (let i = 0; i < deck.length; i += 1) {
    weight *= combinations(deck[i]!.quantity, hand[i] ?? 0);
  }
  return weight;
}

/**
 * Enumerate unique hand count-vectors (one entry per main-deck card row)
 * with sum(h_i) = handSize and 0 <= h_i <= n_i. Calls `visit` for each.
 */
export function forEachHandComposition(
  deck: readonly MappingCard[],
  handSize: number,
  visit: (hand: readonly number[], weight: bigint) => void,
): void {
  if (
    !Number.isInteger(handSize) ||
    handSize < 0 ||
    deck.some((card) => !Number.isInteger(card.quantity) || card.quantity < 1)
  ) {
    throw new ProbabilityError("invalid deck or hand size for enumeration");
  }
  const deckSize = deck.reduce((sum, card) => sum + card.quantity, 0);
  if (handSize > deckSize) {
    throw new ProbabilityError("hand_size must fit inside deck_size");
  }
  const hand = new Array<number>(deck.length).fill(0);

  function recurse(index: number, remaining: number): void {
    if (index === deck.length) {
      if (remaining === 0) visit(hand, handWeight(deck, hand));
      return;
    }
    const maxTake = Math.min(deck[index]!.quantity, remaining);
    // Prune: remaining cards must be able to fill the hand.
    let maxLater = 0;
    for (let j = index + 1; j < deck.length; j += 1) {
      maxLater += deck[j]!.quantity;
    }
    for (let take = 0; take <= maxTake; take += 1) {
      const left = remaining - take;
      if (left > maxLater) continue;
      hand[index] = take;
      recurse(index + 1, left);
    }
    hand[index] = 0;
  }

  recurse(0, handSize);
}

export function compareHandConditions(
  deck: readonly MappingCard[],
  handSize: number,
  comparison: ProbabilityComparison,
  groups: GroupMembership = new Map(),
): ProbabilityResult {
  const deckSize = deck.reduce((sum, card) => sum + card.quantity, 0);
  if (
    !Number.isInteger(handSize) ||
    handSize < 0 ||
    handSize > deckSize ||
    deckSize < 0
  ) {
    throw new ProbabilityError("copies and hand_size must fit inside deck_size");
  }

  const total = combinations(deckSize, handSize);
  if (total === 0n) {
    return {
      pA: 0,
      pB: 0,
      pIntersection: 0,
      pBGivenA: null,
      pAGivenB: null,
      weightA: 0n,
      weightB: 0n,
      weightAB: 0n,
      total: 0n,
    };
  }

  let weightA = 0n;
  let weightB = 0n;
  let weightAB = 0n;

  forEachHandComposition(deck, handSize, (hand, weight) => {
    const a = conditionHolds(hand, deck, comparison.conditionA, groups);
    const b = conditionHolds(hand, deck, comparison.conditionB, groups);
    if (a) weightA += weight;
    if (b) weightB += weight;
    if (a && b) weightAB += weight;
  });

  return {
    pA: ratioToNumber(weightA, total),
    pB: ratioToNumber(weightB, total),
    pIntersection: ratioToNumber(weightAB, total),
    pBGivenA: weightA === 0n ? null : ratioToNumber(weightAB, weightA),
    pAGivenB: weightB === 0n ? null : ratioToNumber(weightAB, weightB),
    weightA,
    weightB,
    weightAB,
    total,
  };
}

export interface AccessProbabilityRow {
  id: string;
  name: string;
  probability: number;
  weight: bigint;
}

export interface AccessProbabilitySummary {
  conditions: AccessProbabilityRow[];
  anyAccess: number;
  anyWeight: bigint;
  total: bigint;
}

/**
 * Exact per-condition probabilities and the union (OR) over all conditions.
 * A hand matching multiple conditions contributes once to `anyAccess`.
 */
export function summarizeAccessConditions(
  deck: readonly MappingCard[],
  handSize: number,
  conditions: readonly {
    id: string;
    name: string;
    requirements: readonly HandCondition[];
  }[],
  groups: GroupMembership = new Map(),
): AccessProbabilitySummary {
  const deckSize = deck.reduce((sum, card) => sum + card.quantity, 0);
  if (
    !Number.isInteger(handSize) ||
    handSize < 0 ||
    handSize > deckSize ||
    deckSize < 0
  ) {
    throw new ProbabilityError("copies and hand_size must fit inside deck_size");
  }

  const total = combinations(deckSize, handSize);
  if (total === 0n || conditions.length === 0) {
    return {
      conditions: conditions.map((condition) => ({
        id: condition.id,
        name: condition.name,
        probability: 0,
        weight: 0n,
      })),
      anyAccess: 0,
      anyWeight: 0n,
      total,
    };
  }

  const weights = conditions.map(() => 0n);
  let anyWeight = 0n;

  forEachHandComposition(deck, handSize, (hand, weight) => {
    let any = false;
    for (let i = 0; i < conditions.length; i += 1) {
      if (
        allRequirementsHold(hand, deck, conditions[i]!.requirements, groups)
      ) {
        weights[i] = weights[i]! + weight;
        any = true;
      }
    }
    if (any) anyWeight += weight;
  });

  return {
    conditions: conditions.map((condition, index) => ({
      id: condition.id,
      name: condition.name,
      probability: ratioToNumber(weights[index]!, total),
      weight: weights[index]!,
    })),
    anyAccess: ratioToNumber(anyWeight, total),
    anyWeight,
    total,
  };
}
