import { describe, expect, it } from "vitest";
import { createDocument, type MappingDocument } from "./document";
import { computeGoalSurvival } from "./goalSurvival";
import { scorecard } from "./scorecard";

const none = { going_first: null, going_second: null } as const;

/** 30 cards: card 1 (x3) and card 2 (x2) are each a one-card goal, a pair goal needs both, card 9 is filler. */
function deck(extra: Partial<MappingDocument> = {}): MappingDocument {
  const card = (card_id: number, quantity: number, roles: string[] = []) => ({
    card_id,
    quantity,
    taxonomy: { roles, opening_quality: none },
  });
  const need = (card_id: number) => ({ id: `r${card_id}`, kind: "card", card_id, op: "gte", count: 1 });
  return {
    ...createDocument("t"),
    main: [card(1, 3), card(2, 2), card(9, 25)],
    hand_conditions: [
      { id: "one", name: "card 1", requirements: [need(1)], excludes: [] },
      { id: "two", name: "card 2", requirements: [need(2)], excludes: [] },
      { id: "both", name: "cards 1 and 2", requirements: [need(1), need(2)], excludes: [] },
    ],
    hand_condition_sets: [
      { id: "g-one", name: "Card 1", condition_ids: ["one"], aggregation: "any" },
      { id: "g-either", name: "Card 1 or 2", condition_ids: ["one", "two"], aggregation: "any" },
      { id: "g-both", name: "Both", condition_ids: ["both"], aggregation: "any" },
      { id: "g-empty", name: "Nothing yet", condition_ids: [], aggregation: "any" },
    ],
    ...extra,
  } as unknown as MappingDocument;
}

function survival(doc: MappingDocument, turnOrder: "going_first" | "going_second") {
  const result = computeGoalSurvival({ doc, turnOrder });
  if ("error" in result) throw new Error(result.error);
  return result.survival;
}

describe("how many interruptions each Hand Goal can take", () => {
  it("gives the Scorecard's own interruption figures, for every goal in one pass", () => {
    const doc = deck();
    for (const [turnOrder, side] of [
      ["going_first", "first"],
      ["going_second", "second"],
    ] as const) {
      const all = survival(doc, turnOrder);
      for (const id of ["g-one", "g-either", "g-both"]) {
        const card = scorecard(doc, id);
        if ("error" in card) throw new Error(card.error);
        expect(all[id]!.afterOne).toBeCloseTo(card[side].interruptions[1]!, 12);
        expect(all[id]!.afterTwo).toBeCloseTo(card[side].interruptions[2]!, 12);
      }
    }
  });

  it("leaves out a goal with no Hand Condition", () => {
    expect(survival(deck(), "going_first")["g-empty"]).toBeUndefined();
  });

  it("falls as more interruptions land, and a goal needing two cards takes fewer", () => {
    const all = survival(deck(), "going_first");
    expect(all["g-one"]!.afterTwo!).toBeLessThanOrEqual(all["g-one"]!.afterOne!);
    // A hand with two routes (card 1 or card 2) survives a stop that a one-route hand does not.
    expect(all["g-either"]!.afterOne!).toBeGreaterThan(all["g-one"]!.afterOne!);
    // Needing both cards, only a hand holding two copies of each survives a stop: a very small chance.
    expect(all["g-both"]!.afterOne!).toBeGreaterThan(0);
    expect(all["g-both"]!.afterOne!).toBeLessThan(0.01);
  });

  it("has nothing to say with no Hand Goal", () => {
    const doc = { ...deck(), hand_condition_sets: [] };
    expect(survival(doc, "going_first")).toEqual({});
  });
});
