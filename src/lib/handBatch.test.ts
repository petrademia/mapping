import { describe, expect, it } from "vitest";
import type { MappingCard } from "./document";
import {
  generateHandBatch,
  MAX_BATCH_HANDS,
  summarizeBatch,
} from "./handBatch";
import type { HandConditionLike } from "./handExplorer";

const EMPTY_TAXONOMY = {
  roles: [],
  opening_quality: { going_first: null, going_second: null },
} as const;

function card(card_id: number, quantity: number): MappingCard {
  return { card_id, quantity, taxonomy: { ...EMPTY_TAXONOMY, roles: [] } };
}

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const DECK = [card(1, 3), card(2, 2), card(3, 35)];

const HAS_CARD_1: HandConditionLike = {
  id: "has-1",
  name: "Has card 1",
  requirements: [
    { id: "r1", kind: "card", card_id: 1, op: "gte", count: 1 },
  ],
};

const SETS = [
  { id: "engine", name: "Engine Access", condition_ids: ["has-1"], aggregation: "any" as const },
];

describe("generateHandBatch", () => {
  it("draws the requested number of valid hands", () => {
    const batch = generateHandBatch(DECK, 5, 10, [HAS_CARD_1], SETS, new Map(), lcg(1));
    expect(batch).toHaveLength(10);
    expect(batch.map((b) => b.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const { hand } of batch) {
      const total = Object.values(hand.card_counts).reduce((a, b) => a + b, 0);
      expect(total).toBe(5);
      expect(hand.observed_cards).toBe(5);
      for (const [id, count] of Object.entries(hand.card_counts)) {
        const owned = DECK.find((c) => c.card_id === Number(id))!.quantity;
        expect(count).toBeLessThanOrEqual(owned);
      }
    }
  });

  it("is deterministic for a seeded rng and varies across hands", () => {
    const a = generateHandBatch(DECK, 5, 20, [], [], new Map(), lcg(7));
    const b = generateHandBatch(DECK, 5, 20, [], [], new Map(), lcg(7));
    expect(a.map((h) => h.hand.card_counts)).toEqual(b.map((h) => h.hand.card_counts));
    const distinct = new Set(a.map((h) => JSON.stringify(h.hand.card_counts)));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it("rejects invalid counts", () => {
    for (const bad of [0, -1, 1.5, MAX_BATCH_HANDS + 1, Number.NaN]) {
      expect(() => generateHandBatch(DECK, 5, bad, [], [], new Map())).toThrow(/hand count/);
    }
    expect(generateHandBatch(DECK, 5, MAX_BATCH_HANDS, [], [], new Map(), lcg(3))).toHaveLength(
      MAX_BATCH_HANDS,
    );
  });

  it("rejects a hand larger than the deck", () => {
    expect(() => generateHandBatch([card(1, 3)], 5, 3, [], [], new Map())).toThrow();
  });
});

describe("summarizeBatch", () => {
  it("counts passes per set and condition and matches a manual tally", () => {
    const batch = generateHandBatch(DECK, 5, 200, [HAS_CARD_1], SETS, new Map(), lcg(11));
    const manual = batch.filter((b) => (b.hand.card_counts[1] ?? 0) >= 1).length;
    const summary = summarizeBatch(batch);
    expect(summary.count).toBe(200);
    expect(summary.sets).toHaveLength(1);
    expect(summary.sets[0]).toMatchObject({ id: "engine", name: "Engine Access", passed: manual });
    expect(summary.sets[0]!.rate).toBeCloseTo(manual / 200, 10);
    expect(summary.conditions[0]).toMatchObject({ id: "has-1", name: "Has card 1", passed: manual });
  });

  it("approximates the exact probability over many hands", () => {
    // P(at least one of 3 copies in 5 of 40) = 1 - C(37,5)/C(40,5) = 0.3374...
    const batch = generateHandBatch(DECK, 5, 1000, [HAS_CARD_1], SETS, new Map(), lcg(42));
    const rate = summarizeBatch(batch).sets[0]!.rate;
    expect(rate).toBeGreaterThan(0.29);
    expect(rate).toBeLessThan(0.39);
  });

  it("handles an empty batch", () => {
    expect(summarizeBatch([])).toEqual({ count: 0, sets: [], conditions: [] });
  });
});
