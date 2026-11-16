import { describe, expect, it } from "vitest";
import type { MappingCard } from "./document";
import { analyzeHandConditions, type HandConditionLike } from "./handExplorer";

const card = (card_id: number, quantity: number): MappingCard => ({
  card_id,
  quantity,
  taxonomy: { roles: [], opening_quality: { going_first: null, going_second: null } },
});

const deck = [card(1, 3), card(2, 2), card(3, 5)];
const conditions: HandConditionLike[] = [
  { id: "a", name: "a", requirements: [{ kind: "card", card_id: 1, op: "gte", count: 1 }] },
];
const sets = [{ id: "s", name: "s", condition_ids: ["a"] }];

describe("analyzeHandConditions shares its work", () => {
  it("gives the same analysis object for the same deck, hand size and conditions", () => {
    const first = analyzeHandConditions(deck, 3, conditions, sets, new Map(), "going_first");
    const again = analyzeHandConditions(
      deck.map((c) => ({ ...c })),
      3,
      conditions.map((c) => ({ ...c })),
      sets.map((s) => ({ ...s })),
      new Map(),
      "going_first",
    );
    expect(again).toBe(first);
  });

  it("works out a new analysis when anything it reads changes", () => {
    const base = analyzeHandConditions(deck, 3, conditions, sets, new Map(), "going_first");
    expect(analyzeHandConditions([card(1, 3), card(2, 2), card(3, 4)], 3, conditions, sets, new Map(), "going_first")).not.toBe(base);
    expect(analyzeHandConditions(deck, 4, conditions, sets, new Map(), "going_first")).not.toBe(base);
    expect(analyzeHandConditions(deck, 3, conditions, sets, new Map(), "going_second")).not.toBe(base);
    const changed: HandConditionLike[] = [
      { id: "a", name: "a", requirements: [{ kind: "card", card_id: 1, op: "gte", count: 2 }] },
    ];
    const other = analyzeHandConditions(deck, 3, changed, sets, new Map(), "going_first");
    expect(other).not.toBe(base);
    // And the numbers really differ: needing two copies is rarer than needing one.
    expect(other.sets[0]!.union).toBeLessThan(base.sets[0]!.union);
  });

  it("does not share the reference paths used by tests", () => {
    const shared = analyzeHandConditions(deck, 3, conditions, sets, new Map(), "going_first");
    const reference = analyzeHandConditions(deck, 3, conditions, sets, new Map(), "going_first", { compress: false });
    expect(reference).not.toBe(shared);
    expect(reference.sets[0]!.union).toBeCloseTo(shared.sets[0]!.union, 12);
  });

  it("tells groups apart by their members, not by their order", () => {
    const withGroup: HandConditionLike[] = [
      { id: "g", name: "g", requirements: [{ kind: "group", group_id: "x", op: "gte", count: 1 }] },
    ];
    const groupSets = [{ id: "gs", name: "gs", condition_ids: ["g"] }];
    const one = analyzeHandConditions(deck, 3, withGroup, groupSets, new Map([["x", new Set([1])]]), "going_first");
    const same = analyzeHandConditions(deck, 3, withGroup, groupSets, new Map([["x", new Set([1])]]), "going_first");
    const wider = analyzeHandConditions(deck, 3, withGroup, groupSets, new Map([["x", new Set([1, 2])]]), "going_first");
    expect(same).toBe(one);
    expect(wider).not.toBe(one);
    expect(wider.sets[0]!.union).toBeGreaterThan(one.sets[0]!.union);
  });
});
