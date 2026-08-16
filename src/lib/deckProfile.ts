import { groupsToMembership, type AccessCondition, type AccessGroup } from "./access";
import {
  accessConditionHolds,
  forEachHandComposition,
  type AccessConditionLike,
  type GroupMembership,
} from "./handExplorer";
import {
  combinations,
  ProbabilityError,
  openingAtLeastProbability,
  ratioToNumber,
} from "./probability";
import {
  copiesForOpeningQuality,
  openingQualityForTurn,
  type OpeningQualityValue,
} from "./taxonomy";
import type { MappingCard } from "./document";

export interface DeckProfile {
  deckSize: number;
  handSize: number;
  total: bigint;
  /** P(at least one access condition holds): modeled engine access. */
  anyAccess: number;
  anyAccessWeight: bigint;
  /** P(>= 1 card with contextual quality). */
  desirableGe1: number;
  neutralGe1: number;
  undesirableGe1: number;
  undesirableGe2: number;
  unclassifiedGe1: number;
  /** P(access AND ...) conjunctions; access means any condition holds. */
  accessNoUndesirable: number;
  accessNoUndesirableWeight: bigint;
  accessUndesirableGe1: number;
  accessUndesirableGe1Weight: bigint;
  /** P(>= 1 interaction role) and P(access AND >= 1 interaction). */
  interactionGe1: number;
  accessAndInteraction: number;
  accessAndInteractionWeight: bigint;
}

export function copyCountFor(
  hand: readonly number[],
  deck: readonly MappingCard[],
  predicate: (card: MappingCard) => boolean,
): number {
  let total = 0;
  for (let i = 0; i < deck.length; i += 1) {
    const copies = hand[i] ?? 0;
    if (copies > 0 && predicate(deck[i]!)) total += copies;
  }
  return total;
}

interface ComputeProfileInput {
  deck: readonly MappingCard[];
  handSize: number;
  turnOrder: "going_first" | "going_second";
  conditions: readonly AccessConditionLike[];
  groups?: GroupMembership;
}

/**
 * Exact opening-hand Deck Profile for a selected deck list (a single Deck
 * Configuration's Main Deck), analysis context turn order, and Access
 * Conditions. Quality buckets are mutually exclusive per card, so the `>= 1`
 * opening-composition rows are single-pile hypergeometric marginals; access
 * conjunctions are enumerated exactly once over hand compositions.
 */
export function computeDeckProfile({
  deck,
  handSize,
  turnOrder,
  conditions,
  groups = new Map(),
}: ComputeProfileInput): DeckProfile {
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

  const quality = (card: MappingCard): OpeningQualityValue =>
    openingQualityForTurn(card.taxonomy.opening_quality, turnOrder);

  const copiesFor = (quality: OpeningQualityValue): number =>
    copiesForOpeningQuality(deck, turnOrder, quality);

  const marginal = (copies: number, minimum: number): number =>
    openingAtLeastProbability(deckSize, copies, handSize, minimum);

  const desirableGe1 = marginal(copiesFor("desirable"), 1);
  const neutralGe1 = marginal(copiesFor("neutral"), 1);
  const undesirableGe1 = marginal(copiesFor("undesirable"), 1);
  const undesirableGe2 = marginal(copiesFor("undesirable"), 2);
  const unclassifiedGe1 = marginal(copiesFor(null), 1);
  const interactionCopies = deck.reduce(
    (sum, card) =>
      card.taxonomy.roles.includes("interaction") ? sum + card.quantity : sum,
    0,
  );
  const interactionGe1 = marginal(interactionCopies, 1);

  let anyAccessWeight = 0n;
  let accessNoUndesirableWeight = 0n;
  let accessUndesirableGe1Weight = 0n;
  let accessAndInteractionWeight = 0n;

  if (conditions.length > 0 && total > 0n) {
    forEachHandComposition(deck, handSize, (hand, weight) => {
      const access = conditions.some((condition) =>
        accessConditionHolds(hand, deck, condition, groups),
      );
      if (!access) return;
      anyAccessWeight += weight;
      const undesirable = copyCountFor(
        hand,
        deck,
        (card) => quality(card) === "undesirable",
      );
      const interaction = copyCountFor(
        hand,
        deck,
        (card) => card.taxonomy.roles.includes("interaction"),
      );
      if (undesirable === 0) accessNoUndesirableWeight += weight;
      if (undesirable >= 1) accessUndesirableGe1Weight += weight;
      if (interaction >= 1) accessAndInteractionWeight += weight;
    });
  }

  const pAccess =
    total === 0n ? 0 : ratioToNumber(anyAccessWeight, total);

  return {
    deckSize,
    handSize,
    total,
    anyAccess: pAccess,
    anyAccessWeight,
    desirableGe1,
    neutralGe1,
    undesirableGe1,
    undesirableGe2,
    unclassifiedGe1,
    accessNoUndesirable:
      total === 0n ? 0 : ratioToNumber(accessNoUndesirableWeight, total),
    accessNoUndesirableWeight,
    accessUndesirableGe1:
      total === 0n ? 0 : ratioToNumber(accessUndesirableGe1Weight, total),
    accessUndesirableGe1Weight,
    interactionGe1,
    accessAndInteraction:
      total === 0n ? 0 : ratioToNumber(accessAndInteractionWeight, total),
    accessAndInteractionWeight,
  };
}

/** Convenience: build group membership from Access Groups. */
export function deckProfileFromAccessData(
  deck: readonly MappingCard[],
  handSize: number,
  turnOrder: "going_first" | "going_second",
  conditions: readonly AccessCondition[],
  groups: readonly AccessGroup[],
): DeckProfile {
  return computeDeckProfile({
    deck,
    handSize,
    turnOrder,
    conditions,
    groups: groupsToMembership(groups),
  });
}