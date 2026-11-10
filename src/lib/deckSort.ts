import { ROLES } from "./taxonomy";
import type { MappingCard, DeckSection } from "./document";

/**
 * Ways to order a deck section on screen. A sort is a view setting only: it is
 * never saved into the deck and never changes the exported lists.
 */
export type DeckSort = "built" | "role" | "rank" | "name";

export const SORT_LABELS: Record<DeckSort, string> = {
  built: "As built",
  role: "Role",
  rank: "Card Rank",
  name: "Name",
};

/** Sorts that make sense for a section: Extra Deck cards have no roles or rank. */
export function sortsFor(section: DeckSection): DeckSort[] {
  if (section === "main") return ["built", "role", "rank", "name"];
  if (section === "side") return ["built", "role", "name"];
  return ["built", "name"];
}

export interface SortContext {
  /** Display name of a card. */
  nameOf: (card: MappingCard) => string;
  /** Rank order (best first) for the current turn order, or null until ranked. */
  rankOrder: readonly number[] | null;
}

function roleIndex(card: MappingCard): number {
  const indexes = card.taxonomy.roles.map((role) => ROLES.indexOf(role)).filter((i) => i >= 0);
  return indexes.length === 0 ? ROLES.length : Math.min(...indexes);
}

/** A new array in the chosen order; ties keep the order the deck was built in. */
export function sortCards(
  cards: readonly MappingCard[],
  sort: DeckSort,
  context: SortContext,
): MappingCard[] {
  const indexed = cards.map((card, index) => ({ card, index }));
  const position = new Map<number, number>();
  context.rankOrder?.forEach((id, i) => position.set(id, i));
  const key = ({ card }: { card: MappingCard }): number | string => {
    if (sort === "role") return roleIndex(card);
    if (sort === "rank") return position.get(card.card_id) ?? Number.MAX_SAFE_INTEGER;
    if (sort === "name") return context.nameOf(card).toLocaleLowerCase();
    return 0;
  };
  if (sort === "built") return [...cards];
  indexed.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    const order =
      typeof ka === "number" && typeof kb === "number"
        ? ka - kb
        : String(ka).localeCompare(String(kb));
    return order || a.index - b.index;
  });
  return indexed.map((item) => item.card);
}
