import { isRanked, rankFor, type RankContext } from "./cardRank";
import type { MappingCard, MappingDocument } from "./document";

/**
 * Rank score: how close a hand is to the best hand your ranking could draw.
 *
 * Each card gets a weight from its rank position r (1 = best): weight = 1 / r,
 * so the second card is worth half the first and the tenth a tenth. A hand's
 * score is the sum of its copies' weights divided by the sum for the best
 * possible hand of the same size (the heaviest copies in the deck), so it reads
 * 0 to 100%: 100% means you drew your top cards.
 *
 * Why 1/r: it is top-heavy, which matches how a few key cards decide a hand, it
 * needs no tuning number, and a random hand scores low (about a fifth), so the
 * score separates good hands from average ones. It is a model of your ranking,
 * not a claim about strategy; the weights are only as good as the order you set.
 */
export interface RankScorer {
  context: RankContext;
  /** Weight of one copy of a card; 0 for a card the ranking does not know. */
  weightOf(cardId: number): number;
  /** Score of a hand (card id -> copies), 0 to 1. */
  score(counts: Readonly<Record<number, number>>): number;
  /** The exact average score of a random hand of this size. */
  expected(handSize: number): number;
  /** Rank position (1 = best) of a card, or null when unranked here. */
  positionOf(cardId: number): number | null;
}

export const rankWeight = (position: number): number => 1 / position;

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

  // Every copy in the deck, heaviest first, to find the best hand of any size.
  const copies: number[] = [];
  for (const card of deck) {
    for (let i = 0; i < card.quantity; i += 1) copies.push(weight(card.card_id));
  }
  copies.sort((a, b) => b - a);
  const ideal = (handSize: number) =>
    copies.slice(0, handSize).reduce((sum, value) => sum + value, 0);
  const meanWeight = copies.length === 0 ? 0 : copies.reduce((sum, value) => sum + value, 0) / copies.length;

  return {
    context,
    weightOf: weight,
    positionOf: (id) => position.get(id) ?? null,
    score(counts) {
      const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
      const best = ideal(total);
      if (best === 0) return 0;
      let sum = 0;
      for (const [id, n] of Object.entries(counts)) sum += weight(Number(id)) * n;
      return sum / best;
    },
    expected(handSize) {
      const best = ideal(handSize);
      return best === 0 ? 0 : (handSize * meanWeight) / best;
    },
  };
}

/** The scorer for this deck's own ranking, or null until the user has ranked cards. */
export function scorerForDoc(doc: MappingDocument, context: RankContext): RankScorer | null {
  if (!isRanked(doc, context)) return null;
  return scorerFor(doc.main, rankFor(doc, context), context);
}
