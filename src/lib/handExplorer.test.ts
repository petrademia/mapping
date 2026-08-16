import { describe, expect, it } from "vitest";
import type { MappingCard } from "./document";
import {
  combinations,
  openingAtLeastProbability,
  openingCountProbability,
} from "./probability";
import {
  compareHandConditions,
  conditionHolds,
  countForCondition,
  forEachHandComposition,
  matchesCount,
  type HandCondition,
} from "./handExplorer";
import type { CardTaxonomy } from "./taxonomy";

function tax(
  roles: CardTaxonomy["roles"] = [],
): CardTaxonomy {
  return { roles, opening_quality: null };
}

function card(
  card_id: number,
  quantity: number,
  roles: CardTaxonomy["roles"] = [],
): MappingCard {
  return { card_id, quantity, taxonomy: tax(roles) };
}

function deckOf(...cards: MappingCard[]): MappingCard[] {
  return cards;
}

describe("count operators", () => {
  it("supports card >= 1", () => {
    expect(matchesCount(1, "gte", 1)).toBe(true);
    expect(matchesCount(0, "gte", 1)).toBe(false);
  });

  it("supports card = 0", () => {
    expect(matchesCount(0, "eq", 0)).toBe(true);
    expect(matchesCount(1, "eq", 0)).toBe(false);
  });

  it("supports card >= 2", () => {
    expect(matchesCount(2, "gte", 2)).toBe(true);
    expect(matchesCount(1, "gte", 2)).toBe(false);
  });
});

describe("two-condition exact probabilities", () => {
  const purification = 1001;
  const citrinitas = 1002;

  it("computes P(A), P(B), P(A ∩ B), P(B|A), P(A|B) for card + card", () => {
    const main = deckOf(
      card(purification, 3),
      card(citrinitas, 1),
      card(2000, 36),
    );
    expect(main.reduce((s, c) => s + c.quantity, 0)).toBe(40);

    const A: HandCondition = {
      kind: "card",
      card_id: purification,
      op: "gte",
      count: 1,
    };
    const B: HandCondition = {
      kind: "card",
      card_id: citrinitas,
      op: "gte",
      count: 1,
    };
    const result = compareHandConditions(main, 5, {
      conditionA: A,
      conditionB: B,
    });

    expect(result.pA).toBeCloseTo(
      openingAtLeastProbability(40, 3, 5, 1),
      12,
    );
    expect(result.pB).toBeCloseTo(
      openingAtLeastProbability(40, 1, 5, 1),
      12,
    );
    // Exact intersection via hypergeometric for two disjoint card groups:
    // P(A∩B) = 1 - P(A^c) - P(B^c) + P(A^c ∩ B^c) is messier; use weights.
    expect(result.pIntersection).toBeGreaterThan(0);
    expect(result.pIntersection).toBeLessThanOrEqual(
      Math.min(result.pA, result.pB),
    );
    expect(result.pBGivenA).not.toBeNull();
    expect(result.pAGivenB).not.toBeNull();
    expect(result.pBGivenA!).toBeCloseTo(
      result.pIntersection / result.pA,
      12,
    );
    expect(result.pAGivenB!).toBeCloseTo(
      result.pIntersection / result.pB,
      12,
    );
  });

  it("matches known hypergeometric for a single card condition as P(A)", () => {
    const main = deckOf(card(1, 3), card(2, 37));
    const result = compareHandConditions(main, 5, {
      conditionA: { kind: "card", card_id: 1, op: "eq", count: 1 },
      conditionB: { kind: "card", card_id: 1, op: "eq", count: 0 },
    });
    expect(result.pA).toBeCloseTo(openingCountProbability(40, 3, 5, 1), 12);
    expect(result.pB).toBeCloseTo(openingCountProbability(40, 3, 5, 0), 12);
  });

  it("handles role + role with overlapping multi-label cards", () => {
    // Card X x3 is both starter and extender. One X satisfies both roles.
    const main = deckOf(
      card(10, 3, ["starter", "extender"]),
      card(20, 37),
    );
    const result = compareHandConditions(main, 5, {
      conditionA: { kind: "role", role: "starter", op: "gte", count: 1 },
      conditionB: { kind: "role", role: "extender", op: "gte", count: 1 },
    });
    const pStarter = openingAtLeastProbability(40, 3, 5, 1);
    expect(result.pA).toBeCloseTo(pStarter, 12);
    expect(result.pB).toBeCloseTo(pStarter, 12);
    // Because the same copies carry both roles, A and B are identical events.
    expect(result.pIntersection).toBeCloseTo(pStarter, 12);
    expect(result.pBGivenA).toBeCloseTo(1, 12);
    expect(result.pAGivenB).toBeCloseTo(1, 12);
  });

  it("counts one multi-role card toward both starter and extender", () => {
    const main = deckOf(card(10, 1, ["starter", "extender"]), card(20, 4));
    const hand = [1, 0];
    expect(
      countForCondition(hand, main, {
        kind: "role",
        role: "starter",
        op: "gte",
        count: 1,
      }),
    ).toBe(1);
    expect(
      countForCondition(hand, main, {
        kind: "role",
        role: "extender",
        op: "gte",
        count: 1,
      }),
    ).toBe(1);
    expect(
      conditionHolds(hand, main, {
        kind: "role",
        role: "starter",
        op: "gte",
        count: 1,
      }),
    ).toBe(true);
    expect(
      conditionHolds(hand, main, {
        kind: "role",
        role: "extender",
        op: "gte",
        count: 1,
      }),
    ).toBe(true);
  });

  it("handles card + role", () => {
    const main = deckOf(
      card(1, 3, ["starter"]),
      card(2, 2, ["interaction"]),
      card(3, 35),
    );
    const result = compareHandConditions(main, 5, {
      conditionA: { kind: "card", card_id: 1, op: "gte", count: 1 },
      conditionB: { kind: "role", role: "interaction", op: "gte", count: 1 },
    });
    expect(result.pA).toBeCloseTo(openingAtLeastProbability(40, 3, 5, 1), 12);
    expect(result.pB).toBeCloseTo(openingAtLeastProbability(40, 2, 5, 1), 12);
    expect(result.pIntersection).toBeGreaterThan(0);
    expect(result.pBGivenA!).toBeCloseTo(result.pIntersection / result.pA, 12);
  });

  it("returns 0% for impossible A without rejecting the condition", () => {
    const main = deckOf(card(1, 1), card(2, 39));
    const result = compareHandConditions(main, 5, {
      conditionA: { kind: "card", card_id: 1, op: "gte", count: 2 },
      conditionB: { kind: "card", card_id: 2, op: "gte", count: 1 },
    });
    expect(result.pA).toBe(0);
    expect(result.weightA).toBe(0n);
    expect(result.pB).toBeGreaterThan(0);
  });

  it("returns 0% for impossible B", () => {
    const main = deckOf(card(1, 3), card(2, 37));
    const result = compareHandConditions(main, 5, {
      conditionA: { kind: "card", card_id: 1, op: "gte", count: 1 },
      conditionB: { kind: "role", role: "starter", op: "gte", count: 6 },
    });
    expect(result.pB).toBe(0);
    expect(result.weightB).toBe(0n);
  });

  it("leaves P(B|A) undefined when A is impossible", () => {
    const main = deckOf(card(1, 1), card(2, 39));
    const result = compareHandConditions(main, 5, {
      conditionA: { kind: "card", card_id: 1, op: "gte", count: 2 },
      conditionB: { kind: "card", card_id: 2, op: "gte", count: 1 },
    });
    expect(result.pBGivenA).toBeNull();
    expect(result.pAGivenB).not.toBeNull();
  });

  it("leaves P(A|B) undefined when B is impossible", () => {
    const main = deckOf(card(1, 3), card(2, 37));
    const result = compareHandConditions(main, 5, {
      conditionA: { kind: "card", card_id: 1, op: "gte", count: 1 },
      conditionB: { kind: "card", card_id: 1, op: "gte", count: 4 },
    });
    expect(result.pB).toBe(0);
    expect(result.pAGivenB).toBeNull();
    // A is possible and never intersects B, so P(B|A) is defined and 0.
    expect(result.pBGivenA).toBe(0);
  });

  it("supports hand sizes other than 5", () => {
    const main = deckOf(card(1, 3), card(2, 37));
    const result = compareHandConditions(main, 6, {
      conditionA: { kind: "card", card_id: 1, op: "gte", count: 1 },
      conditionB: { kind: "card", card_id: 1, op: "eq", count: 0 },
    });
    expect(result.pA).toBeCloseTo(openingAtLeastProbability(40, 3, 6, 1), 12);
    expect(result.total).toBe(combinations(40, 6));
  });

  it("supports a 40-card deck", () => {
    const main = deckOf(card(1, 3), card(2, 37));
    const result = compareHandConditions(main, 5, {
      conditionA: { kind: "card", card_id: 1, op: "gte", count: 1 },
      conditionB: { kind: "card", card_id: 2, op: "gte", count: 1 },
    });
    expect(result.total).toBe(combinations(40, 5));
    expect(result.total).toBe(658008n);
  });

  it("supports a 42-card deck", () => {
    const main = deckOf(card(1, 3), card(2, 39));
    const result = compareHandConditions(main, 5, {
      conditionA: { kind: "card", card_id: 1, op: "gte", count: 1 },
      conditionB: { kind: "card", card_id: 2, op: "gte", count: 1 },
    });
    expect(result.total).toBe(combinations(42, 5));
    expect(result.total).toBe(850668n);
    expect(result.pA).toBeCloseTo(openingAtLeastProbability(42, 3, 5, 1), 12);
  });

  it("uses exact multiplicity weighting for multi-copy cards", () => {
    const main = deckOf(card(1, 3), card(2, 2));
    // Hand size 2: compositions
    // (0,2) weight C(3,0)*C(2,2)=1
    // (1,1) weight C(3,1)*C(2,1)=6
    // (2,0) weight C(3,2)*C(2,0)=3
    // total C(5,2)=10
    const weights = new Map<string, bigint>();
    forEachHandComposition(main, 2, (hand, weight) => {
      weights.set(hand.join(","), weight);
    });
    expect(weights.get("0,2")).toBe(1n);
    expect(weights.get("1,1")).toBe(6n);
    expect(weights.get("2,0")).toBe(3n);
    let sum = 0n;
    for (const w of weights.values()) sum += w;
    expect(sum).toBe(combinations(5, 2));

    const result = compareHandConditions(main, 2, {
      conditionA: { kind: "card", card_id: 1, op: "eq", count: 1 },
      conditionB: { kind: "card", card_id: 2, op: "eq", count: 1 },
    });
    expect(result.weightA).toBe(6n);
    expect(result.weightB).toBe(6n);
    expect(result.weightAB).toBe(6n);
    expect(result.pA).toBeCloseTo(0.6, 12);
  });

  it("does not assume role independence for joint probability", () => {
    // Partial overlap: some starters are also extenders.
    const main = deckOf(
      card(1, 3, ["starter", "extender"]),
      card(2, 3, ["starter"]),
      card(3, 3, ["extender"]),
      card(4, 31),
    );
    const result = compareHandConditions(main, 5, {
      conditionA: { kind: "role", role: "starter", op: "gte", count: 1 },
      conditionB: { kind: "role", role: "extender", op: "gte", count: 1 },
    });
    const independent = result.pA * result.pB;
    // Overlap means P(A∩B) > P(A)P(B) typically (positive dependence).
    expect(result.pIntersection).not.toBeCloseTo(independent, 3);
    expect(result.pIntersection).toBeGreaterThan(independent);
  });
});
