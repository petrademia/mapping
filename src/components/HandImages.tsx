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
  /** Show each card's Roles under its name. */
  showRoles?: boolean;
}

/** A card-shaped frame with the local image, or an empty "No image" frame. */
export function CardFrame({ cardId }: { cardId: number }) {
  const available = useCardImageIds();
  return (
    <span className="hand-image-frame">
      {available.has(cardId) ? (
        <img src={cardImageUrl(cardId)} alt="" loading="lazy" decoding="async" />
      ) : (
        <span className="hand-image-missing">No image</span>
      )}
    </span>
  );
}

/**
 * One image per physical card in the hand, in deck order, with the card name
 * underneath. A card without a local image shows an empty frame, so the hand
 * still reads from the names.
 */
export function HandImages({ deck, counts, catalog, size = "md", showRoles = false }: Props) {
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
            <CardFrame cardId={card.card_id} />
            <span className="hand-image-name">{name}</span>
            {showRoles && card.taxonomy.roles.length > 0 ? (
              <span className="hand-image-roles">
                {card.taxonomy.roles
                  .map((role) => role.charAt(0).toUpperCase() + role.slice(1))
                  .join(", ")}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
