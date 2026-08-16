import { describe, expect, it } from "vitest";
import {
  groupsToMembership,
  type AccessCondition,
  type AccessGroup,
} from "./access";
import {
  createDocument,
  parseMappingJson,
  removeAccessGroup,
  serializeMapping,
  upsertAccessCondition,
  upsertAccessGroup,
  type MappingCard,
} from "./document";
import {
  openingAtLeastProbability,
  combinations,
  ratioToNumber,
} from "./probability";
import { accessConditionHolds, summarizeAccessConditions } from "./handExplorer";
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

function handFor(
  deck: readonly MappingCard[],
  counts: Record<number, number>,
): number[] {
  return deck.map((entry) => counts[entry.card_id] ?? 0);
}

/** Round half-up percent string, for stable comparisons. */
function pct(value: number): string {
  return (value * 100).toFixed(4);
}

/**
 * Independent brute-force reference: enumerate every physical k-card
 * combination of the expanded deck (one entry per copy) and count how many
 * satisfy `satisfies`.
 */
function bruteAccessProbability(
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

describe("access conditions", () => {
  it("computes one-card access condition exactly", () => {
    const main = [card(1, 3), card(2, 37)];
    const conditions: AccessCondition[] = [
      {
        id: "a",
        name: "Card access",
        requirements: [{ kind: "card", card_id: 1, op: "gte", count: 1 }],
        excludes: [],
      },
    ];
    const summary = summarizeAccessConditions(main, 5, conditions);
    expect(summary.conditions).toHaveLength(1);
    expect(summary.conditions[0]!.probability).toBeCloseTo(
      openingAtLeastProbability(40, 3, 5, 1),
      12,
    );
    expect(summary.anyAccess).toBeCloseTo(summary.conditions[0]!.probability, 12);
    expect(summary.total).toBe(combinations(40, 5));
  });

  it("requires both requirements in a two-requirement access condition", () => {
    const nervedo = 10;
    const stA = 20;
    const stB = 21;
    const main = [card(nervedo, 3), card(stA, 2), card(stB, 1), card(99, 34)];
    const groups: AccessGroup[] = [
      { id: "valid-st", name: "Valid Nervedo S/T", card_ids: [stA, stB] },
    ];
    const conditions: AccessCondition[] = [
      {
        id: "nervedo",
        name: "Nervedo Access",
        requirements: [
          { kind: "card", card_id: nervedo, op: "gte", count: 1 },
          { kind: "group", group_id: "valid-st", op: "gte", count: 1 },
        ],
        excludes: [],
      },
    ];
    const summary = summarizeAccessConditions(
      main,
      5,
      conditions,
      groupsToMembership(groups),
    );
    const pNervedo = openingAtLeastProbability(40, 3, 5, 1);
    const pGroup = openingAtLeastProbability(40, 3, 5, 1);
    // Intersection is strictly less than either marginal when piles are disjoint.
    expect(summary.conditions[0]!.probability).toBeLessThan(pNervedo);
    expect(summary.conditions[0]!.probability).toBeLessThan(pGroup);
    expect(summary.conditions[0]!.probability).toBeGreaterThan(0);
  });

  it("supports card, role, and group subjects", () => {
    const main = [
      card(1, 3, ["starter"]),
      card(2, 2, ["interaction"]),
      card(3, 2),
      card(4, 33),
    ];
    const groups = groupsToMembership([
      { id: "g", name: "G", card_ids: [3] },
    ]);
    const byCard = summarizeAccessConditions(main, 5, [
      {
        id: "c",
        name: "card",
        requirements: [{ kind: "card", card_id: 1, op: "gte", count: 1 }],
        excludes: [],
      },
    ]);
    const byRole = summarizeAccessConditions(main, 5, [
      {
        id: "r",
        name: "role",
        requirements: [{ kind: "role", role: "interaction", op: "gte", count: 1 }],
        excludes: [],
      },
    ]);
    const byGroup = summarizeAccessConditions(
      main,
      5,
      [
        {
          id: "g",
          name: "group",
          requirements: [{ kind: "group", group_id: "g", op: "gte", count: 1 }],
          excludes: [],
        },
      ],
      groups,
    );
    expect(byCard.conditions[0]!.probability).toBeCloseTo(
      openingAtLeastProbability(40, 3, 5, 1),
      12,
    );
    expect(byRole.conditions[0]!.probability).toBeCloseTo(
      openingAtLeastProbability(40, 2, 5, 1),
      12,
    );
    expect(byGroup.conditions[0]!.probability).toBeCloseTo(
      openingAtLeastProbability(40, 2, 5, 1),
      12,
    );
  });

  it("counts multi-card groups as a single pile", () => {
    const main = [card(1, 1), card(2, 1), card(3, 1), card(4, 37)];
    const groups = groupsToMembership([
      { id: "g", name: "G", card_ids: [1, 2, 3] },
    ]);
    const summary = summarizeAccessConditions(
      main,
      5,
      [
        {
          id: "g",
          name: "group",
          requirements: [{ kind: "group", group_id: "g", op: "gte", count: 1 }],
          excludes: [],
        },
      ],
      groups,
    );
    expect(summary.conditions[0]!.probability).toBeCloseTo(
      openingAtLeastProbability(40, 3, 5, 1),
      12,
    );
  });

  it("does not double-count overlapping access conditions in the union", () => {
    const vidolium = 50;
    const main = [card(vidolium, 3, ["starter"]), card(99, 37)];
    const conditions: AccessCondition[] = [
      {
        id: "a",
        name: "Vidolium",
        requirements: [{ kind: "card", card_id: vidolium, op: "gte", count: 1 }],
        excludes: [],
      },
      {
        id: "b",
        name: "Starter",
        requirements: [{ kind: "role", role: "starter", op: "gte", count: 1 }],
        excludes: [],
      },
    ];
    const summary = summarizeAccessConditions(main, 5, conditions);
    const p = openingAtLeastProbability(40, 3, 5, 1);
    expect(summary.conditions[0]!.probability).toBeCloseTo(p, 12);
    expect(summary.conditions[1]!.probability).toBeCloseTo(p, 12);
    // Same hands satisfy both; union equals either, not the sum.
    expect(summary.anyAccess).toBeCloseTo(p, 12);
    expect(summary.anyAccess).not.toBeCloseTo(p + p, 5);
  });

  it("counts a multi-label card toward role requirements once per copy", () => {
    const main = [card(1, 3, ["starter", "extender"]), card(2, 37)];
    const summary = summarizeAccessConditions(main, 5, [
      {
        id: "both",
        name: "starter+extender",
        requirements: [
          { kind: "role", role: "starter", op: "gte", count: 1 },
          { kind: "role", role: "extender", op: "gte", count: 1 },
        ],
        excludes: [],
      },
    ]);
    expect(summary.conditions[0]!.probability).toBeCloseTo(
      openingAtLeastProbability(40, 3, 5, 1),
      12,
    );
  });

  it("returns 0% for impossible requirements", () => {
    const main = [card(1, 1), card(2, 39)];
    const summary = summarizeAccessConditions(main, 5, [
      {
        id: "x",
        name: "impossible",
        requirements: [{ kind: "card", card_id: 1, op: "gte", count: 2 }],
        excludes: [],
      },
    ]);
    expect(summary.conditions[0]!.probability).toBe(0);
    expect(summary.anyAccess).toBe(0);
  });

  it("returns 0% for an empty access-condition list", () => {
    const main = [card(1, 3), card(2, 37)];
    const summary = summarizeAccessConditions(main, 5, []);
    expect(summary.conditions).toEqual([]);
    expect(summary.anyAccess).toBe(0);
    expect(summary.total).toBe(combinations(40, 5));
  });

  it("supports a 42-card deck and non-default hand size", () => {
    const main = [card(1, 3), card(2, 39)];
    const summary = summarizeAccessConditions(main, 6, [
      {
        id: "a",
        name: "A",
        requirements: [{ kind: "card", card_id: 1, op: "gte", count: 1 }],
        excludes: [],
      },
    ]);
    expect(summary.total).toBe(combinations(42, 6));
    expect(summary.conditions[0]!.probability).toBeCloseTo(
      openingAtLeastProbability(42, 3, 6, 1),
      12,
    );
  });

  it("round-trips groups and access conditions through serialization", () => {
    let doc = createDocument("access");
    doc = {
      ...doc,
      main: [card(1, 3), card(2, 2), card(3, 35)],
    };
    doc = upsertAccessGroup(doc, {
      id: "valid-st",
      name: "Valid Nervedo S/T",
      card_ids: [2, 3],
    });
    doc = upsertAccessCondition(doc, {
      id: "nervedo",
      name: "Nervedo Access",
      requirements: [
        { kind: "card", card_id: 1, op: "gte", count: 1 },
        { kind: "group", group_id: "valid-st", op: "gte", count: 1 },
      ],
      excludes: [{ kind: "card", card_id: 2, op: "gte", count: 1 }],
    });
    const restored = parseMappingJson(serializeMapping(doc));
    expect(restored.schema_version).toBe(5);
    expect(restored.access_groups).toEqual(doc.access_groups);
    expect(restored.access_conditions).toEqual(doc.access_conditions);
  });

  it("strips group requirements and group exclusions when a group is removed", () => {
    let doc = createDocument("access");
    doc = upsertAccessGroup(doc, {
      id: "g1",
      name: "Group",
      card_ids: [1],
    });
    doc = upsertAccessCondition(doc, {
      id: "c1",
      name: "Cond",
      requirements: [
        { kind: "card", card_id: 1, op: "gte", count: 1 },
        { kind: "group", group_id: "g1", op: "gte", count: 1 },
      ],
      excludes: [{ kind: "group", group_id: "g1", op: "gte", count: 1 }],
    });
    doc = removeAccessGroup(doc, "g1");
    expect(doc.access_groups).toEqual([]);
    expect(doc.access_conditions[0]!.requirements).toEqual([
      { kind: "card", card_id: 1, op: "gte", count: 1 },
    ]);
    expect(doc.access_conditions[0]!.excludes).toEqual([]);
  });

  it("migrates schema v2 documents with empty access fields", () => {
    const restored = parseMappingJson(
      JSON.stringify({
        schema_version: 2,
        name: "old",
        main: [
          {
            card_id: 1,
            quantity: 1,
            taxonomy: {
              roles: ["starter"],
              opening_quality: { going_first: null, going_second: null },
            },
          },
        ],
        extra: [],
        side: [],
        analysis: { opening_hand_size: 5 },
      }),
    );
    expect(restored.schema_version).toBe(5);
    expect(restored.access_groups).toEqual([]);
    expect(restored.access_conditions).toEqual([]);
  });
});

describe("access condition excludes", () => {
  const NERVEDO = 101;
  const CITRINITAS = 102;
  const TERMINUS = 103;
  const PAST_LULL = 104;
  const FILLER = 105;

  const validStGroup = (): AccessGroup => ({
    id: "valid-st",
    name: "Valid Nervedo S/T",
    // Citrinitas belongs to the group so a lone Citrinitas can satisfy the
    // group requirement and is then rejected by the exclusion.
    card_ids: [CITRINITAS, TERMINUS, PAST_LULL],
  });

  const fixtureDeck = (): MappingCard[] => [
    card(NERVEDO, 1),
    card(CITRINITAS, 2),
    card(TERMINUS, 1),
    card(PAST_LULL, 1),
    card(FILLER, 35),
  ];

  const nervedoCondition = (
    excludes: AccessCondition["excludes"] = [],
  ): AccessCondition => ({
    id: "nervedo",
    name: "Nervedo Access",
    requirements: [
      { kind: "card", card_id: NERVEDO, op: "gte", count: 1 },
      { kind: "group", group_id: "valid-st", op: "gte", count: 1 },
    ],
    excludes,
  });

  const groupCount = (counts: ReadonlyMap<number, number>): number =>
    (counts.get(CITRINITAS) ?? 0) +
    (counts.get(TERMINUS) ?? 0) +
    (counts.get(PAST_LULL) ?? 0);

  it("hand satisfies only when all requirements hold and no exclusion holds", () => {
    const deck = fixtureDeck();
    const condition = nervedoCondition([
      { kind: "card", card_id: CITRINITAS, op: "gte", count: 1 },
    ]);
    expect(
      accessConditionHolds(
        handFor(deck, { [NERVEDO]: 1, [TERMINUS]: 1 }),
        deck,
        condition,
        groupsToMembership([validStGroup()]),
      ),
    ).toBe(true);
    // Nervedo + only Citrinitas: group requirement met by Citrinitas, but the
    // exclusion fires.
    expect(
      accessConditionHolds(
        handFor(deck, { [NERVEDO]: 1, [CITRINITAS]: 1 }),
        deck,
        condition,
        groupsToMembership([validStGroup()]),
      ),
    ).toBe(false);
    // Nervedo missing.
    expect(
      accessConditionHolds(
        handFor(deck, { [TERMINUS]: 2 }),
        deck,
        condition,
        groupsToMembership([validStGroup()]),
      ),
    ).toBe(false);
  });

  it("leaves the condition valid when an exclusion predicate is false", () => {
    const deck = fixtureDeck();
    const condition = nervedoCondition([
      { kind: "card", card_id: CITRINITAS, op: "gte", count: 1 },
    ]);
    expect(
      accessConditionHolds(
        handFor(deck, { [NERVEDO]: 1, [TERMINUS]: 1 }),
        deck,
        condition,
        groupsToMembership([validStGroup()]),
      ),
    ).toBe(true);
  });

  it("rejects the hand when an exclusion predicate is true", () => {
    const deck = fixtureDeck();
    const condition = nervedoCondition([
      { kind: "card", card_id: CITRINITAS, op: "gte", count: 1 },
    ]);
    expect(
      accessConditionHolds(
        handFor(deck, { [NERVEDO]: 1, [CITRINITAS]: 1, [TERMINUS]: 1 }),
        deck,
        condition,
        groupsToMembership([validStGroup()]),
      ),
    ).toBe(false);
  });

  it("supports a card exclusion", () => {
    const deck = fixtureDeck();
    const condition = nervedoCondition([
      { kind: "card", card_id: CITRINITAS, op: "gte", count: 1 },
    ]);
    const summary = summarizeAccessConditions(
      deck,
      5,
      [condition],
      groupsToMembership([validStGroup()]),
    );
    const reference = bruteAccessProbability(deck, 5, (counts) => {
      const group = groupCount(counts);
      const citrinitas = counts.get(CITRINITAS) ?? 0;
      return (counts.get(NERVEDO) ?? 0) >= 1 && group >= 1 && citrinitas === 0;
    });
    expect(summary.conditions[0]!.probability).toBeCloseTo(reference, 12);
  });

  it("supports a role exclusion", () => {
    const deck = [
      card(1, 2, ["starter"]),
      card(2, 1, ["interaction"]),
      card(3, 37, []),
    ];
    const condition: AccessCondition = {
      id: "r",
      name: "starter without interaction",
      requirements: [{ kind: "role", role: "starter", op: "gte", count: 1 }],
      excludes: [{ kind: "role", role: "interaction", op: "gte", count: 1 }],
    };
    const summary = summarizeAccessConditions(deck, 5, [condition]);
    const reference = bruteAccessProbability(deck, 5, (counts) => {
      const starter = (counts.get(1) ?? 0) >= 1;
      const interaction = (counts.get(2) ?? 0) >= 1;
      return starter && !interaction;
    });
    expect(summary.conditions[0]!.probability).toBeCloseTo(reference, 12);
  });

  it("supports a group exclusion", () => {
    const deck = [
      card(1, 2),
      card(2, 1),
      card(3, 1),
      card(4, 36),
    ];
    const groups = groupsToMembership([
      { id: "g", name: "G", card_ids: [2, 3] },
    ]);
    const condition: AccessCondition = {
      id: "c",
      name: "card without group",
      requirements: [{ kind: "card", card_id: 1, op: "gte", count: 1 }],
      excludes: [{ kind: "group", group_id: "g", op: "gte", count: 1 }],
    };
    const summary = summarizeAccessConditions(deck, 5, [condition], groups);
    const reference = bruteAccessProbability(deck, 5, (counts) => {
      const group = (counts.get(2) ?? 0) + (counts.get(3) ?? 0);
      return (counts.get(1) ?? 0) >= 1 && group === 0;
    });
    expect(summary.conditions[0]!.probability).toBeCloseTo(reference, 12);
  });

  it("handles an excluded card that is also a required group member", () => {
    // group requirement + card exclusion overlap.
    const deck = fixtureDeck();
    const condition = nervedoCondition([
      { kind: "card", card_id: CITRINITAS, op: "gte", count: 1 },
    ]);
    // A hand with exactly Nervedo + Citrinitas satisfies the group requirement
    // (Citrinitas is in the group) but is then rejected by the exclusion.
    const hand = handFor(deck, { [NERVEDO]: 1, [CITRINITAS]: 1 });
    const groups = groupsToMembership([validStGroup()]);
    expect(
      accessConditionHolds(hand, deck, condition, groups),
    ).toBe(false);
  });

  it("keeps a condition unaffected by an impossible exclusion", () => {
    const deck = fixtureDeck();
    const impossible: AccessCondition = {
      id: "impossible-exclude",
      name: "impossible exclude",
      requirements: [{ kind: "card", card_id: NERVEDO, op: "gte", count: 1 }],
      // Card never seen: exclusion predicate can never hold.
      excludes: [{ kind: "card", card_id: 999, op: "gte", count: 1 }],
    };
    const without: AccessCondition = {
      id: "plain",
      name: "plain",
      requirements: [{ kind: "card", card_id: NERVEDO, op: "gte", count: 1 }],
      excludes: [],
    };
    const groups = groupsToMembership([validStGroup()]);
    const a = summarizeAccessConditions(deck, 5, [impossible], groups);
    const b = summarizeAccessConditions(deck, 5, [without], groups);
    expect(a.conditions[0]!.probability).toBe(b.conditions[0]!.probability);
    expect(a.conditions[0]!.probability).toBeCloseTo(
      openingAtLeastProbability(40, 1, 5, 1),
      12,
    );
  });

  it("behaves identically with an empty excludes array (requires only)", () => {
    const deck = fixtureDeck();
    const groups = groupsToMembership([validStGroup()]);
    const withEmpty: AccessCondition = nervedoCondition([]);
    const expectHolds = nervedoCondition([]);
    const summary = summarizeAccessConditions(deck, 5, [withEmpty], groups);
    const plainRequirementsOnly = summarizeAccessConditions(
      deck,
      5,
      [expectHolds],
      groups,
    );
    expect(summary.conditions[0]!.probability).toBe(
      plainRequirementsOnly.conditions[0]!.probability,
    );
  });

  it("compares a Nervedo fixture against brute force (40 cards, 5 drawn)", () => {
    const deck = fixtureDeck();
    const condition = nervedoCondition([
      { kind: "card", card_id: CITRINITAS, op: "gte", count: 1 },
    ]);
    const summary = summarizeAccessConditions(
      deck,
      5,
      [condition],
      groupsToMembership([validStGroup()]),
    );
    const reference = bruteAccessProbability(deck, 5, (counts) => {
      const group = groupCount(counts);
      const citrinitas = counts.get(CITRINITAS) ?? 0;
      return (counts.get(NERVEDO) ?? 0) >= 1 && group >= 1 && citrinitas === 0;
    });
    expect(summary.total).toBe(combinations(40, 5));
    expect(pct(summary.conditions[0]!.probability)).toBe(pct(reference));
  });

  it("supports multiple exclusions (card and count operator)", () => {
    const deck = fixtureDeck();
    const condition = nervedoCondition([
      { kind: "card", card_id: CITRINITAS, op: "gte", count: 2 },
      { kind: "card", card_id: TERMINUS, op: "gte", count: 1 },
    ]);
    const summary = summarizeAccessConditions(
      deck,
      5,
      [condition],
      groupsToMembership([validStGroup()]),
    );
    const reference = bruteAccessProbability(deck, 5, (counts) => {
      const group = groupCount(counts);
      return (
        (counts.get(NERVEDO) ?? 0) >= 1 &&
        group >= 1 &&
        (counts.get(CITRINITAS) ?? 0) < 2 &&
        (counts.get(TERMINUS) ?? 0) === 0
      );
    });
    expect(summary.conditions[0]!.probability).toBeCloseTo(reference, 12);
  });

  it("handles an exclusion with >= 2 against multi-copy cards", () => {
    const deck = fixtureDeck();
    const condition = nervedoCondition([
      { kind: "card", card_id: CITRINITAS, op: "gte", count: 2 },
    ]);
    const summary = summarizeAccessConditions(
      deck,
      5,
      [condition],
      groupsToMembership([validStGroup()]),
    );
    const reference = bruteAccessProbability(deck, 5, (counts) => {
      const group = groupCount(counts);
      const citrinitas = counts.get(CITRINITAS) ?? 0;
      return (
        (counts.get(NERVEDO) ?? 0) >= 1 && group >= 1 && citrinitas < 2
      );
    });
    expect(summary.conditions[0]!.probability).toBeCloseTo(reference, 12);
  });

  it("matches brute force on a 42-card deck with exclusions", () => {
    const deck = [
      card(1, 3),
      card(2, 2),
      card(3, 37),
    ];
    const condition: AccessCondition = {
      id: "a42",
      name: "42 danger",
      requirements: [{ kind: "card", card_id: 1, op: "gte", count: 1 }],
      excludes: [{ kind: "card", card_id: 2, op: "gte", count: 1 }],
    };
    const summary = summarizeAccessConditions(deck, 6, [condition]);
    const reference = bruteAccessProbability(deck, 6, (counts) => {
      return (counts.get(1) ?? 0) >= 1 && (counts.get(2) ?? 0) === 0;
    });
    expect(summary.total).toBe(combinations(42, 6));
    expect(pct(summary.conditions[0]!.probability)).toBe(pct(reference));
  });

  it("supports a 6-card observation point with exclusions", () => {
    const deck = fixtureDeck();
    const condition = nervedoCondition([
      { kind: "card", card_id: CITRINITAS, op: "gte", count: 1 },
    ]);
    const summary = summarizeAccessConditions(
      deck,
      6,
      [condition],
      groupsToMembership([validStGroup()]),
    );
    const reference = bruteAccessProbability(deck, 6, (counts) => {
      const group = groupCount(counts);
      const citrinitas = counts.get(CITRINITAS) ?? 0;
      return (counts.get(NERVEDO) ?? 0) >= 1 && group >= 1 && citrinitas === 0;
    });
    expect(summary.conditions[0]!.probability).toBeCloseTo(reference, 12);
  });

  it("does not double-count overlapping conditions with exclusions in the union", () => {
    const deck = [
      card(1, 3, ["starter"]),
      card(2, 2, ["interaction"]),
      card(3, 35),
    ];
    const conditions: AccessCondition[] = [
      {
        id: "a",
        name: "card 1 without interaction",
        requirements: [{ kind: "card", card_id: 1, op: "gte", count: 1 }],
        excludes: [{ kind: "role", role: "interaction", op: "gte", count: 1 }],
      },
      {
        id: "b",
        name: "starter without interaction",
        requirements: [{ kind: "role", role: "starter", op: "gte", count: 1 }],
        excludes: [{ kind: "role", role: "interaction", op: "gte", count: 1 }],
      },
    ];
    const summary = summarizeAccessConditions(deck, 5, conditions);
    // Both conditions are satisfied by exactly the same hands.
    expect(summary.conditions[0]!.weight).toBe(summary.conditions[1]!.weight);
    expect(summary.anyAccess).toBeCloseTo(
      summary.conditions[0]!.probability,
      12,
    );
    expect(summary.anyAccess).not.toBeCloseTo(
      summary.conditions[0]!.probability +
        summary.conditions[1]!.probability,
      5,
    );
  });

  it("includes an excluded condition correctly in the overall union", () => {
    const deck = [card(1, 2, ["starter"]), card(2, 1), card(3, 37)];
    const conditions: AccessCondition[] = [
      {
        id: "a",
        name: "card 1 without card 2",
        requirements: [{ kind: "card", card_id: 1, op: "gte", count: 1 }],
        excludes: [{ kind: "card", card_id: 2, op: "gte", count: 1 }],
      },
      {
        id: "b",
        name: "card 2",
        requirements: [{ kind: "card", card_id: 2, op: "gte", count: 1 }],
        excludes: [],
      },
    ];
    const summary = summarizeAccessConditions(deck, 5, conditions);
    const reference = bruteAccessProbability(deck, 5, (counts) => {
      const card1 = (counts.get(1) ?? 0) >= 1;
      const card2 = (counts.get(2) ?? 0) >= 1;
      return (card1 && !card2) || card2;
    });
    expect(summary.conditions[0]!.probability).toBeCloseTo(
      bruteAccessProbability(deck, 5, (counts) => {
        return (counts.get(1) ?? 0) >= 1 && (counts.get(2) ?? 0) === 0;
      }),
      12,
    );
    expect(summary.anyAccess).toBeCloseTo(reference, 12);
  });

  it("migrates a persisted v4 condition (requirements only) to excludes = []", () => {
    const restored = parseMappingJson(
      JSON.stringify({
        schema_version: 4,
        name: "legacy-access",
        main: [{ card_id: 1, quantity: 3, taxonomy: tax() }],
        extra: [],
        side: [],
        access_conditions: [
          {
            id: "legacy",
            name: "Legacy Access",
            requirements: [
              { kind: "card", card_id: 1, op: "gte", count: 1 },
            ],
          },
        ],
        analysis: { opening_hand_size: 5 },
      }),
    );
    expect(restored.schema_version).toBe(5);
    expect(restored.access_conditions[0]!.requirements).toEqual([
      { kind: "card", card_id: 1, op: "gte", count: 1 },
    ]);
    expect(restored.access_conditions[0]!.excludes).toEqual([]);
  });
});