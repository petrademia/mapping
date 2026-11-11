import { describe, expect, it } from "vitest";
import { allowedCopies, copiesInDeck, deckViolations, limitLabel, type Banlist } from "./banlist";
import { addCard, createDocument, type MappingCard } from "./document";

const ban: Banlist = {
  ocg: { name: "test", limits: { "1": 0, "2": 1, "3": 2 } },
};

const card = (card_id: number, quantity: number): MappingCard => ({
  card_id,
  quantity,
  taxonomy: { roles: [], opening_quality: { going_first: null, going_second: null } },
});

describe("allowedCopies", () => {
  it("defaults to 3 and honours the list", () => {
    expect(allowedCopies(ban, "ocg", 99)).toBe(3);
    expect(allowedCopies(ban, "ocg", 1)).toBe(0);
    expect(allowedCopies(ban, "ocg", 2)).toBe(1);
    expect(allowedCopies(ban, "ocg", 3)).toBe(2);
  });
  it("ignores the list when no list is chosen or it is not loaded", () => {
    expect(allowedCopies(ban, "none", 1)).toBe(3);
    expect(allowedCopies({}, "tcg", 1)).toBe(3);
  });
});

describe("copies across the whole deck", () => {
  it("counts Main, Extra and Side together", () => {
    let doc = createDocument("t");
    doc = addCard(doc, "main", card(5, 2));
    doc = addCard(doc, "side", card(5, 1));
    expect(copiesInDeck(doc, 5)).toBe(3);
    expect(deckViolations(doc, ban, "ocg")).toEqual([]);
    doc = addCard(doc, "side", card(5, 1));
    expect(deckViolations(doc, ban, "ocg")).toEqual([{ card_id: 5, copies: 4, allowed: 3 }]);
  });
  it("flags forbidden and limited cards", () => {
    let doc = createDocument("t");
    doc = addCard(doc, "main", card(1, 1));
    doc = addCard(doc, "main", card(2, 2));
    expect(deckViolations(doc, ban, "ocg").map((v) => v.card_id).sort()).toEqual([1, 2]);
  });
});

describe("limitLabel", () => {
  it("names each restriction", () => {
    expect([0, 1, 2, 3].map(limitLabel)).toEqual(["Forbidden", "Limited", "Semi-limited", ""]);
  });
});
