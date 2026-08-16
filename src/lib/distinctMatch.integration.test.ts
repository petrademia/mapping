import { describe, expect, it } from "vitest";
import {
  analyzeHandConditions,
  evaluateHandCondition,
  handConditionHolds,
} from "./handExplorer";
import {
  normalizeHandCondition,
  parseHandCondition,
  groupsToMembership,
} from "./handCondition";
import {
  parseMappingJson,
  serializeMapping,
  createDocument,
  SCHEMA_VERSION,
} from "./document";
import type { MappingCard } from "./document";
import type { CardTaxonomy } from "./taxonomy";

function tax(roles: CardTaxonomy["roles"] = []): CardTaxonomy {
  return {
    roles,
    opening_quality: { going_first: null, going_second: null },
  };
}

const medius = 100;
const vidolium = 200;
const ash = 300;

function tinyDeck(): MappingCard[] {
  return [
    { card_id: medius, quantity: 2, taxonomy: tax(["starter", "extender"]) },
    { card_id: vidolium, quantity: 1, taxonomy: tax(["starter", "extender"]) },
    { card_id: ash, quantity: 1, taxonomy: tax(["interaction"]) },
  ];
}

describe("distinct match persistence", () => {
  it("migrates old documents to empty distinct_constraints", () => {
    const json = JSON.stringify({
      schema_version: 6,
      name: "legacy",
      main: [{ card_id: 1, quantity: 3, taxonomy: { roles: [], opening_quality: { going_first: null, going_second: null } } }],
      extra: [],
      side: [],
      groups: [],
      hand_conditions: [
        {
          id: "c1",
          name: "Legacy",
          requirements: [{ kind: "card", card_id: 1, op: "gte", count: 1 }],
          excludes: [],
        },
      ],
      hand_condition_sets: [],
      engine_access_set_id: null,
      analysis: {
        opening_hand_size: 5,
        turn_order: "going_first",
        observation_point: "opening_hand",
      },
    });
    const doc = parseMappingJson(json);
    expect(doc.schema_version).toBe(SCHEMA_VERSION);
    expect(doc.hand_conditions[0]?.distinct_constraints).toEqual([]);
    expect(doc.hand_conditions[0]?.requirements[0]?.id).toBeTruthy();
  });

  it("round-trips distinct constraints and requirement ids", () => {
    const doc = {
      ...createDocument("distinct-rt"),
      main: tinyDeck(),
      groups: [
        { id: "starters", name: "Starters", card_ids: [medius, vidolium] },
        { id: "extenders", name: "Extenders", card_ids: [medius, vidolium] },
      ],
      hand_conditions: [
        normalizeHandCondition({
          id: "best",
          name: "Best Hand",
          requirements: [
            {
              id: "req-s",
              kind: "group",
              group_id: "starters",
              op: "gte",
              count: 1,
            },
            {
              id: "req-e",
              kind: "group",
              group_id: "extenders",
              op: "gte",
              count: 1,
            },
          ],
          excludes: [],
          distinct_constraints: [
            {
              id: "dc-1",
              requirement_ids: ["req-s", "req-e"],
              distinct_by: "card_name",
            },
          ],
        }),
      ],
    };
    const restored = parseMappingJson(serializeMapping(doc));
    expect(restored.hand_conditions[0]?.distinct_constraints).toEqual([
      {
        id: "dc-1",
        requirement_ids: ["req-s", "req-e"],
        distinct_by: "card_name",
      },
    ]);
    expect(restored.hand_conditions[0]?.requirements.map((r) => r.id)).toEqual([
      "req-s",
      "req-e",
    ]);
  });

  it("repairs constraints when a referenced requirement is deleted", () => {
    const repaired = normalizeHandCondition({
      id: "best",
      name: "Best Hand",
      requirements: [
        {
          id: "req-s",
          kind: "group",
          group_id: "starters",
          op: "gte",
          count: 1,
        },
      ],
      excludes: [],
      distinct_constraints: [
        {
          id: "dc-1",
          requirement_ids: ["req-s", "req-e"],
          distinct_by: "card_name",
        },
      ],
    });
    expect(repaired.distinct_constraints).toEqual([]);
  });

  it("rejects constraints that reference non-presence requirements", () => {
    const parsed = parseHandCondition({
      id: "c",
      name: "C",
      requirements: [
        { id: "a", kind: "card", card_id: 1, op: "gte", count: 2 },
        { id: "b", kind: "card", card_id: 2, op: "gte", count: 1 },
      ],
      excludes: [],
      distinct_constraints: [
        {
          id: "dc",
          requirement_ids: ["a", "b"],
          distinct_by: "card_name",
        },
      ],
    });
    expect(parsed.distinct_constraints).toEqual([]);
  });
});

describe("distinct match probability", () => {
  it("excludes same-name doubles from distinct starter+extender probability", () => {
    // Tiny deck: 2 Medius + 1 Vidolium + 1 Ash. Opening hand size 2.
    // Compositions of size 2:
    //   Medius×2          weight C(2,2)*C(1,0)*C(1,0) = 1
    //   Medius+Vidolium   weight C(2,1)*C(1,1)*C(1,0) = 2
    //   Medius+Ash        weight C(2,1)*C(1,0)*C(1,1) = 2
    //   Vidolium+Ash      weight C(2,0)*C(1,1)*C(1,1) = 1
    // Total weight = 6
    // Raw requires (starter≥1 and extender≥1): all except impossible none —
    // every composition with Medius or Vidolium has both groups covered by
    // overlapping membership, so Medius×2, Medius+Vid, Medius+Ash, Vid+Ash
    // all pass raw predicates (weight 6).
    // Distinct-by-name: only Medius+Vidolium (weight 2) and... Vid+Ash fails
    // extender? Vid is extender; Ash is not. Vid+Ash: starter ok, extender ok
    // via Vid only — one name, FAIL. Medius+Ash: same. Medius×2: FAIL.
    // Only Medius+Vidolium PASS → P = 2/6 = 1/3.
    const deck = tinyDeck();
    const groups = groupsToMembership([
      { id: "starters", name: "S", card_ids: [medius, vidolium] },
      { id: "extenders", name: "E", card_ids: [medius, vidolium] },
    ]);
    const condition = normalizeHandCondition({
      id: "best",
      name: "Best",
      requirements: [
        {
          id: "req-s",
          kind: "group",
          group_id: "starters",
          op: "gte",
          count: 1,
        },
        {
          id: "req-e",
          kind: "group",
          group_id: "extenders",
          op: "gte",
          count: 1,
        },
      ],
      excludes: [],
      distinct_constraints: [
        {
          id: "dc",
          requirement_ids: ["req-s", "req-e"],
          distinct_by: "card_name",
        },
      ],
    });

    const withoutDistinct = {
      ...condition,
      distinct_constraints: [],
    };

    const handMediusPair = [2, 0, 0];
    const handMixed = [1, 1, 0];
    expect(handConditionHolds(handMediusPair, deck, withoutDistinct, groups)).toBe(
      true,
    );
    expect(handConditionHolds(handMediusPair, deck, condition, groups)).toBe(
      false,
    );
    expect(handConditionHolds(handMixed, deck, condition, groups)).toBe(true);

    const analysis = analyzeHandConditions(deck, 2, [condition], [], groups);
    expect(analysis.conditions[0]?.probability).toBeCloseTo(2 / 6, 10);

    const raw = analyzeHandConditions(deck, 2, [withoutDistinct], [], groups);
    expect(raw.conditions[0]?.probability).toBeCloseTo(1, 10);

    const failTrace = evaluateHandCondition(
      handMediusPair,
      deck,
      condition,
      groups,
    );
    expect(failTrace.passed).toBe(false);
    expect(failTrace.distinct_constraints[0]?.passed).toBe(false);

    const passTrace = evaluateHandCondition(handMixed, deck, condition, groups);
    expect(passTrace.passed).toBe(true);
    expect(passTrace.distinct_constraints[0]?.assignment).not.toBeNull();
  });
});
