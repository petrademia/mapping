import { describe, expect, it } from "vitest";
import { computeCardImpact } from "./cardImpact";
import type { MappingCard } from "./document";
import { normalizeHandCondition } from "./handCondition";
import { forEachHandComposition, handConditionHolds, type HandConditionLike } from "./handExplorer";
import { combinations, ratioToNumber } from "./probability";

function card(card_id: number, quantity: number): MappingCard {
  return {
    card_id,
    quantity,
    taxonomy: { roles: [], opening_quality: { going_first: null, going_second: null } },
  };
}

const DECK = [card(1, 3), card(2, 2), card(3, 35)];
const N = combinations(40, 5);
const frac = (num: bigint) => ratioToNumber(num, N);

const HAS_CARD_1: HandConditionLike = {
  id: "has-1",
  name: "Has card 1",
  requirements: [{ id: "r1", kind: "card", card_id: 1, op: "gte", count: 1 }],
};
const SET = { id: "s", name: "Outcome", condition_ids: ["has-1"] };

describe("computeCardImpact", () => {
  it("matches the closed-form probabilities for a one-card outcome", () => {
    const impact = computeCardImpact(DECK, 5, [HAS_CARD_1], SET);
    // P(card 1 in hand) = 1 - C(37,5)/C(40,5)
    const baseline = 1 - frac(combinations(37, 5));
    expect(impact.baseline).toBeCloseTo(baseline, 12);

    const one = impact.rows.find((r) => r.card_id === 1)!;
    expect(one.withCard).toBeCloseTo(1, 12);
    expect(one.lift).toBeCloseTo(1 - baseline, 12);

    // P(S and card 2 in hand) = 1 - P(no c1) - P(no c2) + P(neither)
    const pHasTwo = 1 - frac(combinations(38, 5));
    const pBoth =
      1 - frac(combinations(37, 5)) - frac(combinations(38, 5)) + frac(combinations(35, 5));
    const two = impact.rows.find((r) => r.card_id === 2)!;
    expect(two.withCard).toBeCloseTo(pBoth / pHasTwo, 10);
    expect(two.lift).toBeCloseTo(pBoth / pHasTwo - baseline, 10);
  });

  it("ranks the card the outcome needs first and filler near zero", () => {
    const impact = computeCardImpact(DECK, 5, [HAS_CARD_1], SET);
    expect(impact.rows[0]!.card_id).toBe(1);
    const filler = impact.rows.find((r) => r.card_id === 3)!;
    expect(Math.abs(filler.lift!)).toBeLessThan(1e-3);
  });

  it("gives a negative lift to a card that an Excludes line rejects", () => {
    const condition: HandConditionLike = {
      id: "c",
      name: "Card 1 without card 2",
      requirements: [{ id: "r1", kind: "card", card_id: 1, op: "gte", count: 1 }],
      excludes: [{ id: "x1", kind: "card", card_id: 2, op: "gte", count: 1 }],
    };
    const impact = computeCardImpact(DECK, 5, [condition], {
      id: "s",
      name: "S",
      condition_ids: ["c"],
    });
    const two = impact.rows.find((r) => r.card_id === 2)!;
    expect(two.withCard).toBe(0);
    expect(two.lift!).toBeCloseTo(-impact.baseline, 12);
    expect(impact.rows[impact.rows.length - 1]!.card_id).toBe(2);
  });

  it("returns zero lift everywhere when the outcome has no conditions", () => {
    const impact = computeCardImpact(DECK, 5, [], { id: "s", name: "Empty", condition_ids: [] });
    expect(impact.baseline).toBe(0);
    for (const row of impact.rows) expect(row.lift).toBe(0);
  });

  it("returns null for a card that can never be in the hand", () => {
    const impact = computeCardImpact(DECK, 0, [HAS_CARD_1], SET);
    for (const row of impact.rows) {
      expect(row.withCard).toBeNull();
      expect(row.lift).toBeNull();
    }
  });

  it("with a distinct-cards condition, gives what walking the hands once per card gives", () => {
    const deck = [card(1, 2), card(2, 2), card(3, 3), card(4, 1), card(5, 8)];
    const groups = new Map([
      ["a", new Set([1, 2, 3])],
      ["b", new Set([2, 3, 4])],
    ]);
    const distinct = normalizeHandCondition({
      id: "pair",
      name: "Two different cards",
      requirements: [
        { id: "ra", kind: "group", group_id: "a", op: "gte", count: 1 },
        { id: "rb", kind: "group", group_id: "b", op: "gte", count: 1 },
      ],
      excludes: [],
      distinct_constraints: [{ id: "dc", requirement_ids: ["ra", "rb"], distinct_by: "card_name" }],
    });
    const set = { id: "s", name: "Pair", condition_ids: ["pair"] };
    const impact = computeCardImpact(deck, 5, [distinct], set, groups);

    // The reference: for each card, its own walk over every hand.
    const expected = new Map<number, { with: bigint; passing: bigint }>();
    let total = 0n;
    let passing = 0n;
    deck.forEach((entry, i) => {
      let rowTotal = 0n;
      let rowPassing = 0n;
      let rowWith = 0n;
      let rowWithPassing = 0n;
      forEachHandComposition(deck, 5, (hand, weight) => {
        const passed = handConditionHolds(hand, deck, distinct, groups);
        rowTotal += weight;
        if (passed) rowPassing += weight;
        if ((hand[i] ?? 0) > 0) {
          rowWith += weight;
          if (passed) rowWithPassing += weight;
        }
      });
      total = rowTotal;
      passing = rowPassing;
      expected.set(entry.card_id, { with: rowWith, passing: rowWithPassing });
    });

    expect(impact.baseline).toBe(ratioToNumber(passing, total));
    for (const row of impact.rows) {
      const want = expected.get(row.card_id)!;
      expect(row.withCard).toBe(want.with === 0n ? null : ratioToNumber(want.passing, want.with));
    }
  });

  it("rejects a hand larger than the deck", () => {
    expect(() => computeCardImpact([card(1, 3)], 5, [HAS_CARD_1], SET)).toThrow();
  });
});
