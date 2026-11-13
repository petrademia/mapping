import { describe, expect, it } from "vitest";
import { createDocument, parseMappingJson, serializeMapping, type MappingDocument } from "./document";
import { analyzeVersus, handVersus } from "./handtrapVersus";

const taxonomy = { roles: [], opening_quality: { going_first: null, going_second: null } };
const req = (card_id: number) => ({ kind: "card", card_id, op: "gte", count: 1 });

/**
 * 10 cards, a five-card hand (252 hands): two of card 1, two of card 3, six of card 2 (never a route).
 * The goal is card 1 or card 3. One handtrap that can stop any card.
 */
function build(flagCard3: boolean): MappingDocument {
  return {
    ...createDocument("t"),
    main: [
      { card_id: 1, quantity: 2, taxonomy },
      { card_id: 2, quantity: 6, taxonomy },
      { card_id: 3, quantity: 2, taxonomy },
    ],
    hand_conditions: [
      { id: "c1", name: "c1", requirements: [req(1)], excludes: [] },
      {
        id: "c3",
        name: "c3",
        requirements: [req(3)],
        excludes: [],
        ...(flagCard3 ? { survives_one_interruption: true } : {}),
      },
    ],
    hand_condition_sets: [{ id: "g", name: "Goal", condition_ids: ["c1", "c3"], aggregation: "any" }],
    handtraps: [{ id: "h", name: "Ash", hits: [1, 2, 3] }],
  } as unknown as MappingDocument;
}

const SCENARIOS = [
  { id: "one", label: "one", handtrapIds: ["h"] },
  { id: "two", label: "two", handtrapIds: ["h", "h"] },
];

function counts(doc: MappingDocument): { base: number; one: number; two: number } {
  const out = analyzeVersus(doc, SCENARIOS);
  if ("error" in out) throw new Error(out.error);
  const at = (probability: number) => Math.round(probability * 252);
  return {
    base: at(out.baseline[0]!.probability),
    one: at(out.scenarios[0]!.goals[0]!.probability),
    two: at(out.scenarios[1]!.goals[0]!.probability),
  };
}

describe("a line that still works after one interruption", () => {
  it("is worked out card by card when nothing is marked", () => {
    // 246 hands hold a route card. After one stop two route cards are needed (186),
    // after two stops three (66).
    expect(counts(build(false))).toEqual({ base: 246, one: 186, two: 66 });
  });

  it("survives a single stop whichever card is hit, and only a single stop", () => {
    // Hands with a card 3 (196) survive one stop; the rest need both card 1 (20): 216.
    // Two stops are unchanged: the mark does not count against two.
    expect(counts(build(true))).toEqual({ base: 246, one: 216, two: 66 });
  });

  it("applies to one hand tested against the handtraps", () => {
    const doc = build(true);
    const hand = { 3: 1, 2: 4 };
    expect(handVersus(doc, hand, ["h"])[0]).toMatchObject({ holds: true, survives: true });
    expect(handVersus(doc, hand, ["h", "h"])[0]).toMatchObject({ holds: true, survives: false });
    expect(handVersus(build(false), hand, ["h"])[0]).toMatchObject({ holds: true, survives: false });
  });

  it("is saved and read back, and left out of the file when off", () => {
    const text = serializeMapping(build(true));
    expect(parseMappingJson(text).hand_conditions.find((c) => c.id === "c3")?.survives_one_interruption).toBe(true);
    expect(parseMappingJson(text).hand_conditions.find((c) => c.id === "c1")?.survives_one_interruption).toBeUndefined();
    expect(serializeMapping(build(false))).not.toContain("survives_one_interruption");
  });
});
