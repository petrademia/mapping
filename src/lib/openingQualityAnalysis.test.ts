import { describe, expect, it } from "vitest";
import { analyzeHandConditions, type HandConditionSetLike } from "./handExplorer";
import type { HandCondition } from "./handCondition";
import { openingQualityCoverage } from "./taxonomy";
import { combinations, ratioToNumber } from "./probability";
import type { MappingCard } from "./document";
import type { CardTaxonomy } from "./taxonomy";

function tax(
  roles: CardTaxonomy["roles"] = [],
  quality: { going_first?: "desirable" | "neutral" | "undesirable"; going_second?: "desirable" | "neutral" | "undesirable" } = {},
): CardTaxonomy {
  return {
    roles,
    opening_quality: {
      going_first: quality.going_first ?? null,
      going_second: quality.going_second ?? null,
    },
  };
}

function card(
  card_id: number,
  quantity: number,
  quality: Parameters<typeof tax>[1] = {},
  roles: CardTaxonomy["roles"] = [],
): MappingCard {
  return { card_id, quantity, taxonomy: tax(roles, quality) };
}

function condition(id: string, name: string, card_id: number): HandCondition {
  return {
    id,
    name,
    requirements: [{ kind: "card", card_id, op: "gte", count: 1 }],
    excludes: [],
  };
}

/**
 * Reference conditional: P(qualityPredicate | set) computed independently by
 * brute force over physical cards.
 */
function bruteConditional(
  deck: readonly MappingCard[],
  handSize: number,
  setMemberIds: readonly number[],
  qualityPredicate: (counts: ReadonlyMap<number, number>) => boolean,
): number | null {
  const expanded = deck.flatMap((entry) =>
    Array<number>(entry.quantity).fill(entry.card_id),
  );
  let matching = 0n;
  let joint = 0n;
  const combo = handSize === 0 ? [] : Array.from({ length: handSize }, (_, i) => i);
  if (handSize > 0) {
    while (true) {
      const counts = new Map<number, number>();
      for (const idx of combo) {
        const id = expanded[idx]!;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      const member = setMemberIds.some((id) => (counts.get(id) ?? 0) >= 1);
      if (member) {
        matching += 1n;
        if (qualityPredicate(counts)) joint += 1n;
      }
      let i = handSize - 1;
      while (i >= 0 && combo[i] === expanded.length - handSize + i) i -= 1;
      if (i < 0) break;
      combo[i] = combo[i]! + 1;
      for (let j = i + 1; j < handSize; j += 1) combo[j] = combo[j - 1]! + 1;
    }
  }
  if (matching === 0n) return null;
  return ratioToNumber(joint, matching);
}

/** Deck with card1 (engine, desirable), card2 (undesirable x2), filler. */
function fixtureDeck() {
  return [
    card(1, 3, { going_first: "desirable" }), // Medius
    card(2, 2, { going_first: "undesirable" }), // undesirable x2
    card(3, 35, {}), // filler, unclassified
  ];
}

describe("opening quality by modeled outcome: probability", () => {
  const deck = fixtureDeck();
  const conditions = [condition("m", "Medius Access", 1)];
  const sets: HandConditionSetLike[] = [
    { id: "s", name: "Normal Engine Access", condition_ids: ["m"] },
  ];

  it("computes P(U = 0 | S), P(U = 1 | S), P(U >= 2 | S) exactly", () => {
    const analysis = analyzeHandConditions(deck, 5, conditions, sets, new Map(), "going_first");
    const oq = analysis.sets[0]!.openingQuality!;
    const ref0 = bruteConditional(deck, 5, [1], (counts) => (counts.get(2) ?? 0) === 0);
    const ref1 = bruteConditional(deck, 5, [1], (counts) => (counts.get(2) ?? 0) === 1);
    const ref2 = bruteConditional(deck, 5, [1], (counts) => (counts.get(2) ?? 0) >= 2);
    expect(oq.undesirable[0]).toBeCloseTo(ref0!, 12);
    expect(oq.undesirable[1]).toBeCloseTo(ref1!, 12);
    expect(oq.undesirable[2]).toBeCloseTo(ref2!, 12);
  });

  it("partitions matching hands: buckets sum to 100%", () => {
    const analysis = analyzeHandConditions(deck, 5, conditions, sets, new Map(), "going_first");
    const oq = analysis.sets[0]!.openingQuality!;
    const sum = oq.undesirable.reduce<number>((acc, value) => acc + (value ?? 0), 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it("computes P(D >= 1 | S) and P(D >= 2 | S)", () => {
    const analysis = analyzeHandConditions(deck, 5, conditions, sets, new Map(), "going_first");
    const oq = analysis.sets[0]!.openingQuality!;
    // card1 is the only desirable source (x3): among hands with card1 >= 1,
    // D >= 1 is always true, D >= 2 depends on drawing 2+ of card1.
    expect(oq.desirableGe1).toBeCloseTo(1, 12);
    const refD2 = bruteConditional(deck, 5, [1], (counts) => (counts.get(1) ?? 0) >= 2);
    expect(oq.desirableGe2).toBeCloseTo(refD2!, 12);
  });

  it("does not double-count hands when overlapping conditions satisfy the set", () => {
    const conds = [
      condition("a", "Medius Access", 1),
      condition("b", "Medius again", 1),
    ];
    const overlapping: HandConditionSetLike[] = [
      { id: "s", name: "S", condition_ids: ["a", "b"] },
    ];
    const analysis = analyzeHandConditions(deck, 5, conds, overlapping, new Map(), "going_first");
    const set = analysis.sets[0]!;
    // Union denominator counts each matching hand once.
    expect(set.unionWeight).toBe(analysis.conditions[0]!.weight);
    const oq = set.openingQuality!;
    expect(oq.undesirable[0]).toBeCloseTo(
      bruteConditional(deck, 5, [1], (counts) => (counts.get(2) ?? 0) === 0)!,
      12,
    );
  });

  it("returns null buckets for a zero-probability outcome", () => {
    const conds = [
      {
        id: "x",
        name: "impossible",
        requirements: [{ kind: "card" as const, card_id: 99, op: "gte" as const, count: 1 }],
        excludes: [],
      },
    ];
    const z: HandConditionSetLike[] = [{ id: "s", name: "S", condition_ids: ["x"] }];
    const analysis = analyzeHandConditions(deck, 5, conds, z, new Map(), "going_first");
    const oq = analysis.sets[0]!.openingQuality!;
    expect(analysis.sets[0]!.union).toBe(0);
    expect(oq.undesirable).toEqual([null, null, null]);
    expect(oq.desirableGe1).toBeNull();
  });

  it("handles a fully unclassified deck (U always 0)", () => {
    const allUnclassified = [card(1, 3, {}), card(2, 2, {}), card(3, 35, {})];
    const analysis = analyzeHandConditions(allUnclassified, 5, conditions, sets, new Map(), "going_first");
    const oq = analysis.sets[0]!.openingQuality!;
    expect(oq.undesirable[0]).toBeCloseTo(1, 12);
    expect(oq.undesirable[1]).toBeCloseTo(0, 12);
    expect(oq.undesirable[2]).toBeCloseTo(0, 12);
  });

  it("handles a deck with no undesirable cards (U always 0)", () => {
    const noUndesirable = [card(1, 3, { going_first: "desirable" }), card(3, 37, {})];
    const analysis = analyzeHandConditions(noUndesirable, 5, conditions, sets, new Map(), "going_first");
    const oq = analysis.sets[0]!.openingQuality!;
    expect(oq.undesirable[0]).toBeCloseTo(1, 12);
    expect(oq.undesirable[2]).toBeCloseTo(0, 12);
  });

  it("handles a deck where every card is undesirable (U = hand size)", () => {
    const allUndesirable = [card(1, 3, { going_first: "undesirable" }), card(2, 2, { going_first: "undesirable" })];
    const analysis = analyzeHandConditions(allUndesirable, 2, conditions, sets, new Map(), "going_first");
    const oq = analysis.sets[0]!.openingQuality!;
    expect(oq.undesirable[0]).toBe(0);
    expect(oq.undesirable[1]).toBe(0);
    expect(oq.undesirable[2]).toBeCloseTo(1, 12);
  });

  it("counts physical copies of an undesirable card (duplicate copies)", () => {
    // card2 has 2 copies; drawing both counts U = 2.
    const deckDupe = [card(1, 3, { going_first: "desirable" }), card(2, 2, { going_first: "undesirable" }), card(3, 35, {})];
    const analysis = analyzeHandConditions(deckDupe, 5, conditions, sets, new Map(), "going_first");
    const oq = analysis.sets[0]!.openingQuality!;
    const ref2 = bruteConditional(deckDupe, 5, [1], (counts) => (counts.get(2) ?? 0) === 2);
    expect(oq.undesirable[2]).toBeCloseTo(ref2!, 12);
  });

  it("respects the opening-5 observation point", () => {
    const analysis = analyzeHandConditions(deck, 5, conditions, sets, new Map(), "going_first");
    expect(analysis.total).toBe(combinations(40, 5));
  });

  it("respects the first-6 observation point", () => {
    const analysis = analyzeHandConditions(deck, 6, conditions, sets, new Map(), "going_first");
    expect(analysis.total).toBe(combinations(40, 6));
  });
});

describe("opening quality by modeled outcome: context", () => {
  // Fuwalos-style: neutral going first, desirable going second.
  const deck = [
    card(1, 2, { going_first: "neutral", going_second: "desirable" }),
    card(2, 38, {}),
  ];
  const conditions = [condition("f", "Fuwalos Access", 1)];
  const sets: HandConditionSetLike[] = [{ id: "s", name: "S", condition_ids: ["f"] }];

  it("produces different quality results for GF vs GS", () => {
    const gf = analyzeHandConditions(deck, 5, conditions, sets, new Map(), "going_first");
    const gs = analyzeHandConditions(deck, 5, conditions, sets, new Map(), "going_second");
    expect(gf.sets[0]!.openingQuality!.desirableGe1).toBe(0); // neutral GF
    expect(gs.sets[0]!.openingQuality!.desirableGe1).toBe(1); // desirable GS
  });

  it("keeps modeled outcome membership unchanged across contexts", () => {
    const gf = analyzeHandConditions(deck, 5, conditions, sets, new Map(), "going_first");
    const gs = analyzeHandConditions(deck, 5, conditions, sets, new Map(), "going_second");
    // The condition is not context-sensitive, so the union is identical.
    expect(gf.sets[0]!.union).toBe(gs.sets[0]!.union);
  });

  it("keeps raw role taxonomy untouched by the analysis", () => {
    const deckRoles = [
      card(1, 2, {}, ["starter", "interaction"]),
      card(2, 38, {}),
    ];
    const analysis = analyzeHandConditions(deckRoles, 5, conditions, sets, new Map(), "going_first");
    expect(analysis.conditions[0]!.probability).toBeGreaterThan(0);
    expect(deckRoles[0]!.taxonomy.roles).toEqual(["starter", "interaction"]);
  });

  it("respects the hand size of the observation point", () => {
    const gs6 = analyzeHandConditions(deck, 6, conditions, sets, new Map(), "going_second");
    expect(gs6.total).toBe(combinations(40, 6));
  });
});

describe("opening quality coverage", () => {
  it("reports 100% when fully classified", () => {
    const cards = [card(1, 3, { going_first: "desirable" }), card(2, 2, { going_second: "neutral" })];
    const coverage = openingQualityCoverage(cards);
    expect(coverage.going_first.classified).toBe(3);
    expect(coverage.going_first.unclassified).toBe(2);
    expect(coverage.going_second.classified).toBe(2);
    expect(coverage.going_second.unclassified).toBe(3);
  });

  it("reports a partial classification", () => {
    const cards = [card(1, 3, { going_first: "undesirable" }), card(2, 2, {}), card(3, 1, {})];
    const coverage = openingQualityCoverage(cards);
    expect(coverage.going_first).toEqual({ classified: 3, unclassified: 3, total: 6 });
    expect(coverage.going_second).toEqual({ classified: 0, unclassified: 6, total: 6 });
  });

  it("counts Neutral as classified and Unclassified as not", () => {
    const cards = [card(1, 2, { going_first: "neutral" }), card(2, 1, {})];
    const coverage = openingQualityCoverage(cards);
    expect(coverage.going_first.classified).toBe(2);
    expect(coverage.going_first.unclassified).toBe(1);
  });

  it("counts duplicate deck slots consistently", () => {
    const cards = [card(1, 3, { going_first: "desirable" }), card(2, 1, { going_first: "desirable" })];
    const coverage = openingQualityCoverage(cards);
    expect(coverage.going_first).toEqual({ classified: 4, unclassified: 0, total: 4 });
  });
});
