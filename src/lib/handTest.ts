import type { MappingCard } from "./document";
import {
  combinations,
  ratioToNumber,
} from "./probability";
import {
  evaluateHandCondition,
  type ConditionEvaluation,
  type GroupMembership,
  type HandConditionLike,
} from "./handExplorer";
import type { HandConditionSetLike } from "./handExplorer";
import { openingQualityForTurn } from "./taxonomy";

/** A concrete tested hand: card_id -> copies drawn, plus the sample size. */
export interface TestedHand {
  card_counts: Record<number, number>;
  observed_cards: number;
}

export type HandValidationIssue =
  | { kind: "not_in_main"; card_id: number }
  | { kind: "over_copy_limit"; card_id: number; limit: number; count: number }
  | { kind: "wrong_size"; expected: number; actual: number };

/** Resolve a TestedHand into the count-vector aligned with the deck rows. */
export function handVector(
  deck: readonly MappingCard[],
  card_counts: Readonly<Record<number, number>>,
): number[] {
  return deck.map((card) => card_counts[card.card_id] ?? 0);
}

/** Validate a manually selected hand against the current Main Deck. */
export function validateManualHand(
  deck: readonly MappingCard[],
  card_counts: Readonly<Record<number, number>>,
  observed_cards: number,
): HandValidationIssue[] {
  const issues: HandValidationIssue[] = [];
  let total = 0;
  for (const [id, count] of Object.entries(card_counts)) {
    const cardId = Number(id);
    if (count <= 0) continue;
    total += count;
    const deckCard = deck.find((card) => card.card_id === cardId);
    if (!deckCard) {
      issues.push({ kind: "not_in_main", card_id: cardId });
    } else if (count > deckCard.quantity) {
      issues.push({
        kind: "over_copy_limit",
        card_id: cardId,
        limit: deckCard.quantity,
        count,
      });
    }
  }
  if (total !== observed_cards) {
    issues.push({ kind: "wrong_size", expected: observed_cards, actual: total });
  }
  return issues;
}

/**
 * Uniformly sample a random hand over PHYSICAL cards (each copy of each card
 * is a distinct physical card), so multi-copy cards are weighted correctly.
 * `rng` is injectable for deterministic tests; default Math.random.
 */
export function drawRandomHand(
  deck: readonly MappingCard[],
  observed_cards: number,
  rng: () => number = Math.random,
): TestedHand {
  const deckSize = deck.reduce((sum, card) => sum + card.quantity, 0);
  if (!Number.isInteger(observed_cards) || observed_cards < 0 || observed_cards > deckSize) {
    throw new Error("hand size must fit inside deck size");
  }
  const physical: number[] = [];
  for (const card of deck) {
    for (let i = 0; i < card.quantity; i += 1) physical.push(card.card_id);
  }
  for (let i = physical.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [physical[i], physical[j]] = [physical[j]!, physical[i]!];
  }
  const card_counts: Record<number, number> = {};
  for (let i = 0; i < observed_cards; i += 1) {
    const id = physical[i]!;
    card_counts[id] = (card_counts[id] ?? 0) + 1;
  }
  return { card_counts, observed_cards };
}

/**
 * Probability of drawing this EXACT card-name/count composition
 * (product_i C(n_i, h_i) / C(deck_size, observed_cards)).
 * Not a strategic "hand quality".
 */
export function exactHandProbability(
  deck: readonly MappingCard[],
  card_counts: Readonly<Record<number, number>>,
  observed_cards: number,
): number {
  const deckSize = deck.reduce((sum, card) => sum + card.quantity, 0);
  const total = combinations(deckSize, observed_cards);
  let weight = 1n;
  for (const card of deck) {
    const copies = card_counts[card.card_id] ?? 0;
    if (copies > card.quantity) return 0;
    weight *= combinations(card.quantity, copies);
  }
  return ratioToNumber(weight, total);
}

/** Evaluation of one Condition Set against one hand. */
export interface SetEvaluation {
  setId: string;
  name: string;
  /** member condition ids resolved against the evaluated conditions. */
  memberIds: string[];
  satisfiedIds: string[];
  memberCount: number;
  satisfiedCount: number;
  /** ANY set passes iff at least one member condition passes. */
  passed: boolean;
}

/** Full single-hand test: every condition plus every condition set. */
export interface HandTestResult {
  hand: TestedHand;
  conditions: ConditionEvaluation[];
  sets: SetEvaluation[];
}

/**
 * Evaluate all Hand Conditions and Condition Sets against one exact hand.
 * Uses the direct predicate evaluator; no hand-space enumeration.
 */
export function evaluateHandTest(
  deck: readonly MappingCard[],
  card_counts: Readonly<Record<number, number>>,
  conditions: readonly HandConditionLike[],
  sets: readonly HandConditionSetLike[],
  groups: GroupMembership = new Map(),
): HandTestResult {
  const hand = handVector(deck, card_counts);
  const conditionEvaluations = conditions.map((condition) =>
    evaluateHandCondition(hand, deck, condition, groups),
  );
  const byId = new Map(
    conditionEvaluations.map((evaluation) => [evaluation.conditionId, evaluation]),
  );
  const setEvaluations = sets.map((set) => {
    const memberIds = [...new Set(set.condition_ids)].filter((id) => byId.has(id));
    const satisfiedIds = memberIds.filter((id) => byId.get(id)!.passed);
    return {
      setId: set.id,
      name: set.name,
      memberIds,
      satisfiedIds,
      memberCount: memberIds.length,
      satisfiedCount: satisfiedIds.length,
      passed: satisfiedIds.length > 0,
    };
  });
  return {
    hand: { card_counts: { ...card_counts }, observed_cards: observedCardsOf(card_counts) },
    conditions: conditionEvaluations,
    sets: setEvaluations,
  };
}

function observedCardsOf(card_counts: Readonly<Record<number, number>>): number {
  return Object.values(card_counts).reduce((sum, count) => sum + count, 0);
}

export type QualityCategory =
  | "desirable"
  | "neutral"
  | "undesirable"
  | "unclassified";

/** Raw Opening Quality counts for one tested hand under a turn order. */
export interface OpeningQualityCounts {
  desirable: number;
  neutral: number;
  undesirable: number;
  unclassified: number;
  /** card_ids contributing to each category (one entry per card, not per copy). */
  contributors: Record<QualityCategory, number[]>;
}

export function handOpeningQualityCounts(
  deck: readonly MappingCard[],
  card_counts: Readonly<Record<number, number>>,
  turnOrder: "going_first" | "going_second",
): OpeningQualityCounts {
  const counts: Record<QualityCategory, number> = {
    desirable: 0,
    neutral: 0,
    undesirable: 0,
    unclassified: 0,
  };
  const contributors: Record<QualityCategory, number[]> = {
    desirable: [],
    neutral: [],
    undesirable: [],
    unclassified: [],
  };
  for (const card of deck) {
    const copies = card_counts[card.card_id] ?? 0;
    if (copies === 0) continue;
    const quality = openingQualityForTurn(
      card.taxonomy.opening_quality,
      turnOrder,
    );
    const key: QualityCategory = quality === null ? "unclassified" : quality;
    counts[key] += copies;
    contributors[key].push(card.card_id);
  }
  return { ...counts, contributors };
}