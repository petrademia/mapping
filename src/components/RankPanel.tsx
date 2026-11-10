import { useState, type DragEvent } from "react";
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
import { CardThumb } from "./CardThumb";
import { Icon, IconButton } from "./IconButton";

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
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const order = rankFor(doc, context);
  const byId = new Map(doc.main.map((card) => [card.card_id, card]));
  const ranked = isRanked(doc, context);

  const commit = (next: number[]) => onChange(setRank(doc, context, next));
  const endDrag = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  function onDrop(event: DragEvent<HTMLLIElement>, to: number) {
    event.preventDefault();
    if (dragIndex !== null && dragIndex !== to) commit(moveItem(order, dragIndex, to));
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
      commit(impact.rows.map((row) => row.card_id));
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
      {ranked ? null : (
        <p className="note">Not ranked yet: showing deck order. Drag a card to start.</p>
      )}
      <ol className="rank-list">
        {order.map((id, index) => {
          const card = byId.get(id);
          if (!card) return null;
          const name = displayName(card.card_id, card.name, catalog);
          const classes = [
            dragIndex === index ? "dragging" : "",
            overIndex === index && dragIndex !== null && dragIndex !== index ? "drop-target" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <li
              key={id}
              className={classes || undefined}
              draggable
              onDragStart={(event) => {
                setDragIndex(index);
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
              <span className="rank-grip" aria-hidden="true">
                <Icon name="grip" />
              </span>
              <span className="rank-pos">{index + 1}</span>
              <CardThumb cardId={card.card_id} name={name} />
              <span className="rank-name">
                {name}
                <span className="rank-copies">x{card.quantity}</span>
              </span>
              <IconButton
                icon="up"
                label={`Move ${name} up in ${label}`}
                disabled={index === 0}
                onClick={() => commit(moveItem(order, index, index - 1))}
              />
              <IconButton
                icon="down"
                label={`Move ${name} down in ${label}`}
                disabled={index === order.length - 1}
                onClick={() => commit(moveItem(order, index, index + 1))}
              />
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * Two draggable lists, one per turn order, best card first. A preference order
 * you set by hand: it carries no weights and no probability reads it. Each
 * card also has up and down buttons, so reordering works from the keyboard.
 */
export function RankPanel({ doc, catalog, onChange }: Props) {
  return (
    <section className="panel rank-panel">
      <header>
        <h2>Card Rank</h2>
        <p>{sectionSize(doc.main)} cards</p>
      </header>
      <p className="note">
        Put the cards you most want to draw first. Keep a separate order for
        going first and going second. It is your preference order, not a score.
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
