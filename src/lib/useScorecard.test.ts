import { describe, expect, it } from "vitest";
import { addConfiguration } from "./configuration";
import { createDocument, type MappingDocument } from "./document";
import { contentKey } from "./useScorecard";

const doc = (): MappingDocument =>
  ({
    ...createDocument("deck"),
    main: [
      { card_id: 2, quantity: 2, taxonomy: { roles: [], opening_quality: { going_first: null, going_second: null } } },
      { card_id: 1, quantity: 3, taxonomy: { roles: ["starter"], opening_quality: { going_first: null, going_second: null } } },
    ],
  }) as MappingDocument;

describe("what makes the Scorecard count again", () => {
  it("ignores the name and the order of the cards", () => {
    const a = doc();
    const b = { ...doc(), name: "renamed", main: [...a.main].reverse() };
    expect(contentKey(b)).toBe(contentKey(a));
  });

  it("ignores adding a Post-Side or opening one, since the cards scored are the same", () => {
    const base = doc();
    const withPostSide = addConfiguration(base);
    expect(withPostSide.configurations.length).toBeGreaterThan(0);
    expect(contentKey(withPostSide)).toBe(contentKey(base));
  });

  it("still changes when the cards or the roles change", () => {
    const base = doc();
    const fewer = { ...base, main: base.main.map((card) => (card.card_id === 1 ? { ...card, quantity: 2 } : card)) };
    const retagged = {
      ...base,
      main: base.main.map((card) => (card.card_id === 2 ? { ...card, taxonomy: { ...card.taxonomy, roles: ["interaction"] } } : card)),
    } as MappingDocument;
    expect(contentKey(fewer)).not.toBe(contentKey(base));
    expect(contentKey(retagged)).not.toBe(contentKey(base));
  });
});
