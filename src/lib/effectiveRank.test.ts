import { describe, expect, it } from "vitest";
import { setRank } from "./cardRank";
import { effectiveRank } from "./effectiveRank";
import {
  addCard,
  createDocument,
  upsertHandCondition,
  upsertHandConditionSet,
  type MappingCard,
  type MappingDocument,
} from "./document";

const card = (card_id: number, quantity = 1): MappingCard => ({
  card_id,
  quantity,
  taxonomy: { roles: [], opening_quality: { going_first: null, going_second: null } },
});

function deck(): MappingDocument {
  let doc = createDocument("t");
  for (let i = 1; i <= 40; i += 1) doc = addCard(doc, "main", card(i));
  return doc;
}

function withGoal(doc: MappingDocument): MappingDocument {
  let next = upsertHandCondition(doc, {
    id: "c",
    name: "needs 7",
    requirements: [{ kind: "card", card_id: 7, op: "gte", count: 1 }],
    excludes: [],
    distinct_constraints: [],
  });
  next = upsertHandConditionSet(next, { id: "g", name: "Goal", condition_ids: ["c"], aggregation: "any" });
  return next;
}

describe("effectiveRank", () => {
  it("is null with no ranking and no Hand Goal", () => {
    expect(effectiveRank(deck(), "going_first")).toBeNull();
  });

  it("falls back to the Card Impact order until the cards are ranked", () => {
    const result = effectiveRank(withGoal(deck()), "going_first");
    expect(result?.source).toBe("impact");
    // The one card the goal needs leads the order.
    expect(result?.order[0]).toBe(7);
    expect(result?.order).toHaveLength(40);
  });

  it("uses the user's own ranking once it exists", () => {
    const ranked = setRank(withGoal(deck()), "going_first", [3, 2, 1]);
    const result = effectiveRank(ranked, "going_first");
    expect(result?.source).toBe("rank");
    expect(result?.order.slice(0, 3)).toEqual([3, 2, 1]);
  });
});
