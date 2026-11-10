import type { Catalog } from "../lib/catalog";
import { displayName } from "../lib/catalog";
import type { MappingCard } from "../lib/document";
import { CardFrame } from "./HandImages";

interface Props {
  deck: readonly MappingCard[];
  /** card_id -> copies in the hand. */
  counts: Readonly<Record<number, number>>;
  /** Cards in a full hand: 5, or 6 for going second on the first turn. */
  sample: number;
  catalog: Catalog;
  /** A shuffled order of every copy (card ids); the grid follows it when it still matches the deck. */
  order?: readonly number[] | null;
  /** Rank position (1 = best) of a card, shown on the cards in the hand. */
  rankOf?: (cardId: number) => number | null;
  onCount: (cardId: number, next: number) => void;
}

/**
 * The Main Deck as card art, one tile per copy, with the cards in the hand
 * boxed. Click a card to put a copy in the hand and click a boxed card to take
 * it out, so one grid draws, shows and edits the hand.
 */
export function HandGrid({ deck, counts, sample, catalog, order, rankOf, onCount }: Props) {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const hasHand = total > 0;
  const names = new Map(deck.map((card) => [card.card_id, card.name] as const));
  const deckOrder = deck.flatMap((card) => Array<number>(card.quantity).fill(card.card_id));
  // Follow the shuffle only while it is still the same deck.
  const sameDeck =
    order != null &&
    order.length === deckOrder.length &&
    [...order].sort((x, y) => x - y).join() === [...deckOrder].sort((x, y) => x - y).join();
  const tiles = sameDeck ? order : deckOrder;
  const seen = new Map<number, number>();
  return (
    <div className="hand-deck">
      <p className="hand-total" role="status">
        {total} / {sample} cards in hand
      </p>
      <ul className="hand-deck-grid" aria-label="Shuffled Main Deck">
        {tiles.map((cardId, index) => {
          const name = displayName(cardId, names.get(cardId), catalog);
          const inHand = counts[cardId] ?? 0;
          const copy = seen.get(cardId) ?? 0;
          seen.set(cardId, copy + 1);
          const boxed = copy < inHand;
          const canAdd = total < sample;
          return (
            <li key={`${cardId}-${copy}`} style={{ order: index }}>
              <button
                type="button"
                className={
                  boxed ? "hand-tile in-hand" : hasHand ? "hand-tile out" : "hand-tile"
                }
                aria-pressed={boxed}
                aria-disabled={!boxed && !canAdd}
                aria-label={
                  boxed
                    ? `${name}, in hand. Click to take it out`
                    : `${name}. Click to add it to the hand`
                }
                title={name}
                onClick={() => {
                  if (boxed) onCount(cardId, inHand - 1);
                  else if (canAdd) onCount(cardId, inHand + 1);
                }}
              >
                <CardFrame cardId={cardId} name={name} />
                {boxed && rankOf && rankOf(cardId) !== null ? (
                  <span className="rank-badge" title={`Ranked #${rankOf(cardId)}`}>
                    #{rankOf(cardId)}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
