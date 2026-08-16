import { describe, expect, it } from "vitest";
import {
  groupsToMembership,
  normalizeGroup,
  normalizeHandCondition,
  normalizeHandConditionSet,
  type Group,
  type HandCondition,
} from "./handCondition";
import {
  createDocument,
  engineAccessConditionIds,
  isEngineAccessCondition,
  parseMappingJson,
  removeGroup,
  removeHandCondition,
  serializeMapping,
  setEngineAccessMember,
  upsertGroup,
  upsertHandCondition,
  type MappingCard,
} from "./document";
import {
  openingAtLeastProbability,
  combinations,
  ratioToNumber,
} from "./probability";
import {
  handConditionHolds,
  summarizeHandConditions,
  type ConditionRequirement,
} from "./handExplorer";
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

function pct(value: number): string {
  return (value * 100).toFixed(4);
}

/** Independent brute-force reference: enumerate every physical k-card combo. */
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

describe("hand conditions: migration from AccessCondition", () => {
  it("loads a v5 AccessCondition as a HandCondition with requires and excludes preserved", () => {
    const restored = parseMappingJson(
      JSON.stringify({
        schema_version: 5,
        name: "legacy",
        main: [
          {
            card_id: 1,
            quantity: 3,
            taxonomy: tax(),
          },
        ],
        extra: [],
        side: [],
        access_groups: [
          { id: "valid-st", name: "Valid Nervedo S/T", card_ids: [2, 3] },
        ],
        access_conditions: [
          {
            id: "nervedo",
            name: "Nervedo Access",
            requirements: [
              { kind: "card", card_id: 1, op: "gte", count: 1 },
              { kind: "group", group_id: "valid-st", op: "gte", count: 1 },
            ],
            excludes: [{ kind: "card", card_id: 2, op: "gte", count: 1 }],
          },
        ],
        analysis: { opening_hand_size: 5 },
      }),
    );
    expect(restored.schema_version).toBe(6);
    expect(restored.groups).toEqual([
      { id: "valid-st", name: "Valid Nervedo S/T", card_ids: [2, 3] },
    ]);
    expect(restored.hand_conditions).toHaveLength(1);
    expect(restored.hand_conditions[0]!.name).toBe("Nervedo Access");
    expect(restored.hand_conditions[0]!.requirements).toEqual([
      { kind: "card", card_id: 1, op: "gte", count: 1 },
      { kind: "group", group_id: "valid-st", op: "gte", count: 1 },
    ]);
    expect(restored.hand_conditions[0]!.excludes).toEqual([
      { kind: "card", card_id: 2, op: "gte", count: 1 },
    ]);
  });

  it("preserves Modeled Engine Access membership for migrated conditions", () => {
    const restored = parseMappingJson(
      JSON.stringify({
        schema_version: 5,
        name: "legacy",
        main: [{ card_id: 1, quantity: 3, taxonomy: tax() }],
        extra: [],
        side: [],
        access_conditions: [
          {
            id: "a",
            name: "A",
            requirements: [{ kind: "card", card_id: 1, op: "gte", count: 1 }],
            excludes: [],
          },
          {
            id: "b",
            name: "B",
            requirements: [{ kind: "card", card_id: 2, op: "gte", count: 1 }],
            excludes: [],
          },
        ],
        analysis: { opening_hand_size: 5 },
      }),
    );
    // All former access conditions remain engine access members.
    expect(engineAccessConditionIds(restored)).toEqual(["a", "b"]);
  });

  it("migrates an old document with no conditions to an empty access set", () => {
    const restored = parseMappingJson(
      JSON.stringify({
        schema_version: 5,
        name: "legacy",
        main: [],
        extra: [],
        side: [],
        analysis: { opening_hand_size: 5 },
      }),
    );
    expect(restored.hand_conditions).toEqual([]);
    expect(engineAccessConditionIds(restored)).toEqual([]);
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
    expect(restored.schema_version).toBe(6);
    expect(restored.groups).toEqual([]);
    expect(restored.hand_conditions).toEqual([]);
  });

  it("round-trips v6 groups, hand conditions, sets, and engine-access id", () => {
    let doc = createDocument("access");
    doc = {
      ...doc,
      main: [card(1, 3), card(2, 2), card(3, 35)],
    };
    doc = upsertGroup(doc, {
      id: "valid-st",
      name: "Valid Nervedo S/T",
      card_ids: [2, 3],
    });
    doc = upsertHandCondition(doc, {
      id: "nervedo",
      name: "Nervedo Access",
      requirements: [
        { kind: "card", card_id: 1, op: "gte", count: 1 },
        { kind: "group", group_id: "valid-st", op: "gte", count: 1 },
      ],
      excludes: [{ kind: "card", card_id: 2, op: "gte", count: 1 }],
    });
    doc = setEngineAccessMember(doc, "nervedo", true);
    const restored = parseMappingJson(serializeMapping(doc));
    expect(restored.schema_version).toBe(6);
    expect(restored.groups).toEqual(doc.groups);
    expect(restored.hand_conditions).toEqual(doc.hand_conditions);
    expect(restored.hand_condition_sets).toEqual(doc.hand_condition_sets);
    expect(restored.engine_access_set_id).toBe(doc.engine_access_set_id);
    expect(engineAccessConditionIds(restored)).toEqual(["nervedo"]);
  });

  it("does not lose conditions through a serialize/parse cycle", () => {
    const doc = {
      ...createDocument("keep"),
      main: [card(1, 2), card(2, 2), card(3, 36)],
      hand_conditions: [
        {
          id: "c1",
          name: "Medius Access",
          requirements: [{ kind: "card" as const, card_id: 1, op: "gte" as const, count: 1 }],
          excludes: [],
        },
        {
          id: "c2",
          name: "Nervedo Access",
          requirements: [
            { kind: "card" as const, card_id: 2, op: "gte" as const, count: 1 },
          ],
          excludes: [{ kind: "card" as const, card_id: 3, op: "gte" as const, count: 1 }],
        },
      ],
    };
    const restored = parseMappingJson(serializeMapping(doc));
    expect(restored.hand_conditions).toHaveLength(2);
    expect(restored.hand_conditions[1]!.excludes).toEqual(doc.hand_conditions[1]!.excludes);
  });
});

describe("hand conditions: evaluator", () => {
  const NERVEDO = 101;
  const CITRINITAS = 102;
  const TERMINUS = 103;
  const PAST_LULL = 104;
  const FILLER = 105;

  const validStGroup = (): Group => ({
    id: "valid-st",
    name: "Valid Nervedo S/T",
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
    excludes: HandCondition["excludes"] = [],
  ): HandCondition => ({
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

  it("holds only when all requires hold and no exclusion holds", () => {
    const deck = fixtureDeck();
    const condition = nervedoCondition([
      { kind: "card", card_id: CITRINITAS, op: "gte", count: 1 },
    ]);
    const groups = groupsToMembership([validStGroup()]);
    expect(
      handConditionHolds(handFor(deck, { [NERVEDO]: 1, [TERMINUS]: 1 }), deck, condition, groups),
    ).toBe(true);
    // Nervedo + only Citrinitas: group requirement met by Citrinitas, exclusion fires.
    expect(
      handConditionHolds(handFor(deck, { [NERVEDO]: 1, [CITRINITAS]: 1 }), deck, condition, groups),
    ).toBe(false);
    expect(
      handConditionHolds(handFor(deck, { [TERMINUS]: 2 }), deck, condition, groups),
    ).toBe(false);
  });

  it("supports an empty excludes array (requires only)", () => {
    const deck = fixtureDeck();
    const condition = nervedoCondition([]);
    const groups = groupsToMembership([validStGroup()]);
    expect(
      handConditionHolds(handFor(deck, { [NERVEDO]: 1, [TERMINUS]: 1 }), deck, condition, groups),
    ).toBe(true);
  });

  it("supports card, role, and group subjects", () => {
    const main = [
      card(1, 3, ["starter"]),
      card(2, 2, ["interaction"]),
      card(3, 2),
      card(4, 33),
    ];
    const groups = groupsToMembership([{ id: "g", name: "G", card_ids: [3] }]);
    const mkreq = (c: ConditionRequirement) => ({
      id: "x",
      name: "x",
      requirements: [c],
      excludes: [] as ConditionRequirement[],
    });
    const byCard = summarizeHandConditions(main, 5, [
      mkreq({ kind: "card", card_id: 1, op: "gte", count: 1 }),
    ]);
    const byRole = summarizeHandConditions(main, 5, [
      mkreq({ kind: "role", role: "interaction", op: "gte", count: 1 }),
    ]);
    const byGroup = summarizeHandConditions(
      main,
      5,
      [mkreq({ kind: "group", group_id: "g", op: "gte", count: 1 })],
      [],
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
    const groups = groupsToMembership([{ id: "g", name: "G", card_ids: [1, 2, 3] }]);
    const summary = summarizeHandConditions(
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
      [],
      groups,
    );
    expect(summary.conditions[0]!.probability).toBeCloseTo(
      openingAtLeastProbability(40, 3, 5, 1),
      12,
    );
  });

  it("counts a multi-label card toward role requirements once per copy", () => {
    const main = [card(1, 3, ["starter", "extender"]), card(2, 37)];
    const summary = summarizeHandConditions(main, 5, [
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

  it("requires all requirements in a two-requirement condition", () => {
    const main = [card(1, 3), card(2, 2), card(3, 1), card(99, 34)];
    const groups = groupsToMembership([
      { id: "valid-st", name: "Valid Nervedo S/T", card_ids: [2, 3] },
    ]);
    const summary = summarizeHandConditions(
      main,
      5,
      [
        {
          id: "n",
          name: "Nervedo Access",
          requirements: [
            { kind: "card", card_id: 1, op: "gte", count: 1 },
            { kind: "group", group_id: "valid-st", op: "gte", count: 1 },
          ],
          excludes: [],
        },
      ],
      [],
      groups,
    );
    const pNervedo = openingAtLeastProbability(40, 3, 5, 1);
    const pGroup = openingAtLeastProbability(40, 3, 5, 1);
    expect(summary.conditions[0]!.probability).toBeLessThan(pNervedo);
    expect(summary.conditions[0]!.probability).toBeLessThan(pGroup);
    expect(summary.conditions[0]!.probability).toBeGreaterThan(0);
  });

  it("rejects an impossible condition with probability 0", () => {
    const main = [card(1, 1), card(2, 39)];
    const summary = summarizeHandConditions(main, 5, [
      {
        id: "x",
        name: "impossible",
        requirements: [{ kind: "card", card_id: 1, op: "gte", count: 2 }],
        excludes: [],
      },
    ]);
    expect(summary.conditions[0]!.probability).toBe(0);
  });

  it("is unaffected by an impossible exclusion", () => {
    const deck = fixtureDeck();
    const impossible: HandCondition = {
      id: "impossible-exclude",
      name: "impossible exclude",
      requirements: [{ kind: "card", card_id: NERVEDO, op: "gte", count: 1 }],
      excludes: [{ kind: "card", card_id: 999, op: "gte", count: 1 }],
    };
    const without: HandCondition = {
      id: "plain",
      name: "plain",
      requirements: [{ kind: "card", card_id: NERVEDO, op: "gte", count: 1 }],
      excludes: [],
    };
    const groups = groupsToMembership([validStGroup()]);
    const a = summarizeHandConditions(deck, 5, [impossible], [], groups);
    const b = summarizeHandConditions(deck, 5, [without], [], groups);
    expect(a.conditions[0]!.probability).toBe(b.conditions[0]!.probability);
  });

  it("matches a Nervedo fixture against brute force (40 cards, 5 drawn)", () => {
    const deck = fixtureDeck();
    const condition = nervedoCondition([
      { kind: "card", card_id: CITRINITAS, op: "gte", count: 1 },
    ]);
    const summary = summarizeHandConditions(
      deck,
      5,
      [condition],
      ["nervedo"],
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

  it("supports multiple exclusions and multi-copy predicates (>= 2)", () => {
    const deck = fixtureDeck();
    const condition = nervedoCondition([
      { kind: "card", card_id: CITRINITAS, op: "gte", count: 2 },
      { kind: "card", card_id: TERMINUS, op: "gte", count: 1 },
    ]);
    const summary = summarizeHandConditions(
      deck,
      5,
      [condition],
      [],
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

  it("handles a group requirement overlapping an excluded card", () => {
    const deck = fixtureDeck();
    const condition = nervedoCondition([
      { kind: "card", card_id: CITRINITAS, op: "gte", count: 1 },
    ]);
    const hand = handFor(deck, { [NERVEDO]: 1, [CITRINITAS]: 1 });
    expect(
      handConditionHolds(
        hand,
        deck,
        condition,
        groupsToMembership([validStGroup()]),
      ),
    ).toBe(false);
  });

  it("supports a role exclusion", () => {
    const deck = [card(1, 2, ["starter"]), card(2, 1, ["interaction"]), card(3, 37)];
    const summary = summarizeHandConditions(deck, 5, [
      {
        id: "r",
        name: "starter without interaction",
        requirements: [{ kind: "role", role: "starter", op: "gte", count: 1 }],
        excludes: [{ kind: "role", role: "interaction", op: "gte", count: 1 }],
      },
    ]);
    const reference = bruteAccessProbability(deck, 5, (counts) => {
      return (counts.get(1) ?? 0) >= 1 && (counts.get(2) ?? 0) === 0;
    });
    expect(summary.conditions[0]!.probability).toBeCloseTo(reference, 12);
  });

  it("supports 42-card decks and a 6-card observation point", () => {
    const deck42 = [card(1, 3), card(2, 39)];
    const s42 = summarizeHandConditions(deck42, 6, [
      {
        id: "a",
        name: "A",
        requirements: [{ kind: "card", card_id: 1, op: "gte", count: 1 }],
        excludes: [{ kind: "card", card_id: 2, op: "gte", count: 1 }],
      },
    ]);
    expect(s42.total).toBe(combinations(42, 6));
    const reference42 = bruteAccessProbability(deck42, 6, (counts) => {
      return (counts.get(1) ?? 0) >= 1 && (counts.get(2) ?? 0) === 0;
    });
    expect(s42.conditions[0]!.probability).toBeCloseTo(reference42, 12);
  });
});

describe("hand conditions: modeled engine access", () => {
  it("unions one selected hand condition", () => {
    const deck = [card(1, 3), card(2, 37)];
    const conditions: HandCondition[] = [
      {
        id: "a",
        name: "Card access",
        requirements: [{ kind: "card", card_id: 1, op: "gte", count: 1 }],
        excludes: [],
      },
    ];
    const summary = summarizeHandConditions(deck, 5, conditions, ["a"]);
    expect(summary.conditions[0]!.probability).toBeCloseTo(
      openingAtLeastProbability(40, 3, 5, 1),
      12,
    );
    expect(summary.anyAccess).toBeCloseTo(summary.conditions[0]!.probability, 12);
  });

  it("exactly ORs multiple selected conditions without summing them", () => {
    const deck = [
      card(1, 2, ["starter"]),
      card(2, 1, ["interaction"]),
      card(3, 37),
    ];
    const conditions: HandCondition[] = [
      {
        id: "a",
        name: "card 1",
        requirements: [{ kind: "card", card_id: 1, op: "gte", count: 1 }],
        excludes: [],
      },
      {
        id: "b",
        name: "card 2",
        requirements: [{ kind: "card", card_id: 2, op: "gte", count: 1 }],
        excludes: [],
      },
    ];
    const summary = summarizeHandConditions(deck, 5, conditions, ["a", "b"]);
    const reference = bruteAccessProbability(deck, 5, (counts) => {
      return (counts.get(1) ?? 0) >= 1 || (counts.get(2) ?? 0) >= 1;
    });
    expect(summary.anyAccess).toBeCloseTo(reference, 12);
    expect(summary.anyAccess).not.toBeCloseTo(
      summary.conditions[0]!.probability + summary.conditions[1]!.probability,
      5,
    );
  });

  it("does not double-count overlapping selected conditions", () => {
    const deck = [
      card(1, 3, ["starter"]),
      card(2, 2, ["interaction"]),
      card(3, 35),
    ];
    const conditions: HandCondition[] = [
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
    const summary = summarizeHandConditions(deck, 5, conditions, ["a", "b"]);
    expect(summary.conditions[0]!.weight).toBe(summary.conditions[1]!.weight);
    expect(summary.anyAccess).toBeCloseTo(summary.conditions[0]!.probability, 12);
  });

  it("handles an excluded condition in the union", () => {
    const deck = [card(1, 2, ["starter"]), card(2, 1, ["interaction"]), card(3, 37)];
    const excluded: HandCondition = {
      id: "x",
      name: "card 1 without card 2",
      requirements: [{ kind: "card", card_id: 1, op: "gte", count: 1 }],
      excludes: [{ kind: "card", card_id: 2, op: "gte", count: 1 }],
    };
    const summary = summarizeHandConditions(deck, 5, [excluded], ["x"]);
    const withExclusion = bruteAccessProbability(deck, 5, (counts) => {
      return (counts.get(1) ?? 0) >= 1 && (counts.get(2) ?? 0) === 0;
    });
    expect(summary.anyAccess).toBeCloseTo(withExclusion, 12);
    // The exclusion shrinks the union below the plain marginal.
    expect(summary.anyAccess).toBeLessThan(
      openingAtLeastProbability(40, 2, 5, 1),
    );
  });

  it("returns zero access when no conditions are selected", () => {
    const deck = [card(1, 2), card(2, 38)];
    const conditions: HandCondition[] = [
      {
        id: "a",
        name: "A",
        requirements: [{ kind: "card", card_id: 1, op: "gte", count: 1 }],
        excludes: [],
      },
    ];
    const summary = summarizeHandConditions(deck, 5, conditions, []);
    expect(summary.anyAccess).toBe(0);
    expect(summary.accessDistribution.exact).toEqual([1]);
    expect(summary.accessDistribution.atLeast).toEqual([]);
  });

  it("flips membership through document helpers", () => {
    let doc = createDocument("access");
    doc = upsertHandCondition(doc, {
      id: "c1",
      name: "C1",
      requirements: [{ kind: "card", card_id: 1, op: "gte", count: 1 }],
      excludes: [],
    });
    expect(isEngineAccessCondition(doc, "c1")).toBe(false);
    doc = setEngineAccessMember(doc, "c1", true);
    expect(isEngineAccessCondition(doc, "c1")).toBe(true);
    expect(engineAccessConditionIds(doc)).toEqual(["c1"]);
    doc = setEngineAccessMember(doc, "c1", false);
    expect(isEngineAccessCondition(doc, "c1")).toBe(false);
    expect(engineAccessConditionIds(doc)).toEqual([]);
  });

  it("removes a deleted condition from the engine access set", () => {
    let doc = createDocument("access");
    doc = upsertHandCondition(doc, {
      id: "c1",
      name: "C1",
      requirements: [{ kind: "card", card_id: 1, op: "gte", count: 1 }],
      excludes: [],
    });
    doc = setEngineAccessMember(doc, "c1", true);
    doc = removeHandCondition(doc, "c1");
    expect(engineAccessConditionIds(doc)).toEqual([]);
  });

  it("strips group requirements and group exclusions from conditions on group removal", () => {
    let doc = createDocument("access");
    doc = upsertGroup(doc, { id: "g1", name: "Group", card_ids: [1] });
    doc = upsertHandCondition(doc, {
      id: "c1",
      name: "Cond",
      requirements: [
        { kind: "card", card_id: 1, op: "gte", count: 1 },
        { kind: "group", group_id: "g1", op: "gte", count: 1 },
      ],
      excludes: [{ kind: "group", group_id: "g1", op: "gte", count: 1 }],
    });
    doc = removeGroup(doc, "g1");
    expect(doc.groups).toEqual([]);
    expect(doc.hand_conditions[0]!.requirements).toEqual([
      { kind: "card", card_id: 1, op: "gte", count: 1 },
    ]);
    expect(doc.hand_conditions[0]!.excludes).toEqual([]);
  });
});

describe("hand conditions: access-count distribution", () => {
  it("computes exact buckets that sum to 1 and correct cumulatives", () => {
    const deck = [
      card(1, 3), // A
      card(2, 2), // B
      card(3, 1), // C
      card(4, 34), // filler
    ];
    const conditions: HandCondition[] = [
      {
        id: "A",
        name: "A",
        requirements: [{ kind: "card", card_id: 1, op: "gte", count: 1 }],
        excludes: [],
      },
      {
        id: "B",
        name: "B",
        requirements: [{ kind: "card", card_id: 2, op: "gte", count: 1 }],
        excludes: [],
      },
      {
        id: "C",
        name: "C",
        requirements: [{ kind: "card", card_id: 3, op: "gte", count: 1 }],
        excludes: [],
      },
    ];
    const summary = summarizeHandConditions(
      deck,
      2,
      conditions,
      ["A", "B", "C"],
    );
    const { exact, atLeast } = summary.accessDistribution;
    // Total hands C(40,2) = 780.
    expect(summary.total).toBe(combinations(40, 2));
    expect(exact).toHaveLength(4); // N = 0,1,2,3
    expect(exact[0]! + exact[1]! + exact[2]! + exact[3]!).toBeCloseTo(1, 12);
    expect(atLeast).toHaveLength(3);
    expect(atLeast[0]!).toBeCloseTo(1 - exact[0]!, 12);
    expect(atLeast[1]!).toBeCloseTo(exact[2]! + exact[3]!, 12);
    expect(atLeast[2]!).toBeCloseTo(exact[3]!, 12);
    expect(summary.anyAccess).toBeCloseTo(atLeast[0]!, 12);
  });

  it("matches brute force for N >= 3 on a small deck", () => {
    const deck = [card(1, 1), card(2, 1), card(3, 1), card(4, 17)];
    const conditions: HandCondition[] = [1, 2, 3].map((id) => ({
      id: `c${id}`,
      name: `c${id}`,
      requirements: [{ kind: "card", card_id: id, op: "gte", count: 1 }],
      excludes: [],
    }));
    const summary = summarizeHandConditions(
      deck,
      3,
      conditions,
      ["c1", "c2", "c3"],
    );
    const ref = bruteAccessProbability(deck, 3, (counts) => {
      return (
        (counts.get(1) ?? 0) >= 1 &&
        (counts.get(2) ?? 0) >= 1 &&
        (counts.get(3) ?? 0) >= 1
      );
    });
    expect(summary.accessDistribution.atLeast[2]!).toBeCloseTo(ref, 12);
    const refAtLeast1 = bruteAccessProbability(deck, 3, (counts) => {
      return [1, 2, 3].some((id) => (counts.get(id) ?? 0) >= 1);
    });
    const refAtLeast2 = bruteAccessProbability(deck, 3, (counts) => {
      let n = 0;
      for (const id of [1, 2, 3]) if ((counts.get(id) ?? 0) >= 1) n += 1;
      return n >= 2;
    });
    expect(summary.accessDistribution.atLeast[0]!).toBeCloseTo(refAtLeast1, 12);
    expect(summary.accessDistribution.atLeast[1]!).toBeCloseTo(refAtLeast2, 12);
  });

  it("exposes only the selected conditions in the distribution", () => {
    const deck = [card(1, 2), card(2, 2), card(3, 36)];
    const conditions: HandCondition[] = [
      { id: "a", name: "A", requirements: [{ kind: "card", card_id: 1, op: "gte", count: 1 }], excludes: [] },
      { id: "b", name: "B", requirements: [{ kind: "card", card_id: 2, op: "gte", count: 1 }], excludes: [] },
    ];
    const summary = summarizeHandConditions(deck, 5, conditions, ["b"]);
    // Only B is selected, so N_access in {0,1}.
    expect(summary.accessDistribution.exact).toHaveLength(2);
    expect(summary.anyAccess).toBeCloseTo(
      summary.accessDistribution.exact[1]!,
      12,
    );
  });
});
describe("hand conditions: empty names stay editable", () => {
  it("keeps an empty name instead of substituting a default", () => {
    expect(normalizeGroup({ id: "g", name: "", card_ids: [] }).name).toBe("");
    expect(
      normalizeHandCondition({
        id: "c",
        name: "   ",
        requirements: [],
        excludes: [],
      }).name,
    ).toBe("");
    expect(
      normalizeHandConditionSet({
        id: "s",
        name: "",
        condition_ids: [],
        aggregation: "any",
      }).name,
    ).toBe("");
  });

  it("does not snap an emptied name back to a default on upsert", () => {
    let doc = createDocument("names");
    doc = upsertGroup(doc, { id: "g1", name: "Group", card_ids: [] });
    doc = upsertGroup(doc, { id: "g1", name: "", card_ids: [] });
    expect(doc.groups[0]!.name).toBe("");
  });
});
