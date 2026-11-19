import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { deriveLabels, type DerivedLabels } from "../lib/derivedLabels";
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
import { allowedCopies, copiesInDeck, type Banlist, type Format } from "../lib/banlist";
import { canMoveTo, moveCopy, reorderCard } from "../lib/deckMove";
import { isRanked, rankFor } from "../lib/cardRank";
import { SORT_LABELS, sortCards, sortsFor, upgradeSort, type DeckSort } from "../lib/deckSort";
import { labelIndex, matchesSpotlight, SPOTLIGHTS, spotlightCounts, type Spotlight } from "../lib/deckLabels";
import type { ExtraDeckIds } from "../lib/sectionRouting";
import { ClearButton } from "./ClearButton";
import { CardFrame } from "./HandImages";
import { IconButton } from "./IconButton";
import { OpeningQualityEditor } from "./OpeningQualityEditor";
import { QuantityEditor } from "./QuantityEditor";
import { RoleEditor } from "./RoleEditor";

const DECK_SECTIONS: readonly DeckSection[] = ["main", "extra", "side"];

const TITLES: Record<DeckSection, string> = {
  main: "Main Deck",
  extra: "Extra Deck",
  side: "Side Deck",
};

interface Props {
  doc: MappingDocument;
  catalog: Catalog;
  onChange: (doc: MappingDocument) => void;
  /** Extra Deck monster ids; decides which sections a dragged card may enter. */
  extraIds?: ExtraDeckIds;
  /** With the format, how many copies of a card the deck may hold (3, or less if limited). */
  banlist?: Banlist;
  format?: Format;
}

const SORT_KEY = "mapping.deckSort";

function readSorts(): Record<DeckSection, DeckSort> {
  const fresh: Record<DeckSection, DeckSort> = { main: "built", extra: "built", side: "built" };
  try {
    const saved = JSON.parse(localStorage.getItem(SORT_KEY) ?? "null") as Partial<
      Record<DeckSection, DeckSort>
    > | null;
    for (const section of ["main", "extra", "side"] as const) {
      const value = upgradeSort(saved?.[section]) as DeckSort | undefined;
      if (value && sortsFor(section).includes(value)) fresh[section] = value;
    }
  } catch {
    /* use the built order */
  }
  return fresh;
}

interface Selection {
  section: DeckSection;
  cardId: number;
}

/** The roles shown on a tile: Interaction as tagged, Starter and Extender as read from the Hand Conditions. */
function shownRoles(card: MappingCard, derived: DerivedLabels | undefined): readonly string[] {
  if (!derived) return card.taxonomy.roles;
  return [
    ...(derived.starter ? ["starter"] : []),
    ...(derived.extender ? ["extender"] : []),
    ...(derived.brick ? ["brick"] : []),
    ...(["interaction", "lingering", "lingering_second"].some((role) => (card.taxonomy.roles as readonly string[]).includes(role))
      ? ["interaction"]
      : []),
  ];
}

function RolePips({ card, derived }: { card: MappingCard; derived: DerivedLabels | undefined }) {
  const roles = shownRoles(card, derived);
  if (roles.length === 0) return null;
  return (
    <span className="tile-pips" aria-hidden="true">
      {roles.map((role) => (
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
  derived,
  catalog,
  extraIds,
  banlist,
  format,
  onChange,
  onClose,
}: {
  section: DeckSection;
  card: MappingCard;
  doc: MappingDocument;
  /** Starter, Extender and Brick for this card; null when no Hand Goal exists to read them from. */
  derived: DerivedLabels | null;
  catalog: Catalog;
  extraIds: ExtraDeckIds;
  banlist: Banlist;
  format: Format;
  onChange: (doc: MappingDocument) => void;
  onClose: () => void;
}): ReactNode {
  const ref = useRef<HTMLLIElement>(null);
  const name = displayName(card.card_id, card.name, catalog);
  // Where one copy may go: Extra Deck monsters only to Extra or Side, every other card to Main or Side.
  // Copies this row may hold: what the format allows, less the copies in the other sections. Never
  // below one, so a deck that is already over can still be reduced but not raised.
  const room = Math.max(1, allowedCopies(banlist, format, card.card_id) - (copiesInDeck(doc, card.card_id) - card.quantity));
  const targets = DECK_SECTIONS.filter((target) => target !== section && canMoveTo(card.card_id, target, extraIds));

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
              max={room}
              onChange={(quantity) => {
                if (quantity <= 0) {
                  onChange(removeCard(doc, section, card.card_id));
                  onClose();
                } else {
                  onChange(setQuantity(doc, section, card.card_id, quantity));
                }
              }}
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
        {targets.length > 0 ? (
          <div className="deck-detail-move" role="group" aria-label="Move one copy">
            <span className="taxonomy-label">Move one copy to</span>
            {targets.map((target) => (
              <button
                key={target}
                type="button"
                aria-label={`Move one ${name} to ${TITLES[target]}`}
                onClick={() => {
                  onChange(moveCopy(doc, section, target, card.card_id, extraIds));
                  // The row is gone from this section once its last copy has left.
                  if (card.quantity <= 1) onClose();
                }}
              >
                {TITLES[target]}
              </button>
            ))}
          </div>
        ) : null}
        {section !== "extra" ? (
          <div className="taxonomy-cell">
            <RoleEditor
              roles={card.taxonomy.roles}
              derived={derived}
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
export function DeckGrid({ doc, catalog, onChange, extraIds = new Set(), banlist = {}, format = "ocg" }: Props) {
  const [selected, setSelected] = useState<Selection | null>(null);
  // A sort only changes how a section is shown; it never touches the deck itself.
  const [sorts, setSorts] = useState<Record<DeckSection, DeckSort>>(readSorts);
  const chooseSort = (section: DeckSection, sort: DeckSort) => {
    setBlockedSection((current) => (current === section ? null : current));
    setSorts((current) => {
      const next = { ...current, [section]: sort };
      try {
        localStorage.setItem(SORT_KEY, JSON.stringify(next));
      } catch {
        /* the choice just will not persist */
      }
      return next;
    });
  };
  // Starter, Extender and Brick, read from the Hand Conditions (empty until a Hand Goal exists).
  const labels = useMemo(() => deriveLabels(doc), [doc]);
  // The label the Main Deck spotlights: every other card is dimmed, nothing moves.
  const [spotlight, setSpotlight] = useState<Spotlight>("all");
  const mainCounts = useMemo(
    () => spotlightCounts(doc.main, (card) => labels.get(card.card_id)),
    [doc.main, labels],
  );
  const turn = doc.analysis.turn_order;
  const rankOrder = isRanked(doc, turn) ? rankFor(doc, turn) : null;
  // Drag a tile to reorder inside a section, or onto another section to move one copy.
  // The ref is the source of truth for the handlers. No state changes when a drag
  // starts: re-rendering the dragged tile mid-start makes the browser cancel the
  // drag, so the source is dimmed with a data attribute instead.
  const dragRef = useRef<Selection | null>(null);
  const [over, setOver] = useState<{ section: DeckSection; cardId: number | null } | null>(null);
  // A section a card was dragged inside while it is sorted: it cannot be reordered, so it says so.
  const [blockedSection, setBlockedSection] = useState<DeckSection | null>(null);
  // The tile being dragged. Dimming is done on the elements, not in state, because re-rendering the
  // dragged tile as the drag starts makes the browser cancel it.
  const dragEl = useRef<HTMLElement | null>(null);
  /**
   * Reordering inside a section moves every copy of a card, since the copies are one row, so all of
   * them are dimmed while the drag is over its own section. Over another section only one copy moves,
   * so only the tile being dragged is dimmed.
   */
  const showGroup = (together: boolean) => {
    const source = dragRef.current;
    const tile = dragEl.current;
    if (!source || !tile) return;
    tile
      .closest("section")
      ?.querySelectorAll<HTMLElement>(`li[data-card="${source.cardId}"]`)
      .forEach((copy) => {
        if (together || copy === tile) copy.setAttribute("data-dragging", "true");
        else copy.removeAttribute("data-dragging");
      });
  };

  const endDrag = () => {
    dragEl.current
      ?.closest("section")
      ?.querySelectorAll("li[data-dragging]")
      .forEach((copy) => copy.removeAttribute("data-dragging"));
    dragEl.current = null;
    dragRef.current = null;
    setOver(null);
  };
  const accepts = (section: DeckSection) => {
    const source = dragRef.current;
    if (source === null) return false;
    // Reordering inside a section only makes sense while it shows the built order.
    if (source.section === section) return sorts[section] === "built";
    return canMoveTo(source.cardId, section, extraIds);
  };
  const overTile = (event: DragEvent, section: DeckSection, cardId: number | null) => {
    if (!accepts(section)) {
      if (dragRef.current?.section === section && blockedSection !== section) setBlockedSection(section);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    if (over?.section !== section || over.cardId !== cardId) setOver({ section, cardId });
    showGroup(dragRef.current?.section === section);
  };
  const dropOn = (event: DragEvent, section: DeckSection, cardId: number | null) => {
    const source = dragRef.current;
    if (!source || !accepts(section)) return;
    event.preventDefault();
    event.stopPropagation();
    if (source.section === section) {
      onChange(reorderCard(doc, section, source.cardId, cardId));
      setBlockedSection(null);
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
        const sort = sorts[section];
        const cards =
          sort === "built"
            ? doc[section]
            : sortCards(doc[section], sort === "rank" && !rankOrder ? "built" : sort, {
                nameOf: (card) => displayName(card.card_id, card.name, catalog),
                rankOrder,
                labelOf: (card) => labelIndex(card, labels.get(card.card_id)),
              });
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
              {cards.length > 1 ? (
                <label className="deck-sort">
                  Sort
                  <select
                    aria-label={`Sort ${TITLES[section]}`}
                    value={sort}
                    onChange={(event) => chooseSort(section, event.target.value as DeckSort)}
                  >
                    {sortsFor(section).map((option) => (
                      <option key={option} value={option} disabled={option === "rank" && !rankOrder}>
                        {SORT_LABELS[option]}
                        {option === "rank" && !rankOrder ? " (rank cards first)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
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
            {section === "main" && cards.length > 0 ? (
              <div className="deck-spotlight" role="group" aria-label="Show cards with a label">
                {SPOTLIGHTS.map(({ key, label }) => {
                  const unknown = key === "brick" && labels.size === 0;
                  return (
                    <button
                      key={key}
                      type="button"
                      className={spotlight === key ? "chip on" : "chip"}
                      aria-pressed={spotlight === key}
                      disabled={unknown}
                      title={unknown ? "Define a Hand Goal to read which cards are Bricks" : undefined}
                      onClick={() => setSpotlight(key)}
                    >
                      {label} <span className="deck-spotlight-count">{mainCounts[key]}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            {blockedSection === section && sort !== "built" ? (
              <p className="deck-sort-hint" aria-live="polite">
                This section is sorted by {SORT_LABELS[sort]}, so cards cannot be dragged into a new order here.{" "}
                <button type="button" onClick={() => chooseSort(section, "built")}>
                  Use As built
                </button>
              </p>
            ) : null}
            {cards.length === 0 ? (
              <p className="empty">No cards in this section.</p>
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
                      data-card={card.card_id}
                      data-dim={
                        section === "main" && !matchesSpotlight(card, labels.get(card.card_id), spotlight)
                          ? "true"
                          : undefined
                      }
                      onDragOver={(event) => overTile(event, section, card.card_id)}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", name);
                        dragRef.current = { section, cardId: card.card_id };
                        const source = event.currentTarget;
                        dragEl.current = source;
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
                        {section !== "extra" ? <RolePips card={card} derived={labels.get(card.card_id)} /> : null}
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
                        derived={labels.get(card.card_id) ?? null}
                        catalog={catalog}
                        extraIds={extraIds}
                        banlist={banlist}
                        format={format}
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
