import { describe, expect, it } from "vitest";
import { createDocument, type MappingDocument } from "./document";
import { atLeastOne, combine, DEFAULT_WEIGHTS, scorableGoals, scorecard } from "./scorecard";

const plain = { roles: [], opening_quality: { going_first: null, going_second: null } };
const interaction = { roles: ["interaction"], opening_quality: { going_first: null, going_second: null } };

/**
 * 8 cards, a five-card hand, so 56 possible hands.
 * Card 1 (x3) is the goal, card 2 (x3) is filler, card 3 (x2) is Interaction.
 * One handtrap stops card 1.
 */
function doc(options: { handtrap?: boolean; interactionRole?: boolean } = {}): MappingDocument {
  const { handtrap = true, interactionRole = true } = options;
  return {
    ...createDocument("t"),
    main: [
      { card_id: 1, quantity: 3, taxonomy: plain },
      { card_id: 2, quantity: 3, taxonomy: plain },
      { card_id: 3, quantity: 2, taxonomy: interactionRole ? interaction : plain },
    ],
    hand_conditions: [
      { id: "c", name: "needs 1", requirements: [{ kind: "card", card_id: 1, op: "gte", count: 1 }], excludes: [] },
    ],
    hand_condition_sets: [{ id: "g", name: "Goal", condition_ids: ["c"], aggregation: "any" }],
    handtraps: handtrap ? [{ id: "h", name: "Veiler", hits: [1] }] : [],
  } as unknown as MappingDocument;
}

function ok(result: ReturnType<typeof scorecard>) {
  if ("error" in result) throw new Error(result.error);
  return result;
}

describe("atLeastOne", () => {
  it("is the exact hypergeometric chance", () => {
    expect(atLeastOne(8, 2, 5)).toBeCloseTo(50 / 56, 12);
    expect(atLeastOne(40, 0, 5)).toBe(0);
    expect(atLeastOne(8, 4, 5)).toBe(1); // five cards cannot avoid four of eight
  });
});

describe("scorecard", () => {
  it("measures opens, resilient and interaction exactly", () => {
    const card = ok(scorecard(doc(), "g"));
    expect(card.sample).toBe(5);
    expect(card.opens).toBeCloseTo(55 / 56, 12); // only the hand with no copy of card 1 fails
    expect(card.resilient).toBeCloseTo(40 / 56, 12); // the handtrap breaks every hand with one copy
    expect(card.worstScenario).toBe("Veiler");
    expect(card.interaction).toBeCloseTo(50 / 56, 12);
    expect(card.combined).toBeCloseTo((55 + 40 + 50) / (3 * 56), 12);
  });

  it("combines by the weights, and a zero weight drops that number", () => {
    const card = ok(scorecard(doc(), "g", { opens: 2, resilient: 0, interaction: 1 }));
    expect(card.combined).toBeCloseTo((2 * (55 / 56) + 50 / 56) / 3, 12);
    expect(card.usedWeights).toEqual({ opens: 2, interaction: 1 });
  });

  it("leaves out what it cannot measure instead of counting it as zero", () => {
    const noTraps = ok(scorecard(doc({ handtrap: false }), "g"));
    expect(noTraps.resilient).toBeNull();
    expect(noTraps.notes.join(" ")).toMatch(/Handtraps tab/);
    expect(noTraps.combined).toBeCloseTo((55 / 56 + 50 / 56) / 2, 12);

    const noRole = ok(scorecard(doc({ interactionRole: false }), "g"));
    expect(noRole.interaction).toBeNull();
    expect(noRole.notes.join(" ")).toMatch(/Interaction role/);

    const neither = ok(scorecard(doc({ handtrap: false, interactionRole: false }), "g"));
    expect(neither.combined).toBeCloseTo(55 / 56, 12);
  });

  it("returns null when every weight is zero", () => {
    expect(ok(scorecard(doc(), "g", { opens: 0, resilient: 0, interaction: 0 })).combined).toBeNull();
  });

  it("falls back to the first scorable goal and explains an empty deck or goal", () => {
    expect(ok(scorecard(doc(), "missing")).goalId).toBe("g");
    expect(scorableGoals(doc())).toEqual([{ id: "g", name: "Goal" }]);
    expect(scorecard({ ...doc(), main: [] }, "g")).toEqual({ error: "This deck has no Main Deck cards." });
    expect(scorecard({ ...doc(), hand_condition_sets: [] }, null)).toEqual({
      error: "Define a Hand Goal with at least one Hand Condition first.",
    });
  });

  it("takes the worst of several handtraps", () => {
    const base = doc();
    const two = {
      ...base,
      handtraps: [...base.handtraps, { id: "h2", name: "Harmless", hits: [2] }],
    } as MappingDocument;
    const card = ok(scorecard(two, "g"));
    expect(card.scenarios.map((s) => s.label)).toEqual(["Veiler", "Harmless"]);
    expect(card.resilient).toBeCloseTo(40 / 56, 12);
    expect(card.worstScenario).toBe("Veiler");
  });
});

describe("combine", () => {
  it("is a weighted mean over the numbers that exist", () => {
    expect(combine({ opens: 0.5, resilient: null, interaction: 1 }, DEFAULT_WEIGHTS).combined).toBeCloseTo(0.75, 12);
  });
});
