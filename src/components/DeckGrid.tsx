import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
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
import { canMoveTo, moveCopy, reorderCard } from "../lib/deckMove";
import type { ExtraDeckIds } from "../lib/sectionRouting";
import { ClearButton } from "./ClearButton";
import { HandGrid } from "./HandGrid";
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

/** While Hand Test is open, the Main Deck itself is shuffled and the hand boxed. */
export interface HandTestView {
  counts: Readonly<Record<number, number>>;
  sample: number;
  order: readonly number[] | null;
  onCount: (cardId: number, next: number) => void;
}

interface Props {
  doc: MappingDocument;
  catalog: Catalog;
  onChange: (doc: MappingDocument) => void;
  handTest?: HandTestView | null;
  /** Extra Deck monster ids; decides which sections a dragged card may enter. */
  extraIds?: ExtraDeckIds;
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

/** The card editor. It sits inside the grid, right under the row you clicked. */
function DetailRow({
  section,
  card,
  doc,
  catalog,
  onChange,
  onClose,
}: {
  section: DeckSection;
  card: MappingCard;
  doc: MappingDocument;
  catalog: Catalog;
  onChange: (doc: MappingDocument) => void;
  onClose: () => void;
}): ReactNode {
  const ref = useRef<HTMLLIElement>(null);
  const name = displayName(card.card_id, card.name, catalog);

  // Opening the editor must never leave it off screen.
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest" });
  }, [card.card_id]);

  return (
    <li className="deck-detail-row" ref={ref}>
      <div className="deck-detail" role="group" aria-label={`Edit ${name}`}>
        <div className="deck-detail-head">
          <strong>{name}</strong>
          <span className="card-id">{card.card_id}</span>
          <span className="deck-detail-actions">
            <QuantityEditor
              value={card.quantity}
              onChange={(quantity) =>
                onChange(setQuantity(doc, section, card.card_id, quantity))
              }
            />
            <IconButton
              icon="trash"
              label={`Remove ${name}`}
              onClick={() => {
                onChange(removeCard(doc, section, card.card_id));
                onClose();
              }}
            />
            <IconButton icon="x" label="Close" onClick={onClose} />
          </span>
        </div>
        {section !== "extra" ? (
          <div className="taxonomy-cell">
            <RoleEditor
              roles={card.taxonomy.roles}
              onChange={(roles) => onChange(setCardRoles(doc, section, card.card_id, roles))}
            />
            <OpeningQualityEditor
              value={card.taxonomy.opening_quality}
              onChange={(turnOrder, value) =>
                onChange(
                  setCardContextualOpeningQuality(doc, section, card.card_id, turnOrder, value),
                )
              }
            />
          </div>
        ) : null}
      </div>
    </li>
  );
}

/**
 * The deck as card art, like a deck-builder: one tile per physical copy, so
 * copies of a card sit side by side. Click any copy and its editor opens right
 * under that row (no scrolling to the end of the section). Extra Deck cards
 * are never drawn, so they have no roles or opening quality to edit.
 */
export function DeckGrid({ doc, catalog, onChange, handTest, extraIds = new Set() }: Props) {
  const [selected, setSelected] = useState<Selection | null>(null);
  // Drag a tile to reorder inside a section, or onto another section to move one copy.
  // The ref is the source of truth for the handlers. No state changes when a drag
  // starts: re-rendering the dragged tile mid-start makes the browser cancel the
  // drag, so the source is dimmed with a data attribute instead.
  const dragRef = useRef<Selection | null>(null);
  const [over, setOver] = useState<{ section: DeckSection; cardId: number | null } | null>(null);

  const endDrag = () => {
    dragRef.current = null;
    setOver(null);
  };
  const accepts = (section: DeckSection) => {
    const source = dragRef.current;
    return source !== null && (source.section === section || canMoveTo(source.cardId, section, extraIds));
  };
  const overTile = (event: DragEvent, section: DeckSection, cardId: number | null) => {
    if (!accepts(section)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    if (over?.section !== section || over.cardId !== cardId) setOver({ section, cardId });
  };
  const dropOn = (event: DragEvent, section: DeckSection, cardId: number | null) => {
    const source = dragRef.current;
    if (!source || !accepts(section)) return;
    event.preventDefault();
    event.stopPropagation();
    if (source.section === section) {
      onChange(reorderCard(doc, section, source.cardId, cardId));
    } else {
      onChange(moveCopy(doc, source.section, section, source.cardId, extraIds));
    }
    endDrag();
  };

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
        const chosenId =
          selected && selected.section === section ? selected.cardId : null;
        return (
          <section
            className={
              over?.section === section && over.cardId === null
                ? "deck-section deck-grid-section drop-end"
                : "deck-section deck-grid-section"
            }
            key={section}
            onDragOver={(event) => overTile(event, section, null)}
            onDrop={(event) => dropOn(event, section, null)}
          >
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
            ) : section === "main" && handTest ? (
              <HandGrid
                deck={cards}
                counts={handTest.counts}
                sample={handTest.sample}
                catalog={catalog}
                order={handTest.order}
                onCount={handTest.onCount}
              />
            ) : (
              <ul className="deck-grid" aria-label={`${TITLES[section]} cards`}>
                {/* One tile per physical copy, copies of a card side by side. */}
                {cards.flatMap((card) => {
                  const name = displayName(card.card_id, card.name, catalog);
                  const isSelected = chosenId === card.card_id;
                  const tiles: ReactNode[] = Array.from({ length: card.quantity }, (_, copy) => (
                    <li
                      key={`${card.card_id}-${copy}`}
                      className={
                        over?.section === section && over.cardId === card.card_id && copy === 0
                          ? "drop-before"
                          : undefined
                      }
                      onDragOver={(event) => overTile(event, section, card.card_id)}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", name);
                        dragRef.current = { section, cardId: card.card_id };
                        const source = event.currentTarget;
                        window.setTimeout(() => source.setAttribute("data-dragging", "true"), 0);
                      }}
                      onDragEnd={(event) => {
                        event.currentTarget.removeAttribute("data-dragging");
                        endDrag();
                      }}
                      onDrop={(event) => dropOn(event, section, card.card_id)}
                    >
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
                        <CardFrame cardId={card.card_id} name={name} />
                        {section !== "extra" ? <RolePips card={card} /> : null}
                        <span className="tile-name">{name}</span>
                      </button>
                    </li>
                  ));
                  if (isSelected) {
                    tiles.push(
                      <DetailRow
                        key={`${card.card_id}-detail`}
                        section={section}
                        card={card}
                        doc={doc}
                        catalog={catalog}
                        onChange={onChange}
                        onClose={() => setSelected(null)}
                      />,
                    );
                  }
                  return tiles;
                })}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}
