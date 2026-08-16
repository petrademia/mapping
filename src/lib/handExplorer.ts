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
  | { kind: "role"; role: Role; op: CountOperator; count: number };

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
): number {
  if (condition.kind === "card") {
    const index = deck.findIndex((card) => card.card_id === condition.card_id);
    return index === -1 ? 0 : (hand[index] ?? 0);
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
): boolean {
  return matchesCount(
    countForCondition(hand, deck, condition),
    condition.op,
    condition.count,
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
    const a = conditionHolds(hand, deck, comparison.conditionA);
    const b = conditionHolds(hand, deck, comparison.conditionB);
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
