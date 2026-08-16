import type { Catalog } from "../lib/catalog";
import {
  removeCard,
  sectionSize,
  setCardOpeningQuality,
  setCardRoles,
  setQuantity,
  type DeckSection,
  type MappingDocument,
} from "../lib/document";
import { CardRow } from "./CardRow";

const TITLES: Record<DeckSection, string> = {
  main: "Main Deck",
  extra: "Extra Deck",
  side: "Side Deck",
};

interface Props {
  doc: MappingDocument;
  section: DeckSection;
  catalog: Catalog;
  onChange: (doc: MappingDocument) => void;
}

export function DeckSection({ doc, section, catalog, onChange }: Props) {
  const cards = doc[section];
  return (
    <section className="deck-section">
      <header>
        <h2>{TITLES[section]}</h2>
        <p>{sectionSize(cards)} cards</p>
      </header>
      {cards.length === 0 ? (
        <p className="empty">No cards in this section.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Card</th>
              <th>Qty</th>
              <th>Taxonomy</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cards.map((card) => (
              <CardRow
                key={card.card_id}
                card={card}
                catalog={catalog}
                onQuantity={(quantity) =>
                  onChange(setQuantity(doc, section, card.card_id, quantity))
                }
                onRoles={(roles) =>
                  onChange(setCardRoles(doc, section, card.card_id, roles))
                }
                onOpeningQuality={(openingQuality) =>
                  onChange(
                    setCardOpeningQuality(
                      doc,
                      section,
                      card.card_id,
                      openingQuality,
                    ),
                  )
                }
                onRemove={() => onChange(removeCard(doc, section, card.card_id))}
              />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
