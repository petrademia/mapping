import { describe, expect, it } from "vitest";
import { inheritModels, mainDifferences, scoreDeck } from "./compareDecks";
import {
  addCard,
  createDocument,
  upsertHandCondition,
  upsertHandConditionSet,
  type MappingCard,
  type MappingDocument,
} from "./document";

const card = (
  card_id: number,
  quantity: number,
  roles: MappingCard["taxonomy"]["roles"] = [],
  going_first: "desirable" | "neutral" | "undesirable" | null = null,
): MappingCard => ({
  card_id,
  quantity,
  taxonomy: { roles, opening_quality: { going_first, going_second: null } },
});

function deckWith(main: MappingCard[]): MappingDocument {
  let doc = createDocument("a");
  for (const entry of main) doc = addCard(doc, "main", entry);
  doc = upsertHandCondition(doc, {
    id: "c1",
    name: "has one",
    requirements: [{ kind: "card", card_id: 1, op: "gte", count: 1 }],
    excludes: [],
    distinct_constraints: [],
  });
  doc = upsertHandConditionSet(doc, { id: "s1", name: "Goal", condition_ids: ["c1"], aggregation: "any" });
  return doc;
}

function filler(count: number, startId = 100): MappingCard[] {
  return Array.from({ length: count }, (_, i) => card(startId + i, 1));
}

describe("scoreDeck", () => {
  it("is exact: P(at least one of 3 copies in a 40 card deck, 5 drawn)", () => {
    const doc = deckWith([card(1, 3), ...filler(37)]);
    const score = scoreDeck(doc);
    if ("error" in score) throw new Error(score.error);
    // 1 - C(37,5)/C(40,5)
    const expected = 1 - (37 * 36 * 35 * 34 * 33) / (40 * 39 * 38 * 37 * 36);
    expect(score.goals[0]!.probability).toBeCloseTo(expected, 6);
    expect(score.brick).toBeCloseTo(1 - expected, 5);
    expect(score.anyMatch).toBeCloseTo(expected, 5);
    expect(score.overlap).toBe(0);
  });

  it("more copies means better odds and a lower brick chance", () => {
    const thin = scoreDeck(deckWith([card(1, 1), ...filler(39)]));
    const thick = scoreDeck(deckWith([card(1, 3), ...filler(37)]));
    if ("error" in thin || "error" in thick) throw new Error("score failed");
    expect(thick.goals[0]!.probability).toBeGreaterThan(thin.goals[0]!.probability);
    expect(thick.brick).toBeLessThan(thin.brick);
  });

  it("counts roles and opening quality in copies", () => {
    const doc = deckWith([
      card(1, 3, ["starter"], "desirable"),
      card(2, 2, ["starter", "extender"], "undesirable"),
      ...filler(35),
    ]);
    const score = scoreDeck(doc);
    if ("error" in score) throw new Error(score.error);
    expect(score.roles.starter).toBe(5);
    expect(score.roles.extender).toBe(2);
    expect(score.quality).toEqual({ desirable: 3, neutral: 0, undesirable: 2, unset: 35 });
  });

  it("reports a deck too small for the hand instead of throwing", () => {
    const score = scoreDeck(deckWith([card(1, 3)]));
    expect("error" in score).toBe(true);
  });
});

describe("inheritModels", () => {
  it("applies this deck's goals and roles to the other deck's cards", () => {
    const base = deckWith([card(1, 3, ["starter"]), ...filler(37)]);
    const other = createDocument("b");
    const bare = addCard(addCard(other, "main", card(1, 2)), "main", card(500, 38));
    const merged = inheritModels(base, bare);
    expect(merged.name).toBe("b");
    expect(merged.hand_condition_sets.map((set) => set.id)).toContain("s1");
    expect(merged.main.find((c) => c.card_id === 1)?.taxonomy.roles).toEqual(["starter"]);
    expect(merged.main.find((c) => c.card_id === 500)?.taxonomy.roles).toEqual([]);
  });

  it("keeps the other deck's own annotations", () => {
    const base = deckWith([card(1, 3, ["starter"]), ...filler(37)]);
    const own = addCard(createDocument("b"), "main", card(1, 3, ["extender"]));
    expect(inheritModels(base, own).main[0]!.taxonomy.roles).toEqual(["extender"]);
  });
});

describe("mainDifferences", () => {
  it("lists added and dropped copies", () => {
    const a = deckWith([card(1, 3), card(2, 2)]);
    const b = deckWith([card(1, 1), card(3, 2)]);
    expect(mainDifferences(a, b)).toEqual([
      { card_id: 3, delta: 2 },
      { card_id: 1, delta: -2 },
      { card_id: 2, delta: -2 },
    ]);
  });
});
