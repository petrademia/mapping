import { isRanked, rankFor, type RankContext } from "./cardRank";
import type { MappingCard, MappingDocument } from "./document";
import { combinations } from "./probability";

/**
 * Rank score: how close a hand is to the best hand your ranking could draw.
 *
 * Each card gets a weight from its rank position r (1 = best): weight = 1 / sqrt(r),
 * so the fourth card is worth half the first and the hundredth a tenth. A
 * second copy of the same card in a hand is worth half of the first, a third
 * a quarter, because an extra copy is mostly redundant (it only covers you when
 * the first is stopped). A hand's score is the sum of its copies' values divided
 * by the same sum for the best possible hand of that size, so it reads 0 to
 * 100%: 100% means you drew the most valuable copies your ranking allows.
 *
 * Why 1/sqrt(r): it still favours the top cards but, unlike 1/r, it does not let
 * one great card carry a hand of dead ones, so the score reflects the whole hand
 * (a hand of five good cards beats one great card plus four dead ones by a wide
 * margin). Why halving copies: stacking copies of your best card should not
 * make an ordinary hand look worse than the best possible one. Neither choice
 * needs a tuning number. It is a model of your ranking, not a claim about
 * strategy; the weights are only as good as the order you set.
 */
export interface RankScorer {
  context: RankContext;
  /** Weight of the first copy of a card; 0 for a card the ranking does not know. */
  weightOf(cardId: number): number;
  /** Score of a hand (card id -> copies), 0 to 1. */
  score(counts: Readonly<Record<number, number>>): number;
  /** The exact average score of a random hand of this size. */
  expected(handSize: number): number;
  /** Rank position (1 = best) of a card, or null when unranked here. */
  positionOf(cardId: number): number | null;
}

export const rankWeight = (position: number): number => 1 / Math.sqrt(position);

/** Each further copy of a card in the hand counts for half of the one before. */
export const COPY_DECAY = 0.5;

/** The value of `copies` copies of a card whose first copy weighs `weight`. */
export function copiesValue(weight: number, copies: number): number {
  if (copies <= 0) return 0;
  return weight * (1 - COPY_DECAY ** copies) / (1 - COPY_DECAY);
}

/**
 * Build a scorer for a deck from a ranking order (best first). Cards missing
 * from the order get weight 0, which is how another deck is judged by this
 * deck's ranking.
 */
export function scorerFor(
  deck: readonly MappingCard[],
  order: readonly number[],
  context: RankContext,
): RankScorer {
  const position = new Map<number, number>();
  order.forEach((id, index) => position.set(id, index + 1));
  const weight = (id: number) => {
    const at = position.get(id);
    return at === undefined ? 0 : rankWeight(at);
  };

  // Value of the k-th copy of every card, heaviest first. A card's copies fall
  // in value, so taking the heaviest H gives the best hand of H cards.
  const marginals: number[] = [];
  for (const card of deck) {
    for (let k = 0; k < card.quantity; k += 1) marginals.push(weight(card.card_id) * COPY_DECAY ** k);
  }
  marginals.sort((a, b) => b - a);
  const ideal = (handSize: number) =>
    marginals.slice(0, handSize).reduce((sum, value) => sum + value, 0);

  const deckSize = deck.reduce((sum, card) => sum + card.quantity, 0);

  return {
    context,
    weightOf: weight,
    positionOf: (id) => position.get(id) ?? null,
    score(counts) {
      const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
      const best = ideal(total);
      if (best === 0) return 0;
      let sum = 0;
      for (const [id, n] of Object.entries(counts)) sum += copiesValue(weight(Number(id)), n);
      return sum / best;
    },
    expected(handSize) {
      const best = ideal(handSize);
      if (best === 0 || handSize > deckSize) return 0;
      // For each card, average its value over how many of its copies a random
      // hand holds (hypergeometric), then add the cards up.
      const handWays = combinations(deckSize, handSize);
      let sum = 0;
      for (const card of deck) {
        const w = weight(card.card_id);
        if (w === 0) continue;
        for (let k = 1; k <= Math.min(card.quantity, handSize); k += 1) {
          const ways =
            combinations(card.quantity, k) * combinations(deckSize - card.quantity, handSize - k);
          sum += (Number(ways) / Number(handWays)) * copiesValue(w, k);
        }
      }
      return sum / best;
    },
  };
}

/** The scorer for this deck's own ranking, or null until the user has ranked cards. */
export function scorerForDoc(doc: MappingDocument, context: RankContext): RankScorer | null {
  if (!isRanked(doc, context)) return null;
  return scorerFor(doc.main, rankFor(doc, context), context);
}
