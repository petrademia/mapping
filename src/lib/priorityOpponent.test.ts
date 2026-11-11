import { describe, expect, it } from "vitest";
import {
  createDocument,
  parseMappingJson,
  removeGroup,
  serializeMapping,
  type MappingDocument,
} from "./document";
import { moveHitTarget, addHitTarget, removeHitTarget, type HitTarget } from "./handtrap";
import { analyzeVersus, type OpponentModel } from "./handtrapVersus";

const taxonomy = { roles: [], opening_quality: { going_first: null, going_second: null } };
const req = (card_id: number) => ({ kind: "card", card_id, op: "gte", count: 1 });

/**
 * 8 cards, a five-card hand (56 hands): card 1 (x3), card 2 (x3), card 3 (x2).
 * One handtrap that can stop the cards in `hits`.
 */
function build(options: {
  routes: number[];
  hits: number[];
  priority?: HitTarget[];
  groups?: { id: string; ids: number[] }[];
  choke?: string[];
}): MappingDocument {
  return {
    ...createDocument("t"),
    main: [
      { card_id: 1, quantity: 3, taxonomy },
      { card_id: 2, quantity: 3, taxonomy },
      { card_id: 3, quantity: 2, taxonomy },
    ],
    groups: (options.groups ?? []).map((g) => ({ id: g.id, name: g.id, card_ids: g.ids })),
    choke_point_group_ids: options.choke ?? [],
    hit_priority: options.priority ?? [],
    hand_conditions: options.routes.map((card) => ({ id: `c${card}`, name: `c${card}`, requirements: [req(card)], excludes: [] })),
    hand_condition_sets: [{ id: "g", name: "Goal", condition_ids: options.routes.map((card) => `c${card}`), aggregation: "any" }],
    handtraps: [{ id: "h", name: "Ash", hits: options.hits }],
  } as unknown as MappingDocument;
}

function survival(doc: MappingDocument, opponent: OpponentModel): number {
  const out = analyzeVersus(doc, [{ id: "s", label: "Ash", handtrapIds: ["h"] }], { opponent });
  if ("error" in out) throw new Error(out.error);
  return Math.round(out.scenarios[0]!.goals[0]!.probability * 56);
}

describe("an opponent who goes for a list", () => {
  it("is the worst case when there is no list", () => {
    const doc = build({ routes: [1], hits: [1, 3] });
    expect(survival(doc, "worst_case")).toBe(40); // needs two copies of card 1
    expect(survival(doc, "priority")).toBe(40); // nothing listed: the same worst case
  });

  it("wastes the handtrap on a bait card ranked above the real target", () => {
    // Goal is card 1. Card 3 is bait: if it is in hand the handtrap goes there first.
    const doc = build({ routes: [1], hits: [1, 3], priority: [{ kind: "card", card_id: 3 }, { kind: "card", card_id: 1 }] });
    // Worst case 40. Following the list: with a card 3 in hand any hand that meets the goal
    // survives; without one it needs two card 1: 6 + 30 + 19 = 55 of 56.
    expect(survival(doc, "worst_case")).toBe(40);
    expect(survival(doc, "priority")).toBe(55);
  });

  it("does not hit what it cannot stop", () => {
    // The handtrap cannot stop card 3, so the bait is out of reach and the list adds nothing.
    const doc = build({ routes: [1], hits: [1], priority: [{ kind: "card", card_id: 3 }, { kind: "card", card_id: 1 }] });
    expect(survival(doc, "priority")).toBe(40);
  });

  it("falls back to the worst case when no listed card is in reach", () => {
    // Listed: card 2, which never matters. Hands holding one lose the handtrap on it (55 hands
    // that meet the goal survive); the one hand with no card 2 gets the worst case and survives.
    const doc = build({ routes: [1], hits: [1, 2, 3], priority: [{ kind: "card", card_id: 2 }] });
    expect(survival(doc, "priority")).toBe(55);
  });

  it("goes for a Group, and you choose which of its cards is stopped", () => {
    // Card 1 and card 3 are one Group (two ways into the same step); card 2 is a route of its own.
    const groups = [{ id: "into", ids: [1, 3] }];
    const target: HitTarget[] = [{ kind: "group", group_id: "into" }];
    const routes = [1, 3, 2];
    // Not marked as a choke point: a second card of the Group is a backup, so everything survives.
    expect(survival(build({ routes, hits: [1, 2, 3], priority: target, groups }), "priority")).toBe(56);
    // Marked: only one card of the Group can be used, so the stop ends it and card 2 must carry
    // the goal: only the one hand with no card 2 fails.
    expect(survival(build({ routes, hits: [1, 2, 3], priority: target, groups, choke: ["into"] }), "priority")).toBe(55);
  });
});

describe("the list is part of the saved deck", () => {
  const target: HitTarget[] = [
    { kind: "group", group_id: "into" },
    { kind: "card", card_id: 3 },
  ];
  const doc = build({ routes: [1], hits: [1], priority: target, groups: [{ id: "into", ids: [1] }] });

  it("is saved and read back in order", () => {
    expect(parseMappingJson(serializeMapping(doc)).hit_priority).toEqual(target);
  });

  it("drops a Group that is gone, and a Group target goes with its Group", () => {
    expect(removeGroup(doc, "into").hit_priority).toEqual([{ kind: "card", card_id: 3 }]);
    const old = JSON.parse(serializeMapping(doc)) as Record<string, unknown>;
    old.hit_priority = [...target, { kind: "group", group_id: "nope" }, { kind: "card", card_id: 3 }, { kind: "card", card_id: -1 }];
    expect(parseMappingJson(JSON.stringify(old)).hit_priority).toEqual(target); // repeats and unknowns dropped
    delete old.hit_priority;
    expect(parseMappingJson(JSON.stringify(old)).hit_priority).toEqual([]);
  });

  it("can be edited: add once, move, remove", () => {
    let next = addHitTarget({ ...doc, hit_priority: [] }, { kind: "card", card_id: 1 });
    next = addHitTarget(next, { kind: "card", card_id: 1 }); // the same card is not added twice
    next = addHitTarget(next, { kind: "card", card_id: 2 });
    expect(next.hit_priority.map((t) => (t.kind === "card" ? t.card_id : t.group_id))).toEqual([1, 2]);
    next = moveHitTarget(next, 1, -1);
    expect(next.hit_priority.map((t) => (t.kind === "card" ? t.card_id : t.group_id))).toEqual([2, 1]);
    expect(moveHitTarget(next, 0, -1)).toBe(next); // cannot move off the top
    expect(removeHitTarget(next, 0).hit_priority).toEqual([{ kind: "card", card_id: 1 }]);
  });
});
