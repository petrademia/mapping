import type { Catalog } from "../lib/catalog";
import { displayName } from "../lib/catalog";
import type { MappingDocument } from "../lib/document";
import { addHitTarget, moveHitTarget, removeHitTarget, type HitTarget } from "../lib/handtrap";
import { IconButton } from "./IconButton";

interface Props {
  doc: MappingDocument;
  catalog: Catalog;
  onChange: (doc: MappingDocument) => void;
}

/**
 * The order the opponent tends to use a handtrap in. A handtrap's own list says what it
 * can stop; this list says which of those the opponent actually goes for first.
 */
export function HitPriorityEditor({ doc, catalog, onChange }: Props) {
  const names = new Map(doc.main.map((card) => [card.card_id, card.name] as const));
  const cardName = (cardId: number) => displayName(cardId, names.get(cardId), catalog);
  const label = (target: HitTarget): string =>
    target.kind === "card"
      ? cardName(target.card_id)
      : `${doc.groups.find((group) => group.id === target.group_id)?.name || "Untitled group"} (Group)`;
  const listed = (target: HitTarget) =>
    doc.hit_priority.some((existing) =>
      existing.kind === "card"
        ? target.kind === "card" && existing.card_id === target.card_id
        : target.kind === "group" && existing.group_id === target.group_id,
    );

  return (
    <section className="hit-priority" aria-label="Who the opponent goes for">
      <h3 className="panel-subhead">Who the opponent goes for</h3>
      <p className="note">
        Optional. List, in order, the cards or Groups the opponent tends to use a handtrap on
        first, such as Medius, or every route that ends at Medius's effect. Each handtrap goes to
        the first one on the list that it can stop and you hold, whether or not that breaks your
        plan. A card that is not listed is never hit by this opponent. The Scorecard shows this
        opponent next to the one who always stops the card that hurts most.
      </p>
      {doc.hit_priority.length === 0 ? (
        <p className="empty">No list yet: the opponent is only ever assumed to hit the card that hurts most.</p>
      ) : (
        <ol className="priority-list" aria-label="Priority list">
          {doc.hit_priority.map((target, index) => (
            <li key={target.kind === "card" ? `c${target.card_id}` : `g${target.group_id}`}>
              <span className="priority-rank">{index + 1}</span>
              <span className="priority-name">{label(target)}</span>
              <span className="priority-actions">
                <IconButton
                  icon="up"
                  label={`Move ${label(target)} up`}
                  disabled={index === 0}
                  onClick={() => onChange(moveHitTarget(doc, index, -1))}
                />
                <IconButton
                  icon="down"
                  label={`Move ${label(target)} down`}
                  disabled={index === doc.hit_priority.length - 1}
                  onClick={() => onChange(moveHitTarget(doc, index, 1))}
                />
                <IconButton
                  icon="x"
                  label={`Remove ${label(target)} from the list`}
                  onClick={() => onChange(removeHitTarget(doc, index))}
                />
              </span>
            </li>
          ))}
        </ol>
      )}
      <div className="row-actions">
        <select
          aria-label="Add a card to the priority list"
          value=""
          onChange={(event) => {
            const id = Number(event.target.value);
            if (id > 0) onChange(addHitTarget(doc, { kind: "card", card_id: id }));
          }}
        >
          <option value="">Add a card...</option>
          {doc.main
            .filter((card) => !listed({ kind: "card", card_id: card.card_id }))
            .map((card) => (
              <option key={card.card_id} value={card.card_id}>
                {cardName(card.card_id)}
              </option>
            ))}
        </select>
        <select
          aria-label="Add a Group to the priority list"
          value=""
          onChange={(event) => {
            if (event.target.value) onChange(addHitTarget(doc, { kind: "group", group_id: event.target.value }));
          }}
        >
          <option value="">Add a Group...</option>
          {doc.groups
            .filter((group) => !listed({ kind: "group", group_id: group.id }))
            .map((group) => (
              <option key={group.id} value={group.id}>
                {group.name || "Untitled group"}
              </option>
            ))}
        </select>
      </div>
    </section>
  );
}
