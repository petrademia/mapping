import { describe, expect, it } from "vitest";
import { createDocument, type MappingDocument } from "./document";
import { rateHand } from "./handRating";
import { DEFAULT_SETTINGS, scorecard, type Scorecard, type ScorecardSettings } from "./scorecard";

const none = { going_first: null, going_second: null } as const;
const plain = { roles: [], opening_quality: none };
const interaction = { roles: ["interaction"], opening_quality: none };
const brick = { roles: [], opening_quality: { going_first: "undesirable", going_second: "undesirable" } };

/** The same 8-card deck as the scorecard tests: card 1 is the goal, 2 a brick, 3 Interaction. */
function doc(options: { handtrap?: boolean; bricks?: boolean; interactionRole?: boolean } = {}): MappingDocument {
  const { handtrap = true, bricks = true, interactionRole = true } = options;
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

function card(d: MappingDocument, settings: ScorecardSettings): Scorecard {
  const result = scorecard(d, "g", settings);
  if ("error" in result) throw new Error(result.error);
  return result;
}

function choose(n: number, k: number): number {
  let out = 1;
  for (let i = 0; i < k; i += 1) out = (out * (n - i)) / (i + 1);
  return out;
}

/** Every hand of `size` cards from the 8-card deck, with how many ways each can be drawn. */
function hands(size: number): { counts: Record<number, number>; ways: number }[] {
  const out: { counts: Record<number, number>; ways: number }[] = [];
  for (let a = 0; a <= 3; a += 1) {
    for (let b = 0; b <= 3; b += 1) {
      const c = size - a - b;
      if (c < 0 || c > 2) continue;
      out.push({ counts: { 1: a, 2: b, 3: c }, ways: choose(3, a) * choose(3, b) * choose(2, c) });
    }
  }
  return out;
}

describe("rateHand", () => {
  it("runs the Scorecard's checks on one hand", () => {
    const d = doc();
    const first = card(d, DEFAULT_SETTINGS).first;
    // Two copies of the goal card, one brick, one Interaction card.
    const rating = rateHand(d, { 1: 2, 2: 1, 3: 1 }, "g", first, DEFAULT_SETTINGS);
    expect(Object.fromEntries(rating.checks.map((c) => [c.key, c.passed]))).toEqual({
      opens: true,
      clean: true, // one brick, one allowed
      resilient: true, // the second copy covers the one the handtrap stops
      interaction: true,
    });
    expect(rating.score).toBe(1);
    expect(rating.deckAverage).toBeCloseTo(first.combined!, 12);

    // One copy, two bricks and no Interaction: meets the goal and nothing else.
    const weak = rateHand(d, { 1: 1, 2: 2, 3: 0 }, "g", first, DEFAULT_SETTINGS);
    expect(Object.fromEntries(weak.checks.map((c) => [c.key, c.passed]))).toEqual({
      opens: true,
      clean: false,
      resilient: false,
      interaction: false,
    });
    expect(weak.score).toBeCloseTo(1 / 4, 12);
    expect(weak.checks.find((c) => c.key === "resilient")!.detail).toBe("broken by Veiler");
  });

  it("a hand that misses the goal fails the checks that depend on it", () => {
    const d = doc();
    const first = card(d, DEFAULT_SETTINGS).first;
    const rating = rateHand(d, { 1: 0, 2: 2, 3: 2 }, "g", first, DEFAULT_SETTINGS);
    const byKey = Object.fromEntries(rating.checks.map((c) => [c.key, c]));
    expect(byKey.opens!.passed).toBe(false);
    expect(byKey.clean!.passed).toBe(false);
    expect(byKey.resilient!.detail).toBe("does not meet the Hand Goal to begin with");
    expect(byKey.interaction!.passed).toBe(true);
  });

  it("leaves out what the deck cannot measure, as the deck number does", () => {
    const d = doc({ handtrap: false, bricks: false });
    const first = card(d, DEFAULT_SETTINGS).first;
    const rating = rateHand(d, { 1: 1, 2: 1, 3: 1 }, "g", first, DEFAULT_SETTINGS);
    expect(rating.checks.filter((c) => c.passed === null).map((c) => c.key)).toEqual(["clean", "resilient"]);
    expect(rating.score).toBe(1); // opens and interaction, both passed
  });
});

describe("the average hand rating is the deck's number", () => {
  const cases: [string, MappingDocument, ScorecardSettings][] = [
    ["everything measured", doc(), DEFAULT_SETTINGS],
    ["uneven weights", doc(), { ...DEFAULT_SETTINGS, opens: 3, clean: 1, resilient: 2, interaction: 5, brickTolerance: 2 }],
    ["no handtraps or bricks", doc({ handtrap: false, bricks: false }), DEFAULT_SETTINGS],
    ["no Interaction role", doc({ interactionRole: false }), { ...DEFAULT_SETTINGS, brickTolerance: 0 }],
  ];
  for (const [label, d, settings] of cases) {
    it(`${label}, going first (5 cards) and going second (6 cards)`, () => {
      const result = card(d, settings);
      for (const turn of [result.first, result.second]) {
        let weighted = 0;
        let total = 0;
        for (const hand of hands(turn.sample)) {
          const rating = rateHand(d, hand.counts, "g", turn, settings);
          weighted += hand.ways * (rating.score ?? 0);
          total += hand.ways;
        }
        expect(total).toBe(choose(8, turn.sample));
        expect(weighted / total).toBeCloseTo(turn.combined ?? 0, 12);
      }
    });
  }
});
