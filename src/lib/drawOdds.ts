import type { MappingCard } from "./document";
import { openingAtLeastProbability } from "./probability";

export interface DrawOddsRow {
  /** Cards seen: the opening hand, then one more for each draw. */
  seen: number;
  /** Chance of at least 1, 2 and 3 copies among them. */
  atLeast: [number, number, number];
}

/** Copies of the cards in `ids` that the Main Deck holds. */
export function copiesIn(main: readonly MappingCard[], ids: ReadonlySet<number>): number {
  return main.reduce((sum, card) => sum + (ids.has(card.card_id) ? card.quantity : 0), 0);
}

/**
 * Exact chance of seeing at least 1, 2 and 3 of `copies` cards among the first `seen` cards of a
 * shuffled `deckSize`-card deck, for the opening hand and each of the next `draws` cards.
 */
export function drawOddsRows(deckSize: number, copies: number, opening: number, draws = 5): DrawOddsRow[] {
  const rows: DrawOddsRow[] = [];
  for (let seen = opening; seen <= opening + draws && seen <= deckSize; seen += 1) {
    rows.push({
      seen,
      atLeast: [1, 2, 3].map((min) => openingAtLeastProbability(deckSize, copies, seen, min)) as DrawOddsRow["atLeast"],
    });
  }
  return rows;
}
