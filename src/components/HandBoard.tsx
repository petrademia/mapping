import type { Catalog } from "../lib/catalog";
import { displayName } from "../lib/catalog";
import type { MappingCard } from "../lib/document";
import { CardFrame } from "./HandImages";
import { Icon } from "./IconButton";

interface Props {
  deck: readonly MappingCard[];
  /** card_id -> copies in the hand. */
  counts: Readonly<Record<number, number>>;
  catalog: Catalog;
  /** The deck in its current shuffled order; the built order when absent or out of date. */
  order: readonly number[];
  /** Rank position (1 = best) of a card, shown on the cards in the hand. */
  rankOf?: (cardId: number) => number | null;
  onCount: (cardId: number, next: number) => void;
  /** card_id -> copies in the hand that the opponent's handtraps would negate. */
  negated?: Readonly<Record<number, number>>;
}

/**
 * The deck beside the hand, both as card art. Cards of the deck that are in the
 * hand turn grey; click one that is not to draw it, and click a card in the hand
 * to put it back.
 */
export function HandBoard({ deck, counts, catalog, order, rankOf, onCount, negated = {} }: Props) {
  const names = new Map(deck.map((card) => [card.card_id, card.name] as const));
  const nameOf = (cardId: number): string => displayName(cardId, names.get(cardId), catalog);
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const remaining = order.length - total;

  // A copy of a card counts as drawn by its place among that card's copies.
  const seen = new Map<number, number>();
  const deckTiles = order.map((cardId) => {
    const copy = seen.get(cardId) ?? 0;
    seen.set(cardId, copy + 1);
    return { cardId, copy, drawn: copy < (counts[cardId] ?? 0) };
  });
  const handTiles = deck.flatMap((card) =>
    Array.from({ length: Math.min(counts[card.card_id] ?? 0, card.quantity) }, (_, copy) => ({
      cardId: card.card_id,
      copy,
    })),
  );

  return (
    <div className="hand-board-wrap">
    <div className="hand-board">
      <section className="hand-pane" aria-label="Deck">
        <header>
          <p>Click a card to add it to the hand</p>
          <p className="hand-remaining" role="status">
            {remaining} / {order.length} Remaining
          </p>
        </header>
        <ul className="hand-deck-grid" aria-label="Shuffled Main Deck">
          {deckTiles.map(({ cardId, copy, drawn }, index) => {
            const name = nameOf(cardId);
            return (
              <li key={`${cardId}-${copy}`} style={{ order: index }}>
                <button
                  type="button"
                  className={drawn ? "hand-tile drawn" : "hand-tile"}
                  aria-disabled={drawn}
                  aria-label={drawn ? `${name}, in hand` : `${name}. Click to add it to the hand`}
                  title={name}
                  onClick={() => {
                    if (!drawn) onCount(cardId, (counts[cardId] ?? 0) + 1);
                  }}
                >
                  <CardFrame cardId={cardId} name={name} />
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="hand-pane" aria-label="Hand">
        <header>
          <p>Click a card to return it to the deck</p>
          <p className="hand-total" role="status">
            {total} {total === 1 ? "Card" : "Cards"} in hand
          </p>
        </header>
        {handTiles.length === 0 ? (
          <p className="empty">No cards in the hand. Press New Hand, or click cards in the deck.</p>
        ) : (
          <ul className="hand-deck-grid" aria-label="Cards in hand">
            {handTiles.map(({ cardId, copy }) => {
              const name = nameOf(cardId);
              const rank = rankOf?.(cardId) ?? null;
              const hit = copy < (negated[cardId] ?? 0);
              return (
                <li key={`${cardId}-${copy}`}>
                  <button
                    type="button"
                    className={hit ? "hand-tile in-hand negated" : "hand-tile in-hand"}
                    aria-label={`${name}, in hand${hit ? ", negated by the opponent" : ""}. Click to return it to the deck`}
                    title={hit ? `${name} (negated)` : name}
                    onClick={() => onCount(cardId, (counts[cardId] ?? 0) - 1)}
                  >
                    <CardFrame cardId={cardId} name={name} />
                    {hit ? (
                      <span className="negated-mark" aria-hidden="true">
                        <Icon name="x" />
                      </span>
                    ) : null}
                    {rank !== null ? (
                      <span className="rank-badge" title={`Ranked #${rank}`}>
                        #{rank}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
    </div>
  );
}
