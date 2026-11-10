import type { MappingCard } from "./document";
import {
  forEachHandComposition,
  handConditionHolds,
  type GroupMembership,
  type HandConditionLike,
  type HandConditionSetLike,
} from "./handExplorer";
import { ratioToNumber } from "./probability";

export interface CardImpactRow {
  card_id: number;
  name?: string;
  quantity: number;
  /** P(outcome | at least one copy of this card is in the hand); null if it can never be. */
  withCard: number | null;
  /**
   * withCard - baseline, in probability (0.25 = 25 points). Positive means
   * hands holding this card match the outcome more often than a random hand.
   */
  lift: number | null;
}

export interface CardImpact {
  setId: string;
  setName: string;
  /** P(outcome) over all hands. */
  baseline: number;
  /** Highest lift first; cards that can never be in the hand last. */
  rows: CardImpactRow[];
}

/**
 * How much holding each Main Deck card changes the chance of one Modeled
 * Outcome: P(outcome | card in hand) - P(outcome), computed exactly in one pass
 * over every hand. It is a statistic about your model, not a weight you assign
 * and not a claim about strategy: a card has zero lift when the outcome does
 * not depend on it, and a negative lift when holding it makes a match rarer
 * (an Excludes line, or it only crowds the hand).
 *
 * Compared with "card absent" on purpose: for a card with many copies, absence
 * means other cards fill the hand, which would distort the comparison.
 */
export function computeCardImpact(
  deck: readonly MappingCard[],
  handSize: number,
  conditions: readonly HandConditionLike[],
  set: HandConditionSetLike,
  groups: GroupMembership = new Map(),
): CardImpact {
  const members = [...new Set(set.condition_ids)]
    .map((id) => conditions.find((condition) => condition.id === id))
    .filter((condition): condition is HandConditionLike => condition !== undefined);

  let total = 0n;
  let passing = 0n;
  const withWeight = deck.map(() => 0n);
  const withPassing = deck.map(() => 0n);

  forEachHandComposition(deck, handSize, (hand, weight) => {
    total += weight;
    const passed = members.some((condition) =>
      handConditionHolds(hand, deck, condition, groups),
    );
    if (passed) passing += weight;
    for (let i = 0; i < deck.length; i += 1) {
      if ((hand[i] ?? 0) > 0) {
        withWeight[i] = withWeight[i]! + weight;
        if (passed) withPassing[i] = withPassing[i]! + weight;
      }
    }
  });

  const baseline = total === 0n ? 0 : ratioToNumber(passing, total);

  const rows: CardImpactRow[] = deck.map((card, i) => {
    const withCard =
      withWeight[i]! === 0n ? null : ratioToNumber(withPassing[i]!, withWeight[i]!);
    return {
      card_id: card.card_id,
      name: card.name,
      quantity: card.quantity,
      withCard,
      lift: withCard === null ? null : withCard - baseline,
    };
  });

  rows.sort((a, b) => {
    if (a.lift === null && b.lift === null) return 0;
    if (a.lift === null) return 1;
    if (b.lift === null) return -1;
    return b.lift - a.lift;
  });

  return { setId: set.id, setName: set.name, baseline, rows };
}
