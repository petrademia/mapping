import { describe, expect, it } from "vitest";
import { createDocument, type MappingDocument } from "./document";
import { handVersus } from "./handtrapVersus";

const taxonomy = { roles: [], opening_quality: { going_first: null, going_second: null } };

function docWith(): MappingDocument {
  return {
    ...createDocument("t"),
    main: [
      { card_id: 1, quantity: 3, taxonomy },
      { card_id: 2, quantity: 3, taxonomy },
    ],
    hand_conditions: [
      { id: "c", name: "needs 1", requirements: [{ kind: "card", card_id: 1, op: "gte", count: 1 }] },
    ],
    hand_condition_sets: [{ id: "g", name: "Goal", condition_ids: ["c"] }],
    handtraps: [{ id: "h", name: "Veiler", hits: [1] }],
  } as unknown as MappingDocument;
}

describe("handVersus", () => {
  it("breaks a goal that rests on one copy of a hit card", () => {
    const [goal] = handVersus(docWith(), { 1: 1, 2: 4 }, ["h"]);
    expect(goal).toMatchObject({ holds: true, survives: false, negated: [1] });
  });
  it("survives when the hit card has a spare copy or no handtrap is in play", () => {
    expect(handVersus(docWith(), { 1: 2, 2: 3 }, ["h"])[0]).toMatchObject({ survives: true });
    expect(handVersus(docWith(), { 1: 1, 2: 4 }, [])[0]).toMatchObject({ survives: true });
  });
  it("does not survive what already fails", () => {
    expect(handVersus(docWith(), { 2: 5 }, ["h"])[0]).toMatchObject({
      holds: false,
      survives: false,
      negated: [],
    });
  });
});
