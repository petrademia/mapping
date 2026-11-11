import { describe, expect, it } from "vitest";
import { addConfiguration, setConfigurationMainQuantity } from "./configuration";
import {
  addCard,
  clearConfigurations,
  clearGroups,
  clearHandConditions,
  clearModeledOutcomes,
  clearSection,
  clearTags,
  createDocument,
  ENGINE_ACCESS_SET_ID,
  setCardContextualOpeningQuality,
  setCardRoles,
  setConditionSetMember,
  upsertGroup,
  upsertHandCondition,
  upsertHandConditionSet,
  type MappingDocument,
} from "./document";
import { EMPTY_TAXONOMY } from "./taxonomy";

function populated(): MappingDocument {
  let doc = createDocument("d");
  const add = (section: "main" | "extra" | "side", id: number, quantity: number) => {
    doc = addCard(doc, section, { card_id: id, quantity, taxonomy: { ...EMPTY_TAXONOMY } });
  };
  add("main", 1, 3);
  add("main", 2, 2);
  add("extra", 10, 1);
  add("side", 20, 2);
  doc = setCardRoles(doc, "main", 1, ["starter"]);
  doc = setCardContextualOpeningQuality(doc, "main", 1, "going_first", "desirable");
  doc = upsertGroup(doc, { id: "g1", name: "G1", card_ids: [1, 2] });
  doc = upsertHandCondition(doc, {
    id: "c1",
    name: "C1",
    requirements: [
      { id: "r1", kind: "card", card_id: 1, op: "gte", count: 1 },
      { id: "r2", kind: "group", group_id: "g1", op: "gte", count: 1 },
    ],
    excludes: [],
    distinct_constraints: [],
  });
  doc = setConditionSetMember(doc, ENGINE_ACCESS_SET_ID, "c1", true);
  doc = upsertHandConditionSet(doc, {
    id: "o2",
    name: "Second outcome",
    condition_ids: ["c1"],
    aggregation: "any",
  });
  doc = addConfiguration(doc);
  doc = setConfigurationMainQuantity(doc, doc.active_configuration_id!, 1, 1);
  return doc;
}

describe("clear actions", () => {
  it("clearSection empties only that section", () => {
    const doc = populated();
    expect(clearSection(doc, "main").main).toEqual([]);
    expect(clearSection(doc, "main").extra).toEqual(doc.extra);
    expect(clearSection(doc, "extra").extra).toEqual([]);
    expect(clearSection(doc, "extra").main).toEqual(doc.main);
    expect(clearSection(doc, "side").side).toEqual([]);
    expect(clearSection(doc, "side").groups).toEqual(doc.groups);
  });

  it("clearTags resets roles and quality but keeps cards and quantities", () => {
    const next = clearTags(populated());
    expect(next.main.map((c) => [c.card_id, c.quantity])).toEqual([[1, 3], [2, 2]]);
    expect(next.main[0]!.taxonomy.roles).toEqual([]);
    expect(next.main[0]!.taxonomy.opening_quality).toEqual({
      going_first: null,
      going_second: null,
    });
    expect(next.extra).toHaveLength(1);
  });

  it("clearGroups removes groups and the group lines inside conditions", () => {
    const next = clearGroups(populated());
    expect(next.groups).toEqual([]);
    expect(next.hand_conditions[0]!.requirements.map((r) => r.id)).toEqual(["r1"]);
  });

  it("clearHandConditions removes conditions and their outcome membership", () => {
    const next = clearHandConditions(populated());
    expect(next.hand_conditions).toEqual([]);
    for (const set of next.hand_condition_sets) expect(set.condition_ids).toEqual([]);
    expect(next.groups).toHaveLength(1);
  });

  it("clearModeledOutcomes keeps only an empty Engine Access outcome", () => {
    const next = clearModeledOutcomes(populated());
    expect(next.hand_condition_sets).toHaveLength(1);
    expect(next.hand_condition_sets[0]).toMatchObject({
      id: ENGINE_ACCESS_SET_ID,
      condition_ids: [],
    });
    expect(next.engine_access_set_id).toBe(ENGINE_ACCESS_SET_ID);
    expect(next.hand_conditions).toHaveLength(1);
  });

  it("clearConfigurations removes post-side lists and returns to Pre-Side", () => {
    const next = clearConfigurations(populated());
    expect(next.configurations).toEqual([]);
    expect(next.active_configuration_id).toBeNull();
    expect(next.main).toHaveLength(2);
  });

  it("is idempotent on an empty document", () => {
    const empty = createDocument("e");
    expect(clearGroups(clearHandConditions(clearTags(empty)))).toEqual(empty);
  });
});
