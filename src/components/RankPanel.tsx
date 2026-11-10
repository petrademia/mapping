import { useState, type DragEvent, type KeyboardEvent } from "react";
import { observedCards } from "../lib/analysisContext";
import { computeCardImpact } from "../lib/cardImpact";
import {
  isRanked,
  moveItem,
  RANK_CONTEXTS,
  rankFor,
  resetRank,
  setRank,
  type RankContext,
} from "../lib/cardRank";
import type { Catalog } from "../lib/catalog";
import { displayName } from "../lib/catalog";
import { sectionSize, type MappingDocument } from "../lib/document";
import { groupsToMembership } from "../lib/handCondition";
import { CardFrame } from "./HandImages";

interface Props {
  /** The Pre-Side document: a rank orders the cards of the deck list. */
  doc: MappingDocument;
  catalog: Catalog;
  onChange: (doc: MappingDocument) => void;
}

interface ListProps extends Props {
  context: RankContext;
  label: string;
}

function RankList({ doc, catalog, onChange, context, label }: ListProps) {
  const [grabbed, setGrabbed] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [announce, setAnnounce] = useState("");

  const order = rankFor(doc, context);
  const byId = new Map(doc.main.map((card) => [card.card_id, card]));
  const ranked = isRanked(doc, context);
  const nameOf = (id: number) => {
    const card = byId.get(id);
    return card ? displayName(card.card_id, card.name, catalog) : String(id);
  };

  function place(from: number, to: number) {
    if (from === to) return;
    const next = moveItem(order, from, to);
    onChange(setRank(doc, context, next));
    const id = order[from]!;
    const position = next.indexOf(id) + 1;
    setAnnounce(`Moved ${nameOf(id)} to position ${position} of ${next.length}`);
  }

  function endDrag() {
    setDragIndex(null);
    setOverIndex(null);
  }

  function onTileClick(id: number, index: number) {
    if (grabbed === null) {
      setGrabbed(id);
      setAnnounce(`Picked up ${nameOf(id)}. Click where it should go, or use the arrow keys.`);
    } else if (grabbed === id) {
      setGrabbed(null);
    } else {
      place(order.indexOf(grabbed), index);
      setGrabbed(null);
    }
  }

  function onTileKey(event: KeyboardEvent<HTMLButtonElement>, id: number, index: number) {
    if (grabbed !== id) return;
    const last = order.length - 1;
    const target =
      event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? index - 1
        : event.key === "ArrowRight" || event.key === "ArrowDown"
          ? index + 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (event.key === "Escape") {
      event.preventDefault();
      setGrabbed(null);
      return;
    }
    if (target === null) return;
    event.preventDefault();
    place(index, Math.max(0, Math.min(last, target)));
  }

  function onDrop(event: DragEvent<HTMLButtonElement>, to: number) {
    event.preventDefault();
    if (dragIndex !== null) place(dragIndex, to);
    endDrag();
  }

  // Seed from the Card Impact order of the first Hand Goal that has conditions.
  const goal =
    doc.hand_condition_sets.find((set) => set.id === doc.engine_access_set_id && set.condition_ids.length > 0) ??
    doc.hand_condition_sets.find((set) => set.condition_ids.length > 0) ??
    null;
  const sample = observedCards(
    context === "going_first"
      ? { turn_order: "going_first", observation_point: "opening_hand" }
      : { turn_order: "going_second", observation_point: "first_turn" },
    doc.analysis.opening_hand_size,
  );
  const canSeed = goal !== null && sectionSize(doc.main) >= sample;

  function seedFromImpact() {
    if (!goal) return;
    try {
      const impact = computeCardImpact(
        doc.main,
        sample,
        doc.hand_conditions,
        goal,
        groupsToMembership(doc.groups),
      );
      onChange(setRank(doc, context, impact.rows.map((row) => row.card_id)));
    } catch {
      /* hand larger than the deck: leave the order as it is */
    }
  }

  return (
    <section className="rank-list-block" aria-label={`${label} ranking`}>
      <header>
        <h3 className="panel-subhead">{label}</h3>
        <span className="rank-actions">
          {canSeed ? (
            <button
              type="button"
              title={`Order by Card Impact for ${goal!.name}`}
              onClick={seedFromImpact}
            >
              Order by impact
            </button>
          ) : null}
          <button type="button" onClick={() => onChange(resetRank(doc, context))} disabled={!ranked}>
            Reset
          </button>
        </span>
      </header>
      {ranked ? null : <p className="note">Not ranked yet: showing deck order.</p>}
      <ol className="rank-grid">
        {order.map((id, index) => {
          const card = byId.get(id);
          if (!card) return null;
          const name = nameOf(id);
          const classes = [
            "rank-tile",
            grabbed === id ? "grabbed" : "",
            dragIndex === index ? "dragging" : "",
            overIndex === index && dragIndex !== null && dragIndex !== index ? "drop-target" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <li key={id}>
              <button
                type="button"
                className={classes}
                draggable
                aria-pressed={grabbed === id}
                aria-label={`${name}, rank ${index + 1} of ${order.length}`}
                title={name}
                onClick={() => onTileClick(id, index)}
                onKeyDown={(event) => onTileKey(event, id, index)}
                onDragStart={(event) => {
                  setDragIndex(index);
                  setGrabbed(null);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", String(id));
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  if (overIndex !== index) setOverIndex(index);
                }}
                onDrop={(event) => onDrop(event, index)}
                onDragEnd={endDrag}
              >
                <CardFrame cardId={card.card_id} name={name} />
                <span className="rank-num" aria-hidden="true">
                  {index + 1}
                </span>
                {card.quantity > 1 ? (
                  <span className="rank-copies" aria-hidden="true">
                    x{card.quantity}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
      <p className="visually-hidden" role="status">
        {announce}
      </p>
    </section>
  );
}

/**
 * Two card grids in rank order, one per turn order, best card first. The big
 * number on each card is its rank. Click a card, then click where it should go;
 * or drag it; or press Space on a card and use the arrow keys. It is your
 * preference order. It stores only the order; the rank score (see rankScore.ts)
 * turns it into weights for scoring hands, and no probability reads it.
 */
export function RankPanel({ doc, catalog, onChange }: Props) {
  return (
    <section className="panel rank-panel">
      <header>
        <h2>Card Rank</h2>
        <p>{sectionSize(doc.main)} cards</p>
      </header>
      <p className="note">
        Order the cards you most want to draw, best first, for going first and
        going second. Click a card, then click where it should go, or drag it.
        With the keyboard, press Space on a card and use the arrow keys.
      </p>
      {doc.main.length === 0 ? (
        <p className="empty">Add Main Deck cards to rank them.</p>
      ) : (
        <div className="rank-columns">
          {RANK_CONTEXTS.map((entry) => (
            <RankList
              key={entry.key}
              doc={doc}
              catalog={catalog}
              onChange={onChange}
              context={entry.key}
              label={entry.label}
            />
          ))}
        </div>
      )}
    </section>
  );
}
