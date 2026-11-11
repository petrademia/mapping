import type { Catalog } from "../lib/catalog";
import { displayName } from "../lib/catalog";
import type { MappingCard, MappingDocument } from "../lib/document";
import type { ConditionRequirement } from "../lib/handExplorer";
import type { HandCondition } from "../lib/handCondition";
import { CardFrame } from "./HandImages";

interface PickerProps {
  /** Main Deck rows; one tile per distinct card, with its copy count. */
  deck: readonly MappingCard[];
  catalog: Catalog;
  selected: ReadonlySet<number>;
  onToggle: (cardId: number) => void;
  label: string;
}

/**
 * The Main Deck as card art for choosing cards: a selected card gets a brass
 * box and the rest dim. One tile per card (the number is its copies in Main),
 * because Groups and Hand Conditions talk about cards, not copies.
 */
export function DeckPicker({ deck, catalog, selected, onToggle, label }: PickerProps) {
  if (deck.length === 0) return <p className="empty">Add main-deck cards first.</p>;
  const any = selected.size > 0;
  return (
    <ul className="pick-grid" aria-label={label}>
      {deck.map((card) => {
        const name = displayName(card.card_id, card.name, catalog);
        const on = selected.has(card.card_id);
        return (
          <li key={card.card_id}>
            <button
              type="button"
              className={on ? "pick-tile on" : any ? "pick-tile dim" : "pick-tile"}
              aria-pressed={on}
              aria-label={`${name}, ${card.quantity} ${card.quantity === 1 ? "copy" : "copies"}`}
              title={name}
              onClick={() => onToggle(card.card_id)}
            >
              <CardFrame cardId={card.card_id} name={name} />
              {card.quantity > 1 ? <span className="pick-qty">×{card.quantity}</span> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

interface StripProps {
  cardIds: readonly number[];
  deck: readonly MappingCard[];
  catalog: Catalog;
  /** Tiles shown before "+N". */
  max?: number;
  label?: string;
}

/** A small row of card art; names are on hover. */
export function CardStrip({ cardIds, deck, catalog, max = 8, label }: StripProps) {
  if (cardIds.length === 0) return null;
  const shown = cardIds.slice(0, max);
  return (
    <ul className="card-strip" aria-label={label}>
      {shown.map((id) => {
        const card = deck.find((item) => item.card_id === id);
        const name = displayName(id, card?.name, catalog);
        return (
          <li key={id} title={name}>
            <CardFrame cardId={id} name={name} />
          </li>
        );
      })}
      {cardIds.length > max ? <li className="card-strip-more">+{cardIds.length - max}</li> : null}
    </ul>
  );
}

/** The Main Deck cards one predicate counts: the card, everyone with a Role, or a Group's members. */
export function requirementCards(
  requirement: ConditionRequirement,
  doc: MappingDocument,
): number[] {
  if (requirement.kind === "card") {
    return doc.main.some((card) => card.card_id === requirement.card_id) ? [requirement.card_id] : [];
  }
  if (requirement.kind === "role") {
    return doc.main
      .filter((card) => card.taxonomy.roles.includes(requirement.role))
      .map((card) => card.card_id);
  }
  const members = new Set(doc.groups.find((group) => group.id === requirement.group_id)?.card_ids ?? []);
  return doc.main.filter((card) => members.has(card.card_id)).map((card) => card.card_id);
}

/** Every Main Deck card a Hand Condition reads, once each, in deck order. */
export function conditionCards(condition: HandCondition, doc: MappingDocument): number[] {
  const ids = new Set<number>();
  for (const requirement of [...condition.requirements, ...condition.excludes]) {
    for (const id of requirementCards(requirement, doc)) ids.add(id);
  }
  return doc.main.filter((card) => ids.has(card.card_id)).map((card) => card.card_id);
}
