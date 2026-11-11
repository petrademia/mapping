import { describe, expect, it } from "vitest";
import { createDocument, type MappingDocument } from "./document";
import { parseSettings } from "./scorecardWeights";
import {
  atLeastOne,
  rangeMean,
  combine,
  DEFAULT_SETTINGS,
  DEFAULT_WEIGHTS,
  scorableGoals,
  scorecard,
  unmeasured,
  weakest,
  type Scorecard,
} from "./scorecard";

const none = { going_first: null, going_second: null } as const;
const plain = { roles: [], opening_quality: none };
const interaction = { roles: ["interaction"], opening_quality: none };
const brick = { roles: [], opening_quality: { going_first: "undesirable", going_second: "undesirable" } };

/**
 * 8 cards. Going first measures a five-card hand (56 hands), going second a
 * six-card hand (28 hands).
 * Card 1 (x3) is the goal, card 2 (x3) is a brick, card 3 (x2) is Interaction.
 * One handtrap stops card 1.
 */
function doc(options: { handtrap?: boolean; interactionRole?: boolean; bricks?: boolean } = {}): MappingDocument {
  const { handtrap = true, interactionRole = true, bricks = true } = options;
  return {
    ...createDocument("t"),
    main: [
      { card_id: 1, quantity: 3, taxonomy: plain },
      { card_id: 2, quantity: 3, taxonomy: bricks ? brick : plain },
      { card_id: 3, quantity: 2, taxonomy: interactionRole ? interaction : plain },
    ],
    hand_conditions: [
      { id: "c", name: "needs 1", requirements: [{ kind: "card", card_id: 1, op: "gte", count: 1 }], excludes: [] },
    ],
    hand_condition_sets: [{ id: "g", name: "Goal", condition_ids: ["c"], aggregation: "any" }],
    handtraps: handtrap ? [{ id: "h", name: "Veiler", hits: [1] }] : [],
  } as unknown as MappingDocument;
}

function ok(result: ReturnType<typeof scorecard>): Scorecard {
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
  it("measures going first on a five-card hand and going second on six, exactly", () => {
    const card = ok(scorecard(doc(), "g"));
    expect(card.first.sample).toBe(5);
    expect(card.second.sample).toBe(6);

    expect(card.first.opens).toBeCloseTo(55 / 56, 12); // only the hand with no copy of card 1 fails
    expect(card.first.resilient).toBeCloseTo(40 / 56, 12); // the handtrap breaks every one-copy hand
    expect(card.first.interaction).toBeCloseTo(50 / 56, 12);

    expect(card.second.opens).toBe(1); // six cards must include card 1
    expect(card.second.resilient).toBeCloseTo(25 / 28, 12);
    expect(card.second.interaction).toBeCloseTo(27 / 28, 12);
    expect(card.first.worstScenario).toBe("Veiler");
  });

  it("measures how many bricks a hand may hold and still meet the goal", () => {
    const card = ok(scorecard(doc(), "g"));
    // Going first: no brick 1 hand, up to one 16, up to two 46, up to three 55 of 56.
    expect(card.first.brickCurve.map((p) => Math.round(p * 56))).toEqual([1, 16, 46, 55]);
    // Going second: six cards cannot avoid every brick (only five other cards).
    expect(card.second.brickCurve.map((p) => Math.round(p * 28))).toEqual([0, 3, 18, 28]);
    // The default tolerance is one brick.
    expect(card.first.clean).toBeCloseTo(16 / 56, 12);
    expect(card.second.clean).toBeCloseTo(3 / 28, 12);
    // Raising the tolerance can only help.
    const loose = ok(scorecard(doc(), "g", { ...DEFAULT_SETTINGS, brickTolerance: 3 }));
    expect(loose.first.clean).toBeCloseTo(55 / 56, 12);
    expect(loose.first.clean!).toBeGreaterThan(card.first.clean!);
  });

  it("counts the slots by Opening Quality for each turn order", () => {
    const slots = ok(scorecard(doc(), "g")).first.slots;
    expect(slots).toEqual({ desirable: 0, neutral: 0, undesirable: 3, unset: 5 });
  });

  it("combines by the weights, and a zero weight drops that number", () => {
    const card = ok(scorecard(doc(), "g"));
    const first = (55 / 56 + 16 / 56 + 40 / 56 + 50 / 56) / 4;
    expect(card.first.combined).toBeCloseTo(first, 12);
    const second = (1 + 3 / 28 + 25 / 28 + 27 / 28) / 4;
    expect(card.second.combined).toBeCloseTo(second, 12);
    expect(card.overall).toBeCloseTo((first + second) / 2, 12);

    const onlyFirst = ok(scorecard(doc(), "g", { ...DEFAULT_SETTINGS, second: 0, clean: 0, resilient: 0, interaction: 0 }));
    expect(onlyFirst.overall).toBeCloseTo(55 / 56, 12);
  });

  it("leaves out what it cannot measure instead of counting it as zero", () => {
    const noTraps = ok(scorecard(doc({ handtrap: false }), "g"));
    expect(noTraps.first.resilient).toBeNull();
    expect(noTraps.first.notes.join(" ")).toMatch(/Handtraps tab/);

    const noRole = ok(scorecard(doc({ interactionRole: false }), "g"));
    expect(noRole.first.interaction).toBeNull();
    expect(noRole.first.notes.join(" ")).toMatch(/Interaction role/);

    const noBricks = ok(scorecard(doc({ bricks: false }), "g"));
    expect(noBricks.first.clean).toBeNull();
    expect(noBricks.first.brickCurve).toEqual([]);
    expect(noBricks.first.notes.join(" ")).toMatch(/Undesirable/);

    const nothing = ok(scorecard(doc({ handtrap: false, interactionRole: false, bricks: false }), "g"));
    expect(nothing.first.combined).toBeCloseTo(55 / 56, 12);
  });

  it("returns null when every weight is zero", () => {
    const zero = { opens: 0, clean: 0, resilient: 0, interaction: 0, first: 1, second: 1, brickTolerance: 1 };
    const card = ok(scorecard(doc(), "g", zero));
    expect(card.first.combined).toBeNull();
    expect(card.overall).toBeNull();
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
    expect(card.first.scenarios.map((s) => s.label)).toEqual(["Veiler", "Harmless"]);
    expect(card.first.resilient).toBeCloseTo(40 / 56, 12);
  });
});

describe("the interruption curve", () => {
  const sevenths = (curve: number[], of: number) => curve.map((p) => Math.round(p * of));

  it("a single one-card route ends the turn on the first interruption unless a spare copy backs it", () => {
    const card = ok(scorecard(doc(), "g"));
    // Going first (56 hands): the goal needs card 1; surviving k interruptions needs k+1 copies of it.
    expect(sevenths(card.first.interruptions, 56)).toEqual([55, 40, 10, 0]);
    // Going second (28 hands).
    expect(sevenths(card.second.interruptions, 28)).toEqual([28, 25, 10, 0]);
    // Index 0 is Opens.
    expect(card.first.interruptions[0]).toBeCloseTo(card.first.opens, 12);
    // Hands that meet the goal but end on one interruption: 55 - 40 of 56.
    expect(Math.round((card.first.interruptions[0]! - card.first.interruptions[1]!) * 56)).toBe(15);
  });

  it("two independent one-card routes take one interruption but not two", () => {
    const two = {
      ...doc(),
      hand_conditions: [
        { id: "c", name: "card 1 alone", requirements: [{ kind: "card", card_id: 1, op: "gte", count: 1 }], excludes: [] },
        { id: "c3", name: "card 3 alone", requirements: [{ kind: "card", card_id: 3, op: "gte", count: 1 }], excludes: [] },
      ],
      hand_condition_sets: [{ id: "g", name: "Goal", condition_ids: ["c", "c3"], aggregation: "any" }],
    } as unknown as MappingDocument;
    const card = ok(scorecard(two, "g"));
    // Five route cards and three blanks: a five-card hand always holds two or more route cards.
    expect(sevenths(card.first.interruptions, 56)).toEqual([56, 56, 46, 16]);
    expect(sevenths(card.second.interruptions, 28)).toEqual([28, 28, 28, 18]);
  });

  it("shows the curve for an opponent who goes for your list, next to the worst case", () => {
    expect(ok(scorecard(doc(), "g")).first.interruptionsPriority).toEqual([]); // no list, nothing to show
    // Card 3 is bait: listed before the real target, card 1.
    const listed = {
      ...doc(),
      hit_priority: [{ kind: "card", card_id: 3 }, { kind: "card", card_id: 1 }],
    } as unknown as MappingDocument;
    const card = ok(scorecard(listed, "g"));
    // Going first: any hand holding card 3 spends the handtrap on it, so 55 of 56 survive one (40 in the worst case).
    expect(sevenths(card.first.interruptionsPriority, 56).slice(0, 2)).toEqual([55, 55]);
    expect(sevenths(card.first.interruptions, 56).slice(0, 2)).toEqual([55, 40]);
    // Going second: every six-card hand survives one (25 of 28 in the worst case).
    expect(sevenths(card.second.interruptionsPriority, 28).slice(0, 2)).toEqual([28, 28]);
    expect(card.first.interruptionsPriority.length).toBe(card.first.interruptions.length);
    // Resilient (against your own handtrap, which stops card 1 only) is also shown for that opponent.
    expect(card.first.resilientPriority).not.toBeNull();
    // It never changes the combined number, which stays the worst case.
    expect(card.first.combined).toBeCloseTo(ok(scorecard(doc(), "g")).first.combined!, 12);
  });

  it("averages the curve over the handtraps you expect the opponent to hold", () => {
    const curve = ok(scorecard(doc(), "g")).first.interruptions; // 55, 40, 10, 0 of 56
    expect(rangeMean(curve, 1, 2)).toBeCloseTo((40 + 10) / 2 / 56, 12);
    expect(rangeMean(curve, 1, 3)).toBeCloseTo((40 + 10 + 0) / 3 / 56, 12);
    expect(rangeMean(curve, 1, 1)).toBeCloseTo(40 / 56, 12);
    expect(rangeMean(curve, 1, 4)).toBeNull(); // the curve stops at three
    expect(rangeMean(curve, 2, 1)).toBeNull();
    expect(rangeMean([], 1, 2)).toBeNull();
  });

  it("needs no handtrap to be defined", () => {
    const card = ok(scorecard(doc({ handtrap: false }), "g"));
    expect(card.first.resilient).toBeNull();
    expect(sevenths(card.first.interruptions, 56)).toEqual([55, 40, 10, 0]);
  });
});

describe("the summary helpers", () => {
  it("name the lowest measured number and what could not be measured", () => {
    const card = ok(scorecard(doc(), "g"));
    // Going first: opens 55/56, clean 16/56, resilient 40/56, interaction 50/56.
    expect(weakest(card.first)).toEqual({ key: "clean", value: 16 / 56 });
    // Going second: opens 1, clean 3/28, resilient 25/28, interaction 27/28.
    expect(weakest(card.second)).toEqual({ key: "clean", value: 3 / 28 });
    expect(unmeasured(card.first)).toEqual([]);

    const partial = ok(scorecard(doc({ handtrap: false, bricks: false }), "g"));
    expect(unmeasured(partial.first)).toEqual(["clean", "resilient"]);
    // Only what was measured counts: interaction (50/56) is below opens (55/56).
    expect(weakest(partial.first)).toEqual({ key: "interaction", value: 50 / 56 });
  });
});

describe("combine and settings", () => {
  it("is a weighted mean over the numbers that exist", () => {
    expect(combine({ opens: 0.5, clean: null, resilient: null, interaction: 1 }, DEFAULT_WEIGHTS)).toBeCloseTo(0.75, 12);
  });

  it("falls back to the defaults for anything stored that is not valid", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("not json")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ opens: 5, brickTolerance: 2, clean: -1, first: 99 }))).toEqual({
      ...DEFAULT_SETTINGS,
      opens: 5,
      brickTolerance: 2,
    });
  });
});
