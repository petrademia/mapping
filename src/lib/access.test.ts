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
} from "./probability";
import { summarizeAccessConditions } from "./handExplorer";
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

describe("access conditions", () => {
  it("computes one-card access condition exactly", () => {
    const main = [card(1, 3), card(2, 37)];
    const conditions: AccessCondition[] = [
      {
        id: "a",
        name: "Card access",
        requirements: [{ kind: "card", card_id: 1, op: "gte", count: 1 }],
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
      },
    ]);
    const byRole = summarizeAccessConditions(main, 5, [
      {
        id: "r",
        name: "role",
        requirements: [{ kind: "role", role: "interaction", op: "gte", count: 1 }],
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
      },
      {
        id: "b",
        name: "Starter",
        requirements: [{ kind: "role", role: "starter", op: "gte", count: 1 }],
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
    });
    const restored = parseMappingJson(serializeMapping(doc));
    expect(restored.schema_version).toBe(4);
    expect(restored.access_groups).toEqual(doc.access_groups);
    expect(restored.access_conditions).toEqual(doc.access_conditions);
  });

  it("strips group requirements when a group is removed", () => {
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
    });
    doc = removeAccessGroup(doc, "g1");
    expect(doc.access_groups).toEqual([]);
    expect(doc.access_conditions[0]!.requirements).toEqual([
      { kind: "card", card_id: 1, op: "gte", count: 1 },
    ]);
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
    expect(restored.schema_version).toBe(4);
    expect(restored.access_groups).toEqual([]);
    expect(restored.access_conditions).toEqual([]);
  });
});
