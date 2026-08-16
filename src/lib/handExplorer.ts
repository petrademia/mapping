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

/**
 * A single predicate over the observed hand: count of a Card, a Role, or a
 * Group against an operator. Reused by both `requirements` and `excludes` of
 * a Hand Condition.
 */
export type ConditionRequirement =
  | { kind: "card"; card_id: number; op: CountOperator; count: number }
  | { kind: "role"; role: Role; op: CountOperator; count: number }
  | { kind: "group"; group_id: string; op: CountOperator; count: number };

/** Optional group membership lookup for `kind: "group"` subjects. */
export type GroupMembership = ReadonlyMap<string, ReadonlySet<number>>;

export interface ProbabilityComparison {
  conditionA: ConditionRequirement;
  conditionB: ConditionRequirement;
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
  condition: ConditionRequirement,
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
  condition: ConditionRequirement,
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
  requirements: readonly ConditionRequirement[],
  groups: GroupMembership = new Map(),
): boolean {
  if (requirements.length === 0) return false;
  return requirements.every((requirement) =>
    conditionHolds(hand, deck, requirement, groups),
  );
}

/**
 * A modeled Hand Condition: ALL OF `requirements` must hold AND NONE OF
 * `excludes` may hold. Both sides use the same condition primitive.
 */
export interface HandConditionLike {
  id: string;
  name: string;
  requirements: readonly ConditionRequirement[];
  /** NONE OF these exclusion predicates may hold. Missing means no exclusions. */
  excludes?: readonly ConditionRequirement[];
}

/**
 * A hand satisfies the condition iff every requirement holds and the hand
 * evaluates FALSE for every exclusion predicate.
 */
export function handConditionHolds(
  hand: readonly number[],
  deck: readonly MappingCard[],
  condition: HandConditionLike,
  groups: GroupMembership = new Map(),
): boolean {
  if (!allRequirementsHold(hand, deck, condition.requirements, groups)) {
    return false;
  }
  const excludes = condition.excludes ?? [];
  return !excludes.some((exclusion) =>
    conditionHolds(hand, deck, exclusion, groups),
  );
}

/**
 * card_ids in the hand that contributed to a predicate's count. For a Card
 * predicate this is the card itself (when present); for Role and Group
 * predicates it is every hand card that carries the role or belongs to the
 * group. Empty when the actual count is 0.
 */
export function predicateContributors(
  hand: readonly number[],
  deck: readonly MappingCard[],
  predicate: ConditionRequirement,
  groups: GroupMembership = new Map(),
): number[] {
  if (predicate.kind === "card") {
    const index = deck.findIndex((card) => card.card_id === predicate.card_id);
    return index !== -1 && (hand[index] ?? 0) > 0 ? [predicate.card_id] : [];
  }
  const contributors: number[] = [];
  for (let i = 0; i < deck.length; i += 1) {
    const copies = hand[i] ?? 0;
    if (copies === 0) continue;
    const card = deck[i]!;
    if (predicate.kind === "role") {
      if (card.taxonomy.roles.includes(predicate.role)) contributors.push(card.card_id);
    } else {
      const members = groups.get(predicate.group_id);
      if (members?.has(card.card_id)) contributors.push(card.card_id);
    }
  }
  return contributors;
}

/**
 * Structured evaluation of one predicate against a single hand: the actual
 * count, whether the operator matches, and the contributing cards. `passed`
 * for an exclusion predicate means the exclusion MATCHED (i.e. the condition
 * is rejected).
 */
export interface PredicateEvaluation {
  predicate: ConditionRequirement;
  actualCount: number;
  passed: boolean;
  contributors: number[];
}

/**
 * Structured evaluation of one Hand Condition against a single hand.
 * `passed` is true iff every requirement passed AND no exclusion matched.
 */
export interface ConditionEvaluation {
  conditionId: string;
  name: string;
  passed: boolean;
  requirements: PredicateEvaluation[];
  excludes: PredicateEvaluation[];
}

/**
 * Evaluate one Hand Condition against one exact hand, returning why every
 * requirement and exclusion passed or failed. Evaluates the predicates
 * directly - it never enumerates the hand space.
 */
export function evaluateHandCondition(
  hand: readonly number[],
  deck: readonly MappingCard[],
  condition: HandConditionLike,
  groups: GroupMembership = new Map(),
): ConditionEvaluation {
  const requirements = condition.requirements.map((predicate) => {
    const actualCount = countForCondition(hand, deck, predicate, groups);
    return {
      predicate,
      actualCount,
      passed: matchesCount(actualCount, predicate.op, predicate.count),
      contributors: predicateContributors(hand, deck, predicate, groups),
    };
  });
  const excludes = (condition.excludes ?? []).map((predicate) => {
    const actualCount = countForCondition(hand, deck, predicate, groups);
    return {
      predicate,
      actualCount,
      passed: matchesCount(actualCount, predicate.op, predicate.count),
      contributors: predicateContributors(hand, deck, predicate, groups),
    };
  });
  const passed =
    requirements.length > 0 &&
    requirements.every((requirement) => requirement.passed) &&
    !excludes.some((exclusion) => exclusion.passed);
  return {
    conditionId: condition.id,
    name: condition.name,
    passed,
    requirements,
    excludes,
  };
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

export interface HandConditionProbabilityRow {
  id: string;
  name: string;
  probability: number;
  weight: bigint;
}

/**
 * Exact distribution of the number of selected engine-access conditions a random
 * hand satisfies. `exact[k] = P(N_access = k)`; `atLeast[k] = P(N_access >= k)`
 * for k >= 1. `weights` are exact bigint bucket weights.
 */
export interface AccessCountDistribution {
  exact: number[];
  atLeast: number[];
  weights: bigint[];
}

export interface HandConditionSummary {
  /** Per-condition exact probabilities over ALL configured hand conditions. */
  conditions: HandConditionProbabilityRow[];
  /** P(any selected engine-access condition): union over the engine-access set. */
  anyAccess: number;
  anyWeight: bigint;
  accessDistribution: AccessCountDistribution;
  total: bigint;
}

/** A named set of Hand Conditions combined with `any` (OR) semantics. */
export interface HandConditionSetLike {
  id: string;
  name: string;
  condition_ids: readonly string[];
}

/**
 * Exact statistics for one Condition Set: the union probability (P(S)) and
 * the multiplicity distribution of how many member conditions a random hand
 * satisfies.
 */
export interface ConditionSetSummary {
  id: string;
  name: string;
  /** Member condition ids resolved against the analyzed conditions. */
  conditionIds: string[];
  /** P(any member condition): exact union over the set. */
  union: number;
  unionWeight: bigint;
  distribution: AccessCountDistribution;
}

/** Exact pairwise intersection P(A ∩ B) for two conditions. */
export interface PairOverlap {
  intersection: number;
  intersectionWeight: bigint;
}

/**
 * Exact event analysis over the hand sample space: per-condition
 * probabilities, per-set unions/distributions, and pairwise intersections.
 * Everything is accumulated from a single hand-composition enumeration.
 */
export interface HandEventAnalysis {
  total: bigint;
  /** P(C) for every hand condition, in input order. */
  conditions: HandConditionProbabilityRow[];
  /** Per configured Condition Set. */
  sets: ConditionSetSummary[];
  /**
   * P(A ∩ B) keyed by `pairKey(aId, bId)`. Only pairs of distinct conditions
   * with a positive overlap appear.
   */
  overlaps: Map<string, PairOverlap>;
}

/** Canonical, order-independent key for an unordered condition pair. */
export function pairKey(aId: string, bId: string): string {
  return aId < bId ? `${aId}\u0000${bId}` : `${bId}\u0000${aId}`;
}

/**
 * Exact analysis of Hand Conditions and Condition Sets in one enumeration
 * pass. For each hand composition, every condition is evaluated once; the
 * satisfied set drives per-condition weights, per-set union/multiplicity
 * buckets, and pairwise intersection weights. No probabilities are summed and
 * no independence is assumed.
 */
export function analyzeHandConditions(
  deck: readonly MappingCard[],
  handSize: number,
  conditions: readonly HandConditionLike[],
  sets: readonly HandConditionSetLike[],
  groups: GroupMembership = new Map(),
): HandEventAnalysis {
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

  const conditionById = new Map(conditions.map((c) => [c.id, c]));

  const setSpecs = sets.map((set) => ({
    id: set.id,
    name: set.name,
    // Resolve members against known conditions; unknown ids are dropped.
    conditionIds: [...new Set(set.condition_ids)].filter((id) =>
      conditionById.has(id),
    ),
  }));

  const conditionWeights = conditions.map(() => 0n);
  const setMembers = setSpecs.map((spec) =>
    spec.conditionIds
      .map((id) => conditions.findIndex((c) => c.id === id))
      .filter((index) => index >= 0),
  );
  const setUnionWeights = setSpecs.map(() => 0n);
  const setBucketWeights = setMembers.map((members) =>
    new Array<bigint>(members.length + 1).fill(0n),
  );
  const pairWeights = new Map<string, bigint>();

  if (total > 0n) {
    forEachHandComposition(deck, handSize, (hand, weight) => {
      const holds = conditions.map((condition) =>
        handConditionHolds(hand, deck, condition, groups),
      );
      for (let i = 0; i < conditions.length; i += 1) {
        if (holds[i]) conditionWeights[i] = conditionWeights[i]! + weight;
      }

      const satisfied: number[] = [];
      for (let i = 0; i < holds.length; i += 1) {
        if (holds[i]) satisfied.push(i);
      }
      if (satisfied.length >= 2) {
        for (let a = 0; a < satisfied.length; a += 1) {
          for (let b = a + 1; b < satisfied.length; b += 1) {
            const key = pairKey(
              conditions[satisfied[a]!]!.id,
              conditions[satisfied[b]!]!.id,
            );
            pairWeights.set(key, (pairWeights.get(key) ?? 0n) + weight);
          }
        }
      }

      for (let s = 0; s < setSpecs.length; s += 1) {
        let count = 0;
        for (const index of setMembers[s]!) {
          if (holds[index]) count += 1;
        }
        if (count > 0) setUnionWeights[s] = setUnionWeights[s]! + weight;
        setBucketWeights[s]![count] = setBucketWeights[s]![count]! + weight;
      }
    });
  }

  const overlaps = new Map<string, PairOverlap>();
  for (const [key, weight] of pairWeights) {
    overlaps.set(key, {
      intersection: ratioToNumber(weight, total),
      intersectionWeight: weight,
    });
  }

  return {
    total,
    conditions: conditions.map((condition, index) => ({
      id: condition.id,
      name: condition.name,
      probability: ratioToNumber(conditionWeights[index]!, total),
      weight: conditionWeights[index]!,
    })),
    sets: setSpecs.map((spec, index) => {
      const weights = setBucketWeights[index]!;
      const n = spec.conditionIds.length;
      const exact = Array.from(
        { length: n + 1 },
        (_, count) => ratioToNumber(weights[count]!, total),
      );
      const atLeast = Array.from({ length: n }, (_, i) => {
        let sum = 0n;
        for (let count = i + 1; count <= n; count += 1) sum += weights[count]!;
        return ratioToNumber(sum, total);
      });
      return {
        id: spec.id,
        name: spec.name,
        conditionIds: spec.conditionIds,
        union: ratioToNumber(setUnionWeights[index]!, total),
        unionWeight: setUnionWeights[index]!,
        distribution: { exact, atLeast, weights },
      };
    }),
    overlaps,
  };
}

/**
 * P(A | B) = P(A ∩ B) / P(B), derived exactly from the analysis weights.
 * Returns null when the conditioning event B has zero probability.
 */
export function pAGivenB(
  analysis: HandEventAnalysis,
  aId: string,
  bId: string,
): number | null {
  const b = analysis.conditions.find((row) => row.id === bId);
  if (!b || b.weight === 0n) return null;
  const overlap = analysis.overlaps.get(pairKey(aId, bId));
  if (!overlap) return 0;
  return ratioToNumber(overlap.intersectionWeight, b.weight);
}

/**
 * Exact per-Hand-Condition probabilities plus, for the explicitly selected
 * access conditions (`accessConditionIds`), the union and the distribution of
 * how many of them a random hand satisfies. Convenience wrapper over
 * `analyzeHandConditions` for a single condition set.
 */
export function summarizeHandConditions(
  deck: readonly MappingCard[],
  handSize: number,
  conditions: readonly HandConditionLike[],
  accessConditionIds: readonly string[] = [],
  groups: GroupMembership = new Map(),
): HandConditionSummary {
  const analysis = analyzeHandConditions(
    deck,
    handSize,
    conditions,
    [{ id: "engine-access", name: "Engine Access", condition_ids: accessConditionIds }],
    groups,
  );
  const set = analysis.sets[0];
  return {
    conditions: analysis.conditions,
    anyAccess: set ? set.union : 0,
    anyWeight: set ? set.unionWeight : 0n,
    accessDistribution: set
      ? set.distribution
      : { exact: [], atLeast: [], weights: [] },
    total: analysis.total,
  };
}
