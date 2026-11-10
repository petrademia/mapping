import type { Catalog } from "../lib/catalog";
import { displayName } from "../lib/catalog";
import { cardImageUrl, useCardImageIds } from "../lib/cardImages";
import type { MappingCard } from "../lib/document";

interface Props {
  deck: readonly MappingCard[];
  /** card_id -> copies in the hand. */
  counts: Readonly<Record<number, number>>;
  catalog: Catalog;
  /** "md" for the single tested hand, "sm" for the generated list. */
  size?: "md" | "sm";
}

/**
 * One image per physical card in the hand, in deck order, with the card name
 * underneath. A card without a local image shows an empty frame, so the hand
 * still reads from the names.
 */
export function HandImages({ deck, counts, catalog, size = "md" }: Props) {
  const available = useCardImageIds();
  const cards: MappingCard[] = [];
  for (const card of deck) {
    const copies = counts[card.card_id] ?? 0;
    for (let copy = 0; copy < copies; copy += 1) cards.push(card);
  }
  return (
    <ul className={`hand-images ${size}`} aria-label="Cards in hand">
      {cards.map((card, index) => {
        const name = displayName(card.card_id, card.name, catalog);
        return (
          <li key={`${card.card_id}-${index}`} title={name}>
            <span className="hand-image-frame">
              {available.has(card.card_id) ? (
                <img
                  src={cardImageUrl(card.card_id)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <span className="hand-image-missing">No image</span>
              )}
            </span>
            <span className="hand-image-name">{name}</span>
          </li>
        );
      })}
    </ul>
  );
}
