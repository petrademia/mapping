import { describe, expect, it } from "vitest";
import {
  createDocument,
  parseMappingJson,
  removeGroup,
  serializeMapping,
  type MappingDocument,
} from "./document";
import { analyzeVersus, handVersus } from "./handtrapVersus";

const taxonomy = { roles: [], opening_quality: { going_first: null, going_second: null } };

/**
 * 8 cards, a five-card hand (56 hands).
 * Card 1 (x3) and card 2 (x3) are cards that need the Normal Summon, card 3 (x2) does not.
 */
function base(): MappingDocument {
  return {
    ...createDocument("t"),
    main: [
      { card_id: 1, quantity: 3, taxonomy },
      { card_id: 2, quantity: 3, taxonomy },
      { card_id: 3, quantity: 2, taxonomy },
    ],
    hand_conditions: [],
    hand_condition_sets: [],
    handtraps: [],
    groups: [{ id: "ns", name: "Normal Summon", card_ids: [1] }],
    choke_point_group_ids: [],
  } as unknown as MappingDocument;
}

const req = (card_id: number) => ({ kind: "card", card_id, op: "gte", count: 1 });

function withGoal(
  doc: MappingDocument,
  conditions: { id: string; requirements: unknown[] }[],
  hits: number[],
  ns: { ids: number[] } | null,
): MappingDocument {
  return {
    ...doc,
    groups: ns ? [{ id: "ns", name: "Normal Summon", card_ids: ns.ids }] : [],
    choke_point_group_ids: ns ? ["ns"] : [],
    hand_conditions: conditions.map((c) => ({ id: c.id, name: c.id, requirements: c.requirements, excludes: [] })),
    hand_condition_sets: [{ id: "g", name: "Goal", condition_ids: conditions.map((c) => c.id), aggregation: "any" }],
    handtraps: [{ id: "h", name: "Veiler", hits }],
  } as unknown as MappingDocument;
}

function survival(doc: MappingDocument): number {
  const out = analyzeVersus(doc, [{ id: "s", label: "Veiler", handtrapIds: ["h"] }]);
  if ("error" in out) throw new Error(out.error);
  return out.scenarios[0]!.goals[0]!.probability;
}

describe("a Group marked as a choke point lets only one of its cards complete a turn", () => {
  it("a spare copy of a Normal Summon card does not cover for the one that was stopped", () => {
    const goal = [{ id: "c1", requirements: [req(1)] }];
    // Plain: the goal survives any hand with two copies of card 1: 40 of 56.
    expect(survival(withGoal(base(), goal, [1], null))).toBeCloseTo(40 / 56, 12);
    // Sharing the Normal Summon: the copy you summon is the one they stop, so nothing survives.
    expect(survival(withGoal(base(), goal, [1], { ids: [1] }))).toBe(0);
  });

  it("another starter that does not need the Normal Summon still covers", () => {
    const goal = [
      { id: "c1", requirements: [req(1)] },
      { id: "c3", requirements: [req(3)] },
    ];
    // Plain: every hand that meets the goal survives, since two copies of card 1 or any card 3 is enough.
    expect(survival(withGoal(base(), goal, [1], null))).toBeCloseTo(1, 12);
    // Sharing: only the hands holding a card 3 survive (50 of 56).
    expect(survival(withGoal(base(), goal, [1], { ids: [1] }))).toBeCloseTo(50 / 56, 12);
  });

  it("a goal that needs two Normal Summon cards at once cannot be met", () => {
    const goal = [{ id: "both", requirements: [req(1), req(2)] }];
    // Plain: a hand with both card 1 and card 2: 54 of 56 (the handtrap hits card 3, so it changes nothing).
    expect(survival(withGoal(base(), goal, [3], null))).toBeCloseTo(54 / 56, 12);
    expect(survival(withGoal(base(), goal, [3], { ids: [1, 2] }))).toBe(0);
  });

  it("judges one drawn hand the same way", () => {
    const goal = [
      { id: "c1", requirements: [req(1)] },
      { id: "c3", requirements: [req(3)] },
    ];
    const plain = withGoal(base(), goal, [1], null);
    const shared = withGoal(base(), goal, [1], { ids: [1] });
    // Two copies of card 1 and nothing else: fine without the rule, broken with it.
    expect(handVersus(plain, { 1: 2, 2: 3 }, ["h"])[0]).toMatchObject({ holds: true, survives: true });
    expect(handVersus(shared, { 1: 2, 2: 3 }, ["h"])[0]).toMatchObject({
      holds: true,
      survives: false,
      negated: [1],
    });
    // A card that does not need the Normal Summon backs it up either way.
    expect(handVersus(shared, { 1: 1, 3: 1, 2: 3 }, ["h"])[0]).toMatchObject({ survives: true });
  });

  it("is saved, read back, and dropped with its Group", () => {
    const doc = withGoal(base(), [{ id: "c1", requirements: [req(1)] }], [1], { ids: [1] });
    expect(parseMappingJson(serializeMapping(doc)).choke_point_group_ids).toEqual(["ns"]);
    expect(removeGroup(doc, "ns").choke_point_group_ids).toEqual([]);
    // A file from before this existed, or naming a Group that is gone, has none.
    const old = JSON.parse(serializeMapping(doc)) as Record<string, unknown>;
    delete old.choke_point_group_ids;
    expect(parseMappingJson(JSON.stringify(old)).choke_point_group_ids).toEqual([]);
    expect(parseMappingJson(JSON.stringify({ ...old, choke_point_group_ids: ["gone", "ns"] })).choke_point_group_ids).toEqual(["ns"]);
  });

  it("reads the single Normal Summon Group of an earlier file as one choke point", () => {
    const doc = withGoal(base(), [{ id: "c1", requirements: [req(1)] }], [1], { ids: [1] });
    const old = JSON.parse(serializeMapping(doc)) as Record<string, unknown>;
    delete old.choke_point_group_ids;
    old.normal_summon_group_id = "ns";
    expect(parseMappingJson(JSON.stringify(old)).choke_point_group_ids).toEqual(["ns"]);
  });
});

/** Two routes (card 1 or card 2), each a Group of its own, one handtrap that stops any card. */
function twoGroups(groupIds: number[][]): MappingDocument {
  const goal = [
    { id: "c1", requirements: [req(1)] },
    { id: "c2", requirements: [req(2)] },
  ];
  const doc = withGoal(base(), goal, [1, 2, 3], null);
  return {
    ...doc,
    groups: groupIds.map((ids, index) => ({ id: `g${index}`, name: `Group ${index}`, card_ids: ids })),
    choke_point_group_ids: groupIds.map((_, index) => `g${index}`),
  } as unknown as MappingDocument;
}

describe("several choke points", () => {
  it("each marked Group is one route, however many cards it holds", () => {
    // Five route cards in hand always give two or more: every hand survives with none marked.
    expect(survival(twoGroups([]))).toBeCloseTo(56 / 56, 12);
    // Card 1 marked: the hand with three card 1 and two card 3 has one usable route only (55 of 56).
    expect(survival(twoGroups([[1]]))).toBeCloseTo(55 / 56, 12);
    // Both marked: survival needs a card 1 and a card 2, so the two hands missing either one fail (54 of 56).
    expect(survival(twoGroups([[1], [2]]))).toBeCloseTo(54 / 56, 12);
  });

  it("judges one drawn hand with every marked Group", () => {
    const both = twoGroups([[1], [2]]);
    // One of each group: a negation on either leaves the other.
    expect(handVersus(both, { 1: 2, 2: 2, 3: 1 }, ["h"])[0]).toMatchObject({ holds: true, survives: true });
    // Three copies of card 1 and none of card 2: only one usable route, so it breaks.
    expect(handVersus(both, { 1: 3, 2: 0, 3: 2 }, ["h"])[0]).toMatchObject({
      holds: true,
      survives: false,
      negated: [1],
    });
  });
});
