import { describe, expect, it } from "vitest";
import { canMoveTo, moveCopy, reorderCard } from "./deckMove";
import { addCard, createDocument, type MappingCard } from "./document";

const card = (card_id: number, quantity = 1, roles: MappingCard["taxonomy"]["roles"] = []): MappingCard => ({
  card_id,
  quantity,
  taxonomy: { roles, opening_quality: { going_first: null, going_second: null } },
});

function deck() {
  let doc = createDocument("t");
  doc = addCard(doc, "main", card(1, 2, ["starter"]));
  doc = addCard(doc, "main", card(2));
  doc = addCard(doc, "main", card(3));
  doc = addCard(doc, "extra", card(900));
  return doc;
}

const EXTRA = new Set([900]);

describe("reorderCard", () => {
  it("moves a row before another row", () => {
    expect(reorderCard(deck(), "main", 3, 1).main.map((c) => c.card_id)).toEqual([3, 1, 2]);
  });
  it("moves a row to the end", () => {
    expect(reorderCard(deck(), "main", 1, null).main.map((c) => c.card_id)).toEqual([2, 3, 1]);
  });
  it("ignores dropping a card on itself", () => {
    const doc = deck();
    expect(reorderCard(doc, "main", 2, 2)).toBe(doc);
  });
});

describe("moveCopy", () => {
  it("moves one copy and keeps the rest", () => {
    const moved = moveCopy(deck(), "main", "side", 1, EXTRA);
    expect(moved.main.find((c) => c.card_id === 1)?.quantity).toBe(1);
    const inSide = moved.side.find((c) => c.card_id === 1);
    expect(inSide?.quantity).toBe(1);
    expect(inSide?.taxonomy.roles).toEqual(["starter"]);
  });
  it("removes the row when the last copy leaves", () => {
    const moved = moveCopy(deck(), "main", "side", 2, EXTRA);
    expect(moved.main.some((c) => c.card_id === 2)).toBe(false);
  });
  it("merges into an existing row", () => {
    const once = moveCopy(deck(), "main", "side", 1, EXTRA);
    const twice = moveCopy(once, "main", "side", 1, EXTRA);
    expect(twice.side.find((c) => c.card_id === 1)?.quantity).toBe(2);
  });
  it("refuses an Extra Deck monster into Main and a Main card into Extra", () => {
    const doc = deck();
    expect(moveCopy(doc, "extra", "main", 900, EXTRA)).toBe(doc);
    expect(moveCopy(doc, "main", "extra", 2, EXTRA)).toBe(doc);
    expect(canMoveTo(900, "side", EXTRA)).toBe(true);
  });
});
