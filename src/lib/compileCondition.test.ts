import { describe, expect, it } from "vitest";
import type { MappingCard } from "./document";
import { compileConditionHolds, forEachHandComposition, handConditionHolds, type HandConditionLike } from "./handExplorer";
import type { Role } from "./taxonomy";

const card = (card_id: number, quantity: number, roles: Role[] = []): MappingCard => ({
  card_id,
  quantity,
  taxonomy: { roles, opening_quality: { going_first: null, going_second: null } },
});

const deck = [card(1, 3, ["interaction"]), card(2, 2), card(3, 2, ["interaction"]), card(4, 1), card(5, 4), card(6, 2)];
const groups = new Map<string, ReadonlySet<number>>([
  ["g", new Set([2, 3])],
  ["empty", new Set<number>()],
]);

const conditions: HandConditionLike[] = [
  { id: "card", name: "card", requirements: [{ kind: "card", card_id: 1, op: "gte", count: 2 }] },
  { id: "missing", name: "missing card", requirements: [{ kind: "card", card_id: 99, op: "gte", count: 1 }] },
  { id: "missing0", name: "missing card, none", requirements: [{ kind: "card", card_id: 99, op: "eq", count: 0 }] },
  { id: "group", name: "group", requirements: [{ kind: "group", group_id: "g", op: "gte", count: 2 }] },
  { id: "empty-group", name: "empty group", requirements: [{ kind: "group", group_id: "empty", op: "lte", count: 0 }] },
  { id: "unknown-group", name: "unknown group", requirements: [{ kind: "group", group_id: "nope", op: "eq", count: 0 }] },
  { id: "role", name: "role", requirements: [{ kind: "role", role: "interaction", op: "gt", count: 1 }] },
  {
    id: "excludes",
    name: "excludes",
    requirements: [{ kind: "card", card_id: 5, op: "gte", count: 1 }],
    excludes: [{ kind: "group", group_id: "g", op: "gte", count: 1 }],
  },
  { id: "none", name: "no requirements", requirements: [] },
  {
    id: "mixed",
    name: "mixed operators",
    requirements: [
      { kind: "card", card_id: 6, op: "neq", count: 1 },
      { kind: "role", role: "interaction", op: "lt", count: 3 },
      { kind: "card", card_id: 4, op: "lte", count: 0 },
    ],
  },
];

describe("compileConditionHolds", () => {
  for (const condition of conditions) {
    it(`agrees with handConditionHolds on every hand: ${condition.name}`, () => {
      const compiled = compileConditionHolds(deck, condition, groups);
      let checked = 0;
      let holding = 0;
      for (const size of [3, 5]) {
        forEachHandComposition(deck, size, (hand) => {
          const expected = handConditionHolds(hand, deck, condition, groups);
          expect(compiled(hand)).toBe(expected);
          checked += 1;
          if (expected) holding += 1;
        });
      }
      expect(checked).toBeGreaterThan(50);
      // Not trivially true or false for the conditions that can be either.
      if (["card", "group", "role", "excludes", "mixed"].includes(condition.id)) {
        expect(holding).toBeGreaterThan(0);
        expect(holding).toBeLessThan(checked);
      }
    });
  }

  it("leaves an exclusion-only mistake out: a condition with no requirements never holds", () => {
    const compiled = compileConditionHolds(deck, { id: "x", name: "x", requirements: [], excludes: [] }, groups);
    expect(compiled([0, 0, 0, 0, 0, 0])).toBe(false);
  });
});
