import { describe, expect, it } from "vitest";
import { type HandCondition } from "./handCondition";
import {
  createDocument,
  parseMappingJson,
  serializeMapping,
  upsertHandCondition,
  upsertHandConditionSet,
  type MappingCard,
} from "./document";
import {
  analyzeHandConditions,
  pAGivenB,
  pairKey,
  type HandConditionSetLike,
} from "./handExplorer";
import { combinations, openingAtLeastProbability, ratioToNumber } from "./probability";
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

function condition(id: string, name: string, card_id: number): HandCondition {
  return {
    id,
    name,
    requirements: [{ kind: "card", card_id, op: "gte", count: 1 }],
    excludes: [],
  };
}

/** Independent brute-force reference over every physical k-card combo. */
function bruteProbability(
  deck: readonly MappingCard[],
  handSize: number,
  satisfies: (counts: ReadonlyMap<number, number>) => boolean,
): number {
  const expanded = deck.flatMap((entry) =>
    Array<number>(entry.quantity).fill(entry.card_id),
  );
  const total = combinations(expanded.length, handSize);
  let matches = 0n;
  const combo = handSize === 0 ? [] : Array.from({ length: handSize }, (_, i) => i);
  if (handSize > 0) {
    while (true) {
      const counts = new Map<number, number>();
      for (const idx of combo) {
        const id = expanded[idx]!;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      if (satisfies(counts)) matches += 1n;
      let i = handSize - 1;
      while (i >= 0 && combo[i] === expanded.length - handSize + i) i -= 1;
      if (i < 0) break;
      combo[i] = combo[i]! + 1;
      for (let j = i + 1; j < handSize; j += 1) combo[j] = combo[j - 1]! + 1;
    }
  }
  return ratioToNumber(matches, total);
}

/** Shared fixture: A=card1>=1 (x3), B=card2>=1 (x2), C=card3>=1 (x1), filler to 40. */
function fixture() {
  const deck = [card(1, 3), card(2, 2), card(3, 1), card(4, 34)];
  const conditions = [
    condition("A", "Medius Access", 1),
    condition("B", "Vidolium Access", 2),
    condition("C", "Nervedo Access", 3),
  ];
  return { deck, conditions };
}

describe("condition sets: union and overlap", () => {
  it("computes a one-condition set union equal to the condition probability", () => {
    const { deck, conditions } = fixture();
    const sets: HandConditionSetLike[] = [
      { id: "s", name: "Single", condition_ids: ["A"] },
    ];
    const analysis = analyzeHandConditions(deck, 5, conditions, sets);
    const set = analysis.sets[0]!;
    expect(set.union).toBeCloseTo(analysis.conditions[0]!.probability, 12);
    expect(set.union).toBeCloseTo(openingAtLeastProbability(40, 3, 5, 1), 12);
  });

  it("reports exactly 0 pairwise intersection for mutually exclusive conditions", () => {
    // A = card1 >= 1 and B = card1 = 0 partition the sample space.
    const deck = [card(1, 3), card(2, 37)];
    const conditions = [
      condition("A", "has card1", 1),
      {
        id: "B",
        name: "no card1",
        requirements: [{ kind: "card", card_id: 1, op: "eq", count: 0 }],
        excludes: [],
      } as HandCondition,
    ];
    const analysis = analyzeHandConditions(deck, 5, conditions, [
      { id: "s", name: "S", condition_ids: ["A", "B"] },
    ]);
    expect(analysis.conditions[0]!.probability).toBeGreaterThan(0);
    expect(analysis.conditions[1]!.probability).toBeGreaterThan(0);
    // Disjoint events never co-occur, so the pair is absent from the overlap map.
    expect(analysis.overlaps.has(pairKey("A", "B"))).toBe(false);
    // Union equals the sum for a partition.
    const set = analysis.sets[0]!;
    expect(set.union).toBeCloseTo(1, 12);
    expect(set.union).toBeCloseTo(
      analysis.conditions[0]!.probability +
        analysis.conditions[1]!.probability,
      12,
    );
  });

  it("reports positive overlap for overlapping conditions", () => {
    const { deck, conditions } = fixture();
    const analysis = analyzeHandConditions(deck, 5, conditions, []);
    const overlap = analysis.overlaps.get(pairKey("A", "B"))!;
    expect(overlap.intersection).toBeGreaterThan(0);
    const reference = bruteProbability(deck, 5, (counts) => {
      return (counts.get(1) ?? 0) >= 1 && (counts.get(2) ?? 0) >= 1;
    });
    expect(overlap.intersection).toBeCloseTo(reference, 12);
  });

  it("handles complete overlap (identical events)", () => {
    const deck = [card(1, 3), card(2, 37)];
    const conditions = [
      condition("A", "card1", 1),
      condition("B", "card1 again", 1),
    ];
    const analysis = analyzeHandConditions(deck, 5, conditions, []);
    const overlap = analysis.overlaps.get(pairKey("A", "B"))!;
    expect(overlap.intersection).toBeCloseTo(
      analysis.conditions[0]!.probability,
      12,
    );
    expect(overlap.intersection).toBeCloseTo(
      analysis.conditions[1]!.probability,
      12,
    );
    expect(overlap.intersection).toBeCloseTo(
      openingAtLeastProbability(40, 3, 5, 1),
      12,
    );
  });

  it("does not include a zero-overlap pair in the overlap map", () => {
    const deck = [card(1, 1), card(2, 39)];
    const conditions = [
      condition("A", "card1", 1),
      { id: "B", name: "impossible", requirements: [{ kind: "card", card_id: 1, op: "gte", count: 2 }], excludes: [] } as HandCondition,
    ];
    const analysis = analyzeHandConditions(deck, 5, conditions, []);
    expect(analysis.overlaps.has(pairKey("A", "B"))).toBe(false);
  });

  it("computes the exact union via enumeration, not by summing", () => {
    const { deck, conditions } = fixture();
    const analysis = analyzeHandConditions(deck, 5, conditions, [
      { id: "s", name: "Engine", condition_ids: ["A", "B"] },
    ]);
    const set = analysis.sets[0]!;
    const reference = bruteProbability(deck, 5, (counts) => {
      return (counts.get(1) ?? 0) >= 1 || (counts.get(2) ?? 0) >= 1;
    });
    expect(set.union).toBeCloseTo(reference, 12);
    // Sum of marginals strictly over-counts the overlap.
    const sum = analysis.conditions[0]!.probability + analysis.conditions[1]!.probability;
    expect(sum).toBeGreaterThan(set.union);
  });

  it("counts an overlapping hand once in the union", () => {
    // Hand {card1, card2, ...} satisfies both A and B but contributes once.
    const { deck, conditions } = fixture();
    const analysis = analyzeHandConditions(deck, 5, conditions, [
      { id: "s", name: "S", condition_ids: ["A", "B"] },
    ]);
    const overlap = analysis.overlaps.get(pairKey("A", "B"))!;
    const union = analysis.sets[0]!.union;
    const sum = analysis.conditions[0]!.probability + analysis.conditions[1]!.probability;
    expect(union).toBeCloseTo(sum - overlap.intersection, 12);
    expect(union).toBeLessThan(sum);
  });

  it("computes a three-way union exactly", () => {
    const { deck, conditions } = fixture();
    const sets: HandConditionSetLike[] = [
      { id: "s", name: "All", condition_ids: ["A", "B", "C"] },
    ];
    const analysis = analyzeHandConditions(deck, 5, conditions, sets);
    const set = analysis.sets[0]!;
    const reference = bruteProbability(deck, 5, (counts) => {
      return (
        (counts.get(1) ?? 0) >= 1 ||
        (counts.get(2) ?? 0) >= 1 ||
        (counts.get(3) ?? 0) >= 1
      );
    });
    expect(set.union).toBeCloseTo(reference, 12);
    expect(set.distribution.atLeast[0]).toBeCloseTo(reference, 12);
  });

  it("handles a Condition Set with no member conditions", () => {
    const { deck, conditions } = fixture();
    const analysis = analyzeHandConditions(deck, 5, conditions, [
      { id: "empty", name: "Empty", condition_ids: [] },
    ]);
    const set = analysis.sets[0]!;
    expect(set.conditionIds).toEqual([]);
    expect(set.union).toBe(0);
    expect(set.distribution.exact).toEqual([1]);
    expect(set.distribution.atLeast).toEqual([]);
  });

  it("drops deleted-condition references safely", () => {
    const { deck, conditions } = fixture();
    const analysis = analyzeHandConditions(deck, 5, conditions, [
      { id: "s", name: "Broken", condition_ids: ["A", "ghost"] },
    ]);
    const set = analysis.sets[0]!;
    expect(set.conditionIds).toEqual(["A"]);
    expect(set.union).toBeCloseTo(analysis.conditions[0]!.probability, 12);
  });

  it("persists condition sets through a round trip", () => {
    let doc = createDocument("sets");
    doc = { ...doc, main: [card(1, 3), card(2, 2), card(3, 35)] };
    doc = upsertHandCondition(doc, condition("A", "Medius", 1));
    doc = upsertHandCondition(doc, condition("B", "Vidolium", 2));
    doc = upsertHandConditionSet(doc, {
      id: "engine",
      name: "Modeled Engine Access",
      condition_ids: ["A", "B"],
      aggregation: "any",
    });
    const restored = parseMappingJson(serializeMapping(doc));
    expect(restored.hand_condition_sets).toEqual(doc.hand_condition_sets);
    expect(restored.hand_conditions).toEqual(doc.hand_conditions);
  });

  it("migrates a Modeled Engine Access selection into a condition set", () => {
    // v6 documents already carry the engine-access set; loading must preserve it.
    const restored = parseMappingJson(
      JSON.stringify({
        schema_version: 6,
        name: "legacy",
        main: [{ card_id: 1, quantity: 3, taxonomy: tax() }],
        extra: [],
        side: [],
        groups: [],
        hand_conditions: [
          {
            id: "A",
            name: "Medius",
            requirements: [{ kind: "card", card_id: 1, op: "gte", count: 1 }],
            excludes: [],
          },
        ],
        hand_condition_sets: [
          {
            id: "modeled-engine-access",
            name: "Modeled Engine Access",
            condition_ids: ["A"],
            aggregation: "any",
          },
        ],
        engine_access_set_id: "modeled-engine-access",
        analysis: { opening_hand_size: 5 },
      }),
    );
    expect(restored.schema_version).toBe(6);
    const engine = restored.hand_condition_sets.find(
      (set) => set.id === "modeled-engine-access",
    );
    expect(engine?.condition_ids).toEqual(["A"]);
    const analysis = analyzeHandConditions(
      restored.main,
      3,
      restored.hand_conditions,
      restored.hand_condition_sets,
    );
    const set = analysis.sets.find((s) => s.id === "modeled-engine-access")!;
    expect(set.conditionIds).toEqual(["A"]);
    expect(set.union).toBeCloseTo(analysis.conditions[0]!.probability, 12);
  });

  it("satisfies the inclusion-exclusion identity for two conditions", () => {
    const { deck, conditions } = fixture();
    const analysis = analyzeHandConditions(deck, 5, conditions, [
      { id: "s", name: "S", condition_ids: ["A", "B"] },
    ]);
    const pA = analysis.conditions[0]!.probability;
    const pB = analysis.conditions[1]!.probability;
    const pAB = analysis.overlaps.get(pairKey("A", "B"))!.intersection;
    const pUnion = analysis.sets[0]!.union;
    expect(pUnion).toBeCloseTo(pA + pB - pAB, 12);
  });

  it("satisfies 0 <= P(A∩B) <= min(P(A), P(B)) and max <= P(A∪B) <= 1", () => {
    const { deck, conditions } = fixture();
    const analysis = analyzeHandConditions(deck, 5, conditions, [
      { id: "s", name: "S", condition_ids: ["A", "B"] },
    ]);
    const pA = analysis.conditions[0]!.probability;
    const pB = analysis.conditions[1]!.probability;
    const pAB = analysis.overlaps.get(pairKey("A", "B"))!.intersection;
    const pUnion = analysis.sets[0]!.union;
    expect(pAB).toBeGreaterThanOrEqual(0);
    expect(pAB).toBeLessThanOrEqual(Math.min(pA, pB) + 1e-12);
    expect(pUnion).toBeGreaterThanOrEqual(Math.max(pA, pB) - 1e-12);
    expect(pUnion).toBeLessThanOrEqual(1);
    for (const row of analysis.conditions) {
      expect(row.probability).toBeGreaterThanOrEqual(0);
      expect(row.probability).toBeLessThanOrEqual(1);
    }
  });

  it("is symmetric for pairwise intersections", () => {
    const { deck, conditions } = fixture();
    const analysis = analyzeHandConditions(deck, 5, conditions, []);
    const keyAB = pairKey("A", "B");
    const keyBA = pairKey("B", "A");
    expect(keyAB).toBe(keyBA);
    const overlap = analysis.overlaps.get(keyAB)!;
    expect(overlap.intersection).toBe(analysis.overlaps.get(keyBA)!.intersection);
  });
});

describe("condition sets: multiplicity distribution", () => {
  it("validates P(set) = P(N >= 1) and PMF sums to 1", () => {
    const { deck, conditions } = fixture();
    const analysis = analyzeHandConditions(deck, 5, conditions, [
      { id: "s", name: "All", condition_ids: ["A", "B", "C"] },
    ]);
    const { exact, atLeast } = analysis.sets[0]!.distribution;
    expect(atLeast[0]).toBeCloseTo(1 - exact[0]!, 12);
    expect(analysis.sets[0]!.union).toBeCloseTo(atLeast[0]!, 12);
    expect(exact.reduce((sum, p) => sum + p, 0)).toBeCloseTo(1, 12);
  });

  it("computes the exactly-0, exactly-1, exactly-2 buckets against brute force", () => {
    const { deck, conditions } = fixture();
    const analysis = analyzeHandConditions(deck, 5, conditions, [
      { id: "s", name: "All", condition_ids: ["A", "B", "C"] },
    ]);
    const { exact } = analysis.sets[0]!.distribution;
    expect(exact[0]!).toBeCloseTo(
      bruteProbability(deck, 5, (counts) => {
        return (
          (counts.get(1) ?? 0) === 0 &&
          (counts.get(2) ?? 0) === 0 &&
          (counts.get(3) ?? 0) === 0
        );
      }),
      12,
    );
    expect(exact[1]!).toBeCloseTo(
      bruteProbability(deck, 5, (counts) => {
        let n = 0;
        for (const id of [1, 2, 3]) if ((counts.get(id) ?? 0) >= 1) n += 1;
        return n === 1;
      }),
      12,
    );
    expect(exact[2]!).toBeCloseTo(
      bruteProbability(deck, 5, (counts) => {
        let n = 0;
        for (const id of [1, 2, 3]) if ((counts.get(id) ?? 0) >= 1) n += 1;
        return n === 2;
      }),
      12,
    );
    expect(exact[3]!).toBeCloseTo(
      bruteProbability(deck, 5, (counts) => {
        return (
          (counts.get(1) ?? 0) >= 1 &&
          (counts.get(2) ?? 0) >= 1 &&
          (counts.get(3) ?? 0) >= 1
        );
      }),
      12,
    );
  });

  it("computes >=2 and >=3 cumulative probabilities", () => {
    const { deck, conditions } = fixture();
    const analysis = analyzeHandConditions(deck, 5, conditions, [
      { id: "s", name: "All", condition_ids: ["A", "B", "C"] },
    ]);
    const { exact, atLeast } = analysis.sets[0]!.distribution;
    expect(atLeast[1]!).toBeCloseTo(exact[2]! + exact[3]!, 12);
    expect(atLeast[2]!).toBeCloseTo(exact[3]!, 12);
    expect(atLeast[1]!).toBeCloseTo(
      bruteProbability(deck, 5, (counts) => {
        let n = 0;
        for (const id of [1, 2, 3]) if ((counts.get(id) ?? 0) >= 1) n += 1;
        return n >= 2;
      }),
      12,
    );
    expect(atLeast[2]!).toBeCloseTo(
      bruteProbability(deck, 5, (counts) => {
        let n = 0;
        for (const id of [1, 2, 3]) if ((counts.get(id) ?? 0) >= 1) n += 1;
        return n >= 3;
      }),
      12,
    );
  });

  it("exposes only the resolved members in the distribution", () => {
    const { deck, conditions } = fixture();
    const analysis = analyzeHandConditions(deck, 5, conditions, [
      { id: "s", name: "S", condition_ids: ["A", "ghost"] },
    ]);
    const set = analysis.sets[0]!;
    expect(set.distribution.exact).toHaveLength(2);
    expect(set.distribution.atLeast).toHaveLength(1);
    expect(set.union).toBeCloseTo(set.distribution.atLeast[0]!, 12);
  });
});

describe("condition sets: conditional probability", () => {
  it("computes P(A|B) when P(B) > 0", () => {
    const { deck, conditions } = fixture();
    const analysis = analyzeHandConditions(deck, 5, conditions, []);
    const pAgivenB = pAGivenB(analysis, "A", "B");
    const pA = analysis.conditions[0]!.probability;
    const pB = analysis.conditions[1]!.probability;
    const pAB = analysis.overlaps.get(pairKey("A", "B"))!.intersection;
    expect(pAgivenB).toBeCloseTo(pAB / pB, 12);
    // Drawing from disjoint piles in a fixed-size hand competes for slots, so
    // the events are negatively correlated here.
    expect(pAgivenB).toBeLessThan(pA);
    const pBgivenA = pAGivenB(analysis, "B", "A");
    expect(pBgivenA).toBeCloseTo(pAB / pA, 12);
    expect(pBgivenA).toBeLessThan(pB);
  });

  it("returns null when the conditioning event has zero probability", () => {
    const deck = [card(1, 1), card(2, 39)];
    const conditions = [
      condition("A", "card1", 1),
      {
        id: "B",
        name: "impossible",
        requirements: [{ kind: "card", card_id: 1, op: "gte", count: 2 }],
        excludes: [],
      } as HandCondition,
    ];
    const analysis = analyzeHandConditions(deck, 5, conditions, []);
    expect(analysis.conditions[1]!.probability).toBe(0);
    expect(pAGivenB(analysis, "A", "B")).toBeNull();
  });
});

describe("condition sets: modeled outcome semantics", () => {
  it("lets one Hand Condition belong to multiple outcomes", () => {
    const { deck, conditions } = fixture();
    const sets: HandConditionSetLike[] = [
      { id: "o1", name: "Normal Engine Access", condition_ids: ["A", "B"] },
      { id: "o2", name: "Access Through 1 Ash", condition_ids: ["A", "C"] },
    ];
    const analysis = analyzeHandConditions(deck, 5, conditions, sets);
    const o1 = analysis.sets[0]!;
    const o2 = analysis.sets[1]!;
    expect(o1.union).toBeCloseTo(
      openingAtLeastProbability(40, 3, 5, 1) +
        openingAtLeastProbability(40, 2, 5, 1) -
        analysis.overlaps.get(pairKey("A", "B"))!.intersection,
      12,
    );
    expect(o2.union).toBeGreaterThan(0);
  });

  it("renaming a Hand Condition does not change its probability", () => {
    const deck = [card(1, 3), card(2, 37)];
    const renamed = condition("x", "Medius + Vidolium — Through 1 Ash", 1);
    const plain = condition("y", "Medius + Vidolium", 1);
    const analysis = analyzeHandConditions(deck, 5, [renamed, plain], []);
    expect(analysis.conditions[0]!.probability).toBe(
      analysis.conditions[1]!.probability,
    );
    expect(analysis.conditions[0]!.probability).toBeCloseTo(
      openingAtLeastProbability(40, 3, 5, 1),
      12,
    );
  });

  it("example model: Medius/Vidolium/Nervedo and Access Through 1 Ash", () => {
    // Medius x3, Vidolium x2, Nervedo x1, filler x34 = 40.
    const deck = [card(1, 3), card(2, 2), card(3, 1), card(4, 34)];
    const medius = condition("medius", "Medius Access", 1);
    const vidolium = condition("vidolium", "Vidolium Access", 2);
    const throughAsh: HandCondition = {
      id: "through",
      name: "Medius + Vidolium — Through 1 Ash",
      requirements: [
        { kind: "card", card_id: 1, op: "gte", count: 1 },
        { kind: "card", card_id: 2, op: "gte", count: 1 },
      ],
      excludes: [],
    };
    const conditions = [medius, vidolium, throughAsh];
    const sets: HandConditionSetLike[] = [
      { id: "normal", name: "Normal Engine Access", condition_ids: ["medius", "vidolium"] },
      { id: "ash", name: "Access Through 1 Ash", condition_ids: ["through"] },
    ];
    const analysis = analyzeHandConditions(deck, 5, conditions, sets);
    const both = bruteProbability(deck, 5, (counts) => {
      return (counts.get(1) ?? 0) >= 1 && (counts.get(2) ?? 0) >= 1;
    });
    const either = bruteProbability(deck, 5, (counts) => {
      return (counts.get(1) ?? 0) >= 1 || (counts.get(2) ?? 0) >= 1;
    });
    // The "Through 1 Ash" condition is just a Boolean predicate; its name
    // carries the strategic assertion. The probability is the predicate's.
    expect(analysis.conditions[2]!.probability).toBeCloseTo(both, 12);
    // Normal Engine Access = union of Medius OR Vidolium, not their sum.
    const normal = analysis.sets[0]!;
    expect(normal.union).toBeCloseTo(either, 12);
    expect(normal.union).not.toBeCloseTo(
      analysis.conditions[0]!.probability +
        analysis.conditions[1]!.probability,
      5,
    );
    // Access Through 1 Ash = the single Through-1-Ash condition.
    const ash = analysis.sets[1]!;
    expect(ash.union).toBeCloseTo(both, 12);
    expect(ash.union).toBeCloseTo(ash.distribution.atLeast[0]!, 12);
  });
});
