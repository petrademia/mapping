import { describe, expect, it } from "vitest";
import {
  createDocument,
  parseMappingJson,
  removeHandConditionSet,
  serializeMapping,
  setLabelGoal,
  setLabelsByHand,
  type MappingDocument,
} from "./document";
import { deriveLabels, withDerivedLabels } from "./derivedLabels";
import { scorecard } from "./scorecard";

const none = { going_first: null, going_second: null } as const;
const tag = (roles: string[] = [], quality: { going_first: string | null; going_second: string | null } = none) => ({
  roles,
  opening_quality: quality,
});
const req = (card_id: number, count = 1, op = "gte") => ({ kind: "card", card_id, op, count });
const grp = (group_id: string, count = 1, op = "gte") => ({ kind: "group", group_id, op, count });

/**
 * 1 starter (x3), 2 starter (x1), 3 and 4 only in a two-card route, 5 in no route,
 * 6 a handtrap tagged Interaction that is in no route.
 */
function doc(extra: Partial<MappingDocument> = {}): MappingDocument {
  return {
    ...createDocument("t"),
    labels_by_hand: false,
    main: [
      { card_id: 1, quantity: 3, taxonomy: tag() },
      { card_id: 2, quantity: 1, taxonomy: tag() },
      { card_id: 3, quantity: 2, taxonomy: tag() },
      { card_id: 4, quantity: 2, taxonomy: tag() },
      { card_id: 5, quantity: 4, taxonomy: tag() },
      { card_id: 6, quantity: 2, taxonomy: tag(["interaction"]) },
    ],
    groups: [{ id: "partners", name: "Partners", card_ids: [4] }],
    hand_conditions: [
      { id: "c1", name: "one alone", requirements: [req(1)], excludes: [] },
      { id: "c2", name: "two alone", requirements: [req(2)], excludes: [] },
      { id: "c3", name: "pair", requirements: [req(3), grp("partners")], excludes: [] },
    ],
    hand_condition_sets: [{ id: "g", name: "Goal", condition_ids: ["c1", "c2", "c3"], aggregation: "any" }],
    ...extra,
  } as unknown as MappingDocument;
}

const label = (d: MappingDocument, id: number) => deriveLabels(d).get(id)!;

describe("deriveLabels", () => {
  it("calls a card on its own a starter, a card that needs a partner an extender, and a card in no route a brick", () => {
    const d = doc();
    expect(label(d, 1)).toEqual({ starter: true, extender: false, brick: false });
    expect(label(d, 2)).toEqual({ starter: true, extender: false, brick: false });
    expect(label(d, 3)).toEqual({ starter: false, extender: true, brick: false });
    expect(label(d, 4)).toEqual({ starter: false, extender: true, brick: false }); // through the Group
    expect(label(d, 5)).toEqual({ starter: false, extender: false, brick: true });
  });

  it("does not call an Interaction card a brick", () => {
    expect(label(doc(), 6)).toEqual({ starter: false, extender: false, brick: false });
  });

  it("lets a card be both a starter and an extender", () => {
    const d = doc({
      hand_conditions: [
        { id: "c1", name: "one alone", requirements: [req(1)], excludes: [] },
        { id: "c4", name: "one with three", requirements: [req(1), req(3)], excludes: [] },
      ],
      hand_condition_sets: [{ id: "g", name: "Goal", condition_ids: ["c1", "c4"], aggregation: "any" }],
    } as unknown as Partial<MappingDocument>);
    expect(label(d, 1)).toMatchObject({ starter: true, extender: true });
    expect(label(d, 3)).toMatchObject({ starter: false, extender: true });
  });

  it("counts every card of a Group that is enough alone as a starter", () => {
    const d = doc({
      groups: [{ id: "any", name: "Any", card_ids: [3, 4] }],
      hand_conditions: [{ id: "c1", name: "group alone", requirements: [grp("any")], excludes: [] }],
      hand_condition_sets: [{ id: "g", name: "Goal", condition_ids: ["c1"], aggregation: "any" }],
    } as unknown as Partial<MappingDocument>);
    expect(label(d, 3).starter).toBe(true);
    expect(label(d, 4).starter).toBe(true);
    expect(label(d, 1).brick).toBe(true);
  });

  it("needs a partner when a condition wants two copies of a card", () => {
    const d = doc({
      hand_conditions: [{ id: "c1", name: "two copies", requirements: [req(1, 2)], excludes: [] }],
      hand_condition_sets: [{ id: "g", name: "Goal", condition_ids: ["c1"], aggregation: "any" }],
    } as unknown as Partial<MappingDocument>);
    expect(label(d, 1)).toMatchObject({ starter: false, extender: true });
  });

  it("ignores requirements that only ask for fewer, exclusions and role requirements", () => {
    const d = doc({
      hand_conditions: [
        {
          id: "c1",
          name: "mixed",
          requirements: [req(1), req(5, 0, "lte"), { kind: "role", role: "interaction", op: "gte", count: 1 }],
          excludes: [req(3)],
        },
      ],
      hand_condition_sets: [{ id: "g", name: "Goal", condition_ids: ["c1"], aggregation: "any" }],
    } as unknown as Partial<MappingDocument>);
    expect(label(d, 1)).toMatchObject({ starter: true, extender: false }); // card 1 alone
    expect(label(d, 5)).toMatchObject({ starter: false, extender: false, brick: true });
    expect(label(d, 3)).toMatchObject({ starter: false, extender: false, brick: true });
  });

  it("ignores conditions that are in no Hand Goal, and derives nothing without a goal", () => {
    const d = doc({ hand_condition_sets: [{ id: "g", name: "Goal", condition_ids: ["c1"], aggregation: "any" }] } as unknown as Partial<MappingDocument>);
    expect(label(d, 2)).toMatchObject({ starter: false, brick: true }); // its condition is not in the goal
    const empty = doc({ hand_condition_sets: [] });
    expect(deriveLabels(empty).size).toBe(0);
    expect(withDerivedLabels(empty)).toBe(empty); // nothing to derive from: the file's own tags apply
  });
});

describe("withDerivedLabels", () => {
  it("replaces saved starter and extender tags, keeps Interaction, and fills bricks without touching what you set", () => {
    const base = doc();
    const d = {
      ...base,
      main: base.main.map((card) =>
        card.card_id === 5
          ? { ...card, taxonomy: tag(["starter"], { going_first: "desirable", going_second: null }) }
          : card,
      ),
    } as unknown as MappingDocument;
    const view = withDerivedLabels(d);
    const byId = new Map(view.main.map((card) => [card.card_id, card.taxonomy]));
    expect(byId.get(1)!.roles).toEqual(["starter"]);
    expect(byId.get(3)!.roles).toEqual(["extender"]);
    expect(byId.get(6)!.roles).toEqual(["interaction"]);
    // Card 5: the saved Starter tag is not used, it is a brick, and the Opening Quality you set wins.
    expect(byId.get(5)!.roles).toEqual([]);
    expect(byId.get(5)!.opening_quality).toEqual({ going_first: "desirable", going_second: "undesirable" });
    // The saved document is not changed.
    const saved = d.main.find((card) => card.card_id === 5)!;
    expect(saved.taxonomy.roles).toEqual(["starter"]);
    expect(saved.taxonomy.opening_quality.going_second).toBeNull();
  });

  it("gives the Scorecard its bricks without any tagging", () => {
    const d = doc();
    const before = scorecard(d, "g");
    const after = scorecard(withDerivedLabels(d), "g");
    if ("error" in before || "error" in after) throw new Error("no scorecard");
    expect(before.first.clean).toBeNull();
    expect(after.first.clean).not.toBeNull();
    // Card 5 (x4 of 14 cards) is the only brick going first.
    expect(after.first.slots.undesirable).toBe(4);
  });
});

describe("reading the labels from one Hand Goal", () => {
  // Two goals: "alone" holds the two starters, "pair" holds the two-card route.
  const two = (label_goal_id?: string | null) =>
    doc({
      hand_condition_sets: [
        { id: "alone", name: "Alone", condition_ids: ["c1", "c2"], aggregation: "any" },
        { id: "pair", name: "Pair", condition_ids: ["c3"], aggregation: "any" },
      ],
      ...(label_goal_id === undefined ? {} : { label_goal_id }),
    });

  it("reads every Hand Goal when none is chosen, as before", () => {
    for (const d of [two(), two(null), two("not-a-goal")]) {
      expect(label(d, 1)).toMatchObject({ starter: true, brick: false });
      expect(label(d, 3)).toMatchObject({ extender: true, brick: false });
      expect(label(d, 4)).toMatchObject({ extender: true, brick: false });
    }
  });

  it("counts only the chosen goal's routes", () => {
    const alone = two("alone");
    expect(label(alone, 1)).toMatchObject({ starter: true });
    expect(label(alone, 2)).toMatchObject({ starter: true });
    // The pair route is in another goal now, so its cards are in no route here.
    expect(label(alone, 3)).toMatchObject({ extender: false, brick: true });
    expect(label(alone, 4)).toMatchObject({ extender: false, brick: true });

    const pair = two("pair");
    expect(label(pair, 3)).toMatchObject({ extender: true, brick: false });
    expect(label(pair, 4)).toMatchObject({ extender: true, brick: false });
    // And now the starters of the other goal are in no route.
    expect(label(pair, 1)).toMatchObject({ starter: false, brick: true });
    expect(label(pair, 2)).toMatchObject({ starter: false, brick: true });
  });

  it("makes a card an Extender only when the chosen goal needs it with another card", () => {
    // Everything is an Extender through the broad Group in the other goal, until the goal is chosen.
    const broad = doc({
      groups: [{ id: "all", name: "All", card_ids: [1, 2, 3, 4, 5] }],
      hand_conditions: [
        { id: "c1", name: "one alone", requirements: [req(1)], excludes: [] },
        { id: "wide", name: "any two", requirements: [grp("all", 2)], excludes: [] },
      ],
      hand_condition_sets: [
        { id: "starts", name: "Starts", condition_ids: ["c1"], aggregation: "any" },
        { id: "wideGoal", name: "Wide", condition_ids: ["wide"], aggregation: "any" },
      ],
    } as unknown as Partial<MappingDocument>);
    expect(label(broad, 5)).toMatchObject({ extender: true, brick: false });
    const chosen = { ...broad, label_goal_id: "starts" } as MappingDocument;
    expect(label(chosen, 5)).toMatchObject({ extender: false, brick: true });
  });

  it("is chosen with setLabelGoal, saved and read back, and cleared when the goal is removed", () => {
    const chosen = setLabelGoal(two(), "pair");
    expect(chosen.label_goal_id).toBe("pair");
    expect(setLabelGoal(chosen, "nope").label_goal_id).toBeNull();
    expect(setLabelGoal(chosen, null).label_goal_id).toBeNull();

    const back = parseMappingJson(serializeMapping(chosen));
    expect(back.label_goal_id).toBe("pair");
    expect(serializeMapping(two())).not.toContain("label_goal_id");
    // A file naming a goal that does not exist reads as every goal.
    const text = serializeMapping(chosen).replace('"label_goal_id": "pair"', '"label_goal_id": "gone"');
    expect(parseMappingJson(text).label_goal_id).toBeUndefined();

    expect(removeHandConditionSet(chosen, "pair").label_goal_id).toBeNull();
    expect(removeHandConditionSet(chosen, "alone").label_goal_id).toBe("pair");
  });
});

describe("labels set by hand", () => {
  const tagged = (): MappingDocument => ({
    ...doc(),
    main: [
      { card_id: 1, quantity: 3, taxonomy: tag(["starter"]) },
      { card_id: 2, quantity: 1, taxonomy: tag(["extender"]) },
      { card_id: 5, quantity: 2, taxonomy: tag(["brick"]) },
      { card_id: 6, quantity: 1, taxonomy: tag() },
    ] as MappingDocument["main"],
  });

  it("reads Starter, Extender and Brick from the tags and not from the Hand Conditions", () => {
    const labels = deriveLabels(setLabelsByHand(tagged(), true));
    expect(labels.get(1)).toEqual({ starter: true, extender: false, brick: false });
    expect(labels.get(2)).toEqual({ starter: false, extender: true, brick: false });
    expect(labels.get(5)).toEqual({ starter: false, extender: false, brick: true });
    // An untagged card has no label: it is never a Brick by default.
    expect(labels.get(6)).toEqual({ starter: false, extender: false, brick: false });
  });

  it("has labels even with no Hand Goal, since the tags are the source", () => {
    const empty = { ...setLabelsByHand(tagged(), true), hand_condition_sets: [], hand_conditions: [] };
    expect(deriveLabels(empty).size).toBe(4);
  });

  it("counts a Brick tag as Undesirable where Opening Quality is not set, and yields to a set one", () => {
    const base = setLabelsByHand(tagged(), true);
    const view = withDerivedLabels({
      ...base,
      main: base.main.map((card) =>
        card.card_id === 5
          ? { ...card, taxonomy: { ...card.taxonomy, opening_quality: { going_first: "desirable", going_second: null } } }
          : card,
      ) as MappingDocument["main"],
    });
    const five = view.main.find((card) => card.card_id === 5)!;
    expect(five.taxonomy.opening_quality.going_first).toBe("desirable");
    expect(five.taxonomy.opening_quality.going_second).toBe("undesirable");
  });

  it("is remembered in the file, left out when off, and ended by choosing a Hand Goal", () => {
    const on = setLabelsByHand(tagged(), true);
    const back = parseMappingJson(serializeMapping(on));
    expect(back.labels_by_hand).toBe(true);
    expect(serializeMapping(tagged())).not.toContain("labels_by_hand");
    expect(setLabelGoal(on, null).labels_by_hand).toBe(false);
  });
  it("starts a new deck on My tags, and leaves a saved mapping without the field on Hand Conditions", () => {
    expect(createDocument("new").labels_by_hand).toBe(true);
    const saved = serializeMapping({ ...createDocument("old"), labels_by_hand: false });
    expect(parseMappingJson(saved).labels_by_hand).toBeUndefined();
    expect(parseMappingJson(serializeMapping(createDocument("new"))).labels_by_hand).toBe(true);
  });
});
