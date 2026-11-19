import type { MappingCard, DeckSection } from "./document";

/**
 * Ways to order a deck section on screen. A sort is a view setting only: it is
 * never saved into the deck and never changes the exported lists.
 */
export type DeckSort = "built" | "label" | "rank" | "name";

export const SORT_LABELS: Record<DeckSort, string> = {
  built: "As built",
  label: "Label",
  rank: "Card Rank",
  name: "Name",
};

/** Sorts that make sense for a section: Extra Deck cards have no labels or rank. */
export function sortsFor(section: DeckSection): DeckSort[] {
  if (section === "main") return ["built", "label", "rank", "name"];
  if (section === "side") return ["built", "label", "name"];
  return ["built", "name"];
}

/**
 * A sort chosen before Role and Label became one. "role" was the only sort that has gone, and
 * Label is what replaced it.
 */
export function upgradeSort(saved: string | undefined): string | undefined {
  return saved === "role" ? "label" : saved;
}

export interface SortContext {
  /** Display name of a card. */
  nameOf: (card: MappingCard) => string;
  /** Rank order (best first) for the current turn order, or null until ranked. */
  rankOrder: readonly number[] | null;
  /** Where a card sorts by label (Starter, Extender, Interaction, Breaker, Brick, none); needed for the Label sort. */
  labelOf?: (card: MappingCard) => number;
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
    if (sort === "label") return context.labelOf?.(card) ?? 0;
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
