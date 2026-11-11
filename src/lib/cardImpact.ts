import type { MappingCard } from "./document";
import {
  cardClassKey,
  countedAnalysis,
  forEachHandComposition,
  handConditionHolds,
  type ConditionRequirement,
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

  // Cards a condition names are their own kind; the rest merge by Groups and Roles,
  // so interchangeable cards share one calculation.
  const named = new Set<number>();
  for (const condition of members) {
    for (const predicate of [...condition.requirements, ...(condition.excludes ?? [])]) {
      if (predicate.kind === "card") named.add(predicate.card_id);
    }
  }
  const exact = members.some((condition) => (condition.distinct_constraints ?? []).length > 0);

  let total = 0n;
  let passing = 0n;
  const withWeight = deck.map(() => 0n);
  const withPassing = deck.map(() => 0n);
  const byClass = new Map<string, { withWeight: bigint; withPassing: bigint }>();

  deck.forEach((card, i) => {
    const key = `${cardClassKey(card, named, groups)}|${card.quantity}`;
    let result = exact ? undefined : byClass.get(key);
    if (!result) {
      const present: ConditionRequirement = { kind: "card", card_id: card.card_id, op: "gte", count: 1 };
      const probe: HandConditionLike = { id: "__present", name: "present", requirements: [present] };
      let rowTotal = 0n;
      let rowPassing = 0n;
      let rowWith = 0n;
      let rowWithPassing = 0n;
      const visit = (holds: readonly boolean[], weight: bigint): void => {
        rowTotal += weight;
        const passed = members.some((_, index) => holds[index]);
        if (passed) rowPassing += weight;
        if (holds[members.length]) {
          rowWith += weight;
          if (passed) rowWithPassing += weight;
        }
      };
      if (exact) {
        forEachHandComposition(deck, handSize, (hand, weight) => {
          visit(
            [
              ...members.map((condition) => handConditionHolds(hand, deck, condition, groups)),
              (hand[i] ?? 0) > 0,
            ],
            weight,
          );
        });
      } else {
        countedAnalysis(deck, handSize, [...members, probe], groups, undefined, (holds, weight) =>
          visit(holds, weight),
        );
      }
      total = rowTotal;
      passing = rowPassing;
      result = { withWeight: rowWith, withPassing: rowWithPassing };
      if (!exact) byClass.set(key, result);
    }
    withWeight[i] = result.withWeight;
    withPassing[i] = result.withPassing;
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
