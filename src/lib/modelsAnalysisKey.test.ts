import { describe, expect, it } from "vitest";
import type { Group, HandCondition, HandConditionSet } from "./handCondition";
import { modelsAnalysisKey } from "./modelsAnalysisKey";

describe("modelsAnalysisKey", () => {
  const groups: Group[] = [
    { id: "g1", name: "Valid S/T", notes: "intent", card_ids: [2, 1] },
  ];
  const conditions: HandCondition[] = [
    {
      id: "c1",
      name: "Access",
      notes: "why",
      requirements: [{ kind: "card", card_id: 1, op: "gte", count: 1 }],
      excludes: [],
    },
  ];
  const sets: HandConditionSet[] = [
    {
      id: "s1",
      name: "Engine",
      notes: "union",
      condition_ids: ["c1"],
      aggregation: "any",
    },
  ];
  const main = [
    {
      card_id: 1,
      quantity: 3,
      taxonomy: {
        roles: ["starter" as const],
        opening_quality: { going_first: null, going_second: null },
      },
    },
  ];

  it("ignores name and notes churn on groups, conditions, and sets", () => {
    const a = modelsAnalysisKey({
      main,
      groups,
      hand_conditions: conditions,
      hand_condition_sets: sets,
      sample: 5,
      turn_order: "going_first",
    });
    const b = modelsAnalysisKey({
      main,
      groups: [{ ...groups[0]!, name: "Renamed", notes: "other" }],
      hand_conditions: [{ ...conditions[0]!, name: "Renamed", notes: "other" }],
      hand_condition_sets: [
        { ...sets[0]!, name: "Renamed", notes: "other" },
      ],
      sample: 5,
      turn_order: "going_first",
    });
    expect(a).toBe(b);
  });

  it("changes when group membership or requirements change", () => {
    const base = modelsAnalysisKey({
      main,
      groups,
      hand_conditions: conditions,
      hand_condition_sets: sets,
      sample: 5,
      turn_order: "going_first",
    });
    const membership = modelsAnalysisKey({
      main,
      groups: [{ ...groups[0]!, card_ids: [1, 2, 3] }],
      hand_conditions: conditions,
      hand_condition_sets: sets,
      sample: 5,
      turn_order: "going_first",
    });
    const requirement = modelsAnalysisKey({
      main,
      groups,
      hand_conditions: [
        {
          ...conditions[0]!,
          requirements: [{ kind: "card", card_id: 2, op: "gte", count: 1 }],
        },
      ],
      hand_condition_sets: sets,
      sample: 5,
      turn_order: "going_first",
    });
    expect(membership).not.toBe(base);
    expect(requirement).not.toBe(base);
  });

  it("changes when distinct constraints change", () => {
    const base = modelsAnalysisKey({
      main,
      groups,
      hand_conditions: conditions,
      hand_condition_sets: sets,
      sample: 5,
      turn_order: "going_first",
    });
    const withDistinct = modelsAnalysisKey({
      main,
      groups,
      hand_conditions: [
        {
          ...conditions[0]!,
          requirements: [
            { id: "r1", kind: "card", card_id: 1, op: "gte", count: 1 },
            { id: "r2", kind: "card", card_id: 2, op: "gte", count: 1 },
          ],
          distinct_constraints: [
            {
              id: "dc1",
              requirement_ids: ["r1", "r2"],
              distinct_by: "card_name",
            },
          ],
        },
      ],
      hand_condition_sets: sets,
      sample: 5,
      turn_order: "going_first",
    });
    expect(withDistinct).not.toBe(base);
  });
});
