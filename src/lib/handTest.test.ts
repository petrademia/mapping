import { describe, expect, it } from "vitest";
import {
  drawRandomHand,
  evaluateHandTest,
  exactHandProbability,
  handVector,
  validateManualHand,
} from "./handTest";
import type { HandCondition } from "./handCondition";
import { groupsToMembership, type Group } from "./handCondition";
import { combinations, ratioToNumber } from "./probability";
import type { MappingCard } from "./document";
import type { CardTaxonomy } from "./taxonomy";

function tax(roles: CardTaxonomy["roles"] = []): CardTaxonomy {
  return { roles, opening_quality: { going_first: null, going_second: null } };
}

function card(
  card_id: number,
  quantity: number,
  roles: CardTaxonomy["roles"] = [],
): MappingCard {
  return { card_id, quantity, taxonomy: tax(roles) };
}

/** Seeded LCG for deterministic sampling in tests. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Nervedo fixture deck: 40 cards, 5 observed. */
function fixtureDeck(): MappingCard[] {
  return [
    card(1, 1, ["starter"]), // Nervedo
    card(2, 2), // Citrinitas
    card(3, 1), // Terminus (valid-st)
    card(4, 1), // PastLull (valid-st)
    card(5, 3, ["interaction"]), // Fuwalos
    card(6, 3, ["interaction"]), // Ash
    card(99, 29), // filler
  ];
}

function fixtureGroups(): Group[] {
  return [{ id: "valid-st", name: "Valid Nervedo S/T", card_ids: [3, 4] }];
}

const nervedoAccess: HandCondition = {
  id: "nervedo",
  name: "Nervedo Access",
  requirements: [
    { kind: "card", card_id: 1, op: "gte", count: 1 },
    { kind: "group", group_id: "valid-st", op: "gte", count: 1 },
  ],
  excludes: [{ kind: "card", card_id: 2, op: "gte", count: 1 }],
};

const hasInteraction: HandCondition = {
  id: "interaction",
  name: "Has Interaction",
  requirements: [{ kind: "role", role: "interaction", op: "gte", count: 1 }],
  excludes: [],
};

describe("hand test: hand model", () => {
  const deck = fixtureDeck();

  it("accepts a valid 5-card hand", () => {
    const hand = { 1: 1, 3: 1, 5: 1, 99: 2 };
    expect(validateManualHand(deck, hand, 5)).toEqual([]);
  });

  it("accepts a valid 6-card observed set", () => {
    const hand = { 1: 1, 3: 1, 5: 1, 6: 1, 99: 2 };
    expect(validateManualHand(deck, hand, 6)).toEqual([]);
  });

  it("allows duplicate copies when the deck contains them", () => {
    const hand = { 5: 3, 99: 2 };
    expect(validateManualHand(deck, hand, 5)).toEqual([]);
  });

  it("rejects copies beyond the deck's copy limit", () => {
    const hand = { 5: 4, 99: 1 };
    const issues = validateManualHand(deck, hand, 5);
    expect(issues).toEqual([
      { kind: "over_copy_limit", card_id: 5, limit: 3, count: 4 },
    ]);
  });

  it("rejects a card that is not in the Main Deck", () => {
    const issues = validateManualHand(deck, { 777: 1, 99: 4 }, 5);
    expect(issues.some((issue) => issue.kind === "not_in_main")).toBe(true);
  });

  it("rejects a wrong total size", () => {
    const issues = validateManualHand(deck, { 1: 1, 99: 1 }, 5);
    expect(issues).toContainEqual({ kind: "wrong_size", expected: 5, actual: 2 });
  });

  it("draws the requested sample size", () => {
    const hand = drawRandomHand(deck, 6, lcg(42));
    expect(Object.values(hand.card_counts).reduce((a, b) => a + b, 0)).toBe(6);
    expect(hand.observed_cards).toBe(6);
  });

  it("samples physical copy counts uniformly (marginal check)", () => {
    const rng = lcg(7);
    const draws = 4000;
    let nervedoCount = 0;
    for (let i = 0; i < draws; i += 1) {
      const hand = drawRandomHand(deck, 5, rng);
      nervedoCount += hand.card_counts[1] ?? 0;
    }
    // card 1 has 1 physical copy out of 40; expected E[count] = 5/40 = 0.125.
    const average = nervedoCount / draws;
    expect(average).toBeCloseTo(0.125, 1);
    // every draw is a valid hand
    expect(validateManualHand(deck, drawRandomHand(deck, 5, rng).card_counts, 5)).toEqual([]);
  });

  it("computes the exact composition probability", () => {
    // weight = product_i C(n_i, h_i) over every deck row, divided by C(40,5).
    const hand = { 1: 1, 5: 2, 99: 2 };
    const expected = ratioToNumber(
      combinations(1, 1) *
        combinations(2, 0) *
        combinations(1, 0) *
        combinations(1, 0) *
        combinations(3, 2) *
        combinations(3, 0) *
        combinations(29, 2),
      combinations(40, 5),
    );
    expect(exactHandProbability(deck, hand, 5)).toBeCloseTo(expected, 12);
  });

  it("maps card counts to the deck-aligned count vector", () => {
    const vector = handVector(deck, { 1: 1, 5: 2 });
    expect(vector).toEqual([1, 0, 0, 0, 2, 0, 0]);
  });
});

describe("hand test: condition trace", () => {
  const deck = fixtureDeck();
  const groups = groupsToMembership(fixtureGroups());

  it("traces a passing card requirement with the actual count", () => {
    const evaluation = evaluateHandTest(deck, { 1: 1, 3: 1, 99: 3 }, [nervedoAccess], [], groups);
    const cond = evaluation.conditions[0]!;
    expect(cond.requirements[0]!.passed).toBe(true);
    expect(cond.requirements[0]!.actualCount).toBe(1);
    expect(cond.requirements[0]!.contributors).toEqual([1]);
  });

  it("traces a failing card requirement", () => {
    const evaluation = evaluateHandTest(deck, { 3: 1, 99: 4 }, [nervedoAccess], [], groups);
    const cond = evaluation.conditions[0]!;
    expect(cond.requirements[0]!.passed).toBe(false);
    expect(cond.requirements[0]!.actualCount).toBe(0);
    expect(cond.passed).toBe(false);
  });

  it("traces passing and failing role requirements with contributors", () => {
    const passing = evaluateHandTest(deck, { 5: 2, 99: 3 }, [hasInteraction], [], groups);
    expect(passing.conditions[0]!.requirements[0]!.passed).toBe(true);
    expect(passing.conditions[0]!.requirements[0]!.actualCount).toBe(2);
    expect(passing.conditions[0]!.requirements[0]!.contributors).toEqual([5]);

    const failing = evaluateHandTest(deck, { 1: 1, 99: 4 }, [hasInteraction], [], groups);
    expect(failing.conditions[0]!.requirements[0]!.passed).toBe(false);
    expect(failing.conditions[0]!.requirements[0]!.actualCount).toBe(0);
  });

  it("traces a passing group requirement with contributors", () => {
    const evaluation = evaluateHandTest(deck, { 1: 1, 3: 1, 4: 1, 99: 2 }, [nervedoAccess], [], groups);
    const req = evaluation.conditions[0]!.requirements[1]!;
    expect(req.passed).toBe(true);
    expect(req.actualCount).toBe(2);
    expect(req.contributors).toEqual([3, 4]);
  });

  it("traces a failing group requirement", () => {
    const evaluation = evaluateHandTest(deck, { 1: 1, 2: 1, 99: 3 }, [nervedoAccess], [], groups);
    expect(evaluation.conditions[0]!.requirements[1]!.passed).toBe(false);
    expect(evaluation.conditions[0]!.requirements[1]!.actualCount).toBe(0);
    expect(evaluation.conditions[0]!.passed).toBe(false);
  });

  it("reports exclusion absent as a passed (not matched) exclusion", () => {
    const evaluation = evaluateHandTest(deck, { 1: 1, 3: 1, 99: 3 }, [nervedoAccess], [], groups);
    const exclusion = evaluation.conditions[0]!.excludes[0]!;
    expect(exclusion.passed).toBe(false); // exclusion did NOT match
    expect(exclusion.actualCount).toBe(0);
    expect(evaluation.conditions[0]!.passed).toBe(true);
  });

  it("reports exclusion matched and fails the condition", () => {
    const evaluation = evaluateHandTest(deck, { 1: 1, 2: 1, 3: 1, 99: 2 }, [nervedoAccess], [], groups);
    const exclusion = evaluation.conditions[0]!.excludes[0]!;
    expect(exclusion.passed).toBe(true); // exclusion matched
    expect(exclusion.actualCount).toBe(1);
    expect(evaluation.conditions[0]!.passed).toBe(false);
  });

  it("traces multiple requirements and exclusions with correct actual counts", () => {
    const both: HandCondition = {
      id: "both",
      name: "Both",
      requirements: [
        { kind: "card", card_id: 5, op: "gte", count: 2 },
        { kind: "card", card_id: 6, op: "gte", count: 1 },
      ],
      excludes: [
        { kind: "card", card_id: 2, op: "gte", count: 1 },
        { kind: "card", card_id: 1, op: "gte", count: 1 },
      ],
    };
    const evaluation = evaluateHandTest(deck, { 5: 2, 6: 1, 99: 2 }, [both], []);
    const cond = evaluation.conditions[0]!;
    expect(cond.requirements.map((r) => r.actualCount)).toEqual([2, 1]);
    expect(cond.requirements.every((r) => r.passed)).toBe(true);
    expect(cond.excludes.every((e) => !e.passed)).toBe(true);
    expect(cond.passed).toBe(true);

    const withExclusion = evaluateHandTest(deck, { 5: 2, 6: 1, 2: 1, 99: 1 }, [both], []);
    expect(withExclusion.conditions[0]!.excludes[0]!.passed).toBe(true);
    expect(withExclusion.conditions[0]!.passed).toBe(false);
  });
});

describe("hand test: condition sets", () => {
  const deck = fixtureDeck();
  const groups = groupsToMembership(fixtureGroups());
  const conditions = [nervedoAccess, hasInteraction];
  const sets = [
    { id: "engine", name: "Modeled Engine Access", condition_ids: ["nervedo", "interaction"] },
  ];

  it("passes when at least one member passes (ANY)", () => {
    const result = evaluateHandTest(deck, { 5: 1, 99: 4 }, conditions, sets, groups);
    const set = result.sets[0]!;
    expect(set.passed).toBe(true);
    expect(set.satisfiedCount).toBe(1);
    expect(set.satisfiedIds).toEqual(["interaction"]);
  });

  it("fails when no member passes", () => {
    const result = evaluateHandTest(deck, { 1: 1, 3: 1, 2: 1, 99: 2 }, conditions, sets, groups);
    const set = result.sets[0]!;
    expect(set.passed).toBe(false);
    expect(set.satisfiedCount).toBe(0);
    expect(set.satisfiedIds).toEqual([]);
  });

  it("counts multiple satisfied members", () => {
    const result = evaluateHandTest(deck, { 1: 1, 3: 1, 5: 1, 99: 2 }, conditions, sets, groups);
    const set = result.sets[0]!;
    expect(set.passed).toBe(true);
    expect(set.satisfiedCount).toBe(2);
    expect(set.memberCount).toBe(2);
  });

  it("handles a missing/deleted member condition safely", () => {
    const brokenSets = [
      { id: "s", name: "S", condition_ids: ["nervedo", "ghost"] },
    ];
    const result = evaluateHandTest(deck, { 5: 1, 99: 4 }, conditions, brokenSets, groups);
    const set = result.sets[0]!;
    expect(set.memberIds).toEqual(["nervedo"]);
    expect(set.memberCount).toBe(1);
  });
});

describe("hand test: context and configuration", () => {
  const deck = fixtureDeck();

  it("tests an opening-5 hand", () => {
    const hand = drawRandomHand(deck, 5, lcg(1));
    expect(hand.observed_cards).toBe(5);
    expect(validateManualHand(deck, hand.card_counts, 5)).toEqual([]);
  });

  it("tests a first-6 observed set", () => {
    const hand = drawRandomHand(deck, 6, lcg(2));
    expect(hand.observed_cards).toBe(6);
    expect(validateManualHand(deck, hand.card_counts, 6)).toEqual([]);
  });

  it("only considers cards actually in the Main Deck", () => {
    // A side-deck card id is rejected as not in the main.
    const sideCard = 7777777;
    const issues = validateManualHand(deck, { [sideCard]: 1, 99: 4 }, 5);
    expect(issues.some((issue) => issue.kind === "not_in_main")).toBe(true);
  });

  it("flags a manual hand that becomes invalid after the deck changes", () => {
    const original = validateManualHand(deck, { 5: 3, 99: 2 }, 5);
    expect(original).toEqual([]);
    // New deck drops card 5 to 1 copy: the 3-copy selection is now invalid.
    const changedDeck = fixtureDeck().map((entry) =>
      entry.card_id === 5 ? { ...entry, quantity: 1 } : entry,
    );
    const issues = validateManualHand(changedDeck, { 5: 3, 99: 2 }, 5);
    expect(issues).toContainEqual({
      kind: "over_copy_limit",
      card_id: 5,
      limit: 1,
      count: 3,
    });
  });
});
