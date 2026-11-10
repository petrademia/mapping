import {
  addCard,
  removeCard,
  setQuantity,
  type DeckSection,
  type MappingDocument,
} from "./document";
import type { ExtraDeckIds } from "./sectionRouting";

/**
 * Whether one copy of a card may move to a section. Extra Deck monsters only
 * live in Extra or Side, and every other card only in Main or Side. With no
 * Extra Deck data loaded nothing is refused on kind.
 */
export function canMoveTo(
  cardId: number,
  to: DeckSection,
  extraIds: ExtraDeckIds,
): boolean {
  if (to === "side" || extraIds.size === 0) return true;
  return extraIds.has(cardId) === (to === "extra");
}

/** Put the card's row before another card's row in the same section. */
export function reorderCard(
  doc: MappingDocument,
  section: DeckSection,
  cardId: number,
  beforeCardId: number | null,
): MappingDocument {
  const cards = doc[section];
  const moving = cards.find((card) => card.card_id === cardId);
  if (!moving || cardId === beforeCardId) return doc;
  const rest = cards.filter((card) => card.card_id !== cardId);
  const at =
    beforeCardId === null ? rest.length : rest.findIndex((card) => card.card_id === beforeCardId);
  if (at < 0) return doc;
  rest.splice(at, 0, moving);
  return { ...doc, [section]: rest };
}

/** Move one copy to another section, keeping its roles and opening quality. */
export function moveCopy(
  doc: MappingDocument,
  from: DeckSection,
  to: DeckSection,
  cardId: number,
  extraIds: ExtraDeckIds,
): MappingDocument {
  if (from === to || !canMoveTo(cardId, to, extraIds)) return doc;
  const card = doc[from].find((item) => item.card_id === cardId);
  if (!card) return doc;
  const removed =
    card.quantity > 1
      ? setQuantity(doc, from, cardId, card.quantity - 1)
      : removeCard(doc, from, cardId);
  return addCard(removed, to, { ...card, quantity: 1 });
}
