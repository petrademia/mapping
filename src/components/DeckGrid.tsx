import { useState } from "react";
import type { Catalog } from "../lib/catalog";
import { displayName } from "../lib/catalog";
import {
  clearSection,
  removeCard,
  sectionSize,
  setCardContextualOpeningQuality,
  setCardRoles,
  setQuantity,
  type DeckSection,
  type MappingCard,
  type MappingDocument,
} from "../lib/document";
import { ClearButton } from "./ClearButton";
import { CardFrame } from "./HandImages";
import { IconButton } from "./IconButton";
import { OpeningQualityEditor } from "./OpeningQualityEditor";
import { QuantityEditor } from "./QuantityEditor";
import { RoleEditor } from "./RoleEditor";

const TITLES: Record<DeckSection, string> = {
  main: "Main Deck",
  extra: "Extra Deck",
  side: "Side Deck",
};

interface Props {
  doc: MappingDocument;
  catalog: Catalog;
  onChange: (doc: MappingDocument) => void;
}

interface Selection {
  section: DeckSection;
  cardId: number;
}

function RolePips({ card }: { card: MappingCard }) {
  if (card.taxonomy.roles.length === 0) return null;
  return (
    <span className="tile-pips" aria-hidden="true">
      {card.taxonomy.roles.map((role) => (
        <span key={role} className="tile-pip" data-role={role} />
      ))}
    </span>
  );
}

/**
 * The deck as card art, like a deck-builder: one tile per physical copy, so
 * copies of a card sit side by side. Click any copy to edit the card's
 * quantity and tags underneath; the List view keeps the detailed table. Extra Deck cards are never drawn, so they have
 * no roles or opening quality to edit.
 */
export function DeckGrid({ doc, catalog, onChange }: Props) {
  const [selected, setSelected] = useState<Selection | null>(null);

  const toggle = (section: DeckSection, cardId: number) =>
    setSelected((current) =>
      current && current.section === section && current.cardId === cardId
        ? null
        : { section, cardId },
    );

  return (
    <>
      {(["main", "extra", "side"] as const).map((section) => {
        const cards = doc[section];
        const chosen =
          selected && selected.section === section
            ? cards.find((card) => card.card_id === selected.cardId)
            : undefined;
        return (
          <section className="deck-section deck-grid-section" key={section}>
            <header>
              <h2>{TITLES[section]}</h2>
              <p>{sectionSize(cards)} cards</p>
              {cards.length > 0 ? (
                <ClearButton
                  label={`Clear ${TITLES[section]}`}
                  icon="trash"
                  message={`Remove all ${sectionSize(cards)} cards from the ${TITLES[section]}?`}
                  onConfirm={() => {
                    onChange(clearSection(doc, section));
                    setSelected(null);
                  }}
                />
              ) : null}
            </header>
            {cards.length === 0 ? (
              <p className="empty">No cards in this section.</p>
            ) : (
              <ul className="deck-grid" aria-label={`${TITLES[section]} cards`}>
                {/* One tile per physical copy, copies of a card side by side. */}
                {cards.flatMap((card) => {
                  const name = displayName(card.card_id, card.name, catalog);
                  const isSelected = chosen?.card_id === card.card_id;
                  return Array.from({ length: card.quantity }, (_, copy) => (
                    <li key={`${card.card_id}-${copy}`}>
                      <button
                        type="button"
                        className={isSelected ? "deck-tile selected" : "deck-tile"}
                        aria-pressed={isSelected}
                        aria-label={
                          card.quantity === 1
                            ? `Edit ${name}`
                            : `Edit ${name}, copy ${copy + 1} of ${card.quantity}`
                        }
                        title={name}
                        onClick={() => toggle(section, card.card_id)}
                      >
                        <CardFrame cardId={card.card_id} />
                        {section !== "extra" ? <RolePips card={card} /> : null}
                        <span className="tile-name">{name}</span>
                      </button>
                    </li>
                  ));
                })}
              </ul>
            )}
            {chosen ? (
              <div className="deck-detail" role="group" aria-label={`Edit ${displayName(chosen.card_id, chosen.name, catalog)}`}>
                <div className="deck-detail-head">
                  <strong>{displayName(chosen.card_id, chosen.name, catalog)}</strong>
                  <span className="card-id">{chosen.card_id}</span>
                  <span className="deck-detail-actions">
                    <QuantityEditor
                      value={chosen.quantity}
                      onChange={(quantity) =>
                        onChange(setQuantity(doc, section, chosen.card_id, quantity))
                      }
                    />
                    <IconButton
                      icon="trash"
                      label={`Remove ${displayName(chosen.card_id, chosen.name, catalog)}`}
                      onClick={() => {
                        onChange(removeCard(doc, section, chosen.card_id));
                        setSelected(null);
                      }}
                    />
                    <IconButton icon="x" label="Close" onClick={() => setSelected(null)} />
                  </span>
                </div>
                {section !== "extra" ? (
                  <div className="taxonomy-cell">
                    <RoleEditor
                      roles={chosen.taxonomy.roles}
                      onChange={(roles) =>
                        onChange(setCardRoles(doc, section, chosen.card_id, roles))
                      }
                    />
                    <OpeningQualityEditor
                      value={chosen.taxonomy.opening_quality}
                      onChange={(turnOrder, value) =>
                        onChange(
                          setCardContextualOpeningQuality(
                            doc,
                            section,
                            chosen.card_id,
                            turnOrder,
                            value,
                          ),
                        )
                      }
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        );
      })}
    </>
  );
}
