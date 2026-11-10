import { describe, expect, it } from "vitest";
import { computeCardImpact } from "./cardImpact";
import {
  analyzeHandConditions,
  compressDeck,
  forEachHandComposition,
  handConditionHolds,
  type HandConditionLike,
} from "./handExplorer";
import type { MappingCard } from "./document";
import type { OpeningQualityValue, Role } from "./taxonomy";

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const ROLES: Role[] = ["starter", "extender", "interaction"];
const QUALITY: (OpeningQualityValue | null)[] = [null, "desirable", "neutral", "undesirable"];

function randomDeck(rand: () => number, rows: number): MappingCard[] {
  return Array.from({ length: rows }, (_, i) => ({
    card_id: 100 + i,
    quantity: 1 + Math.floor(rand() * 3),
    taxonomy: {
      roles: ROLES.filter(() => rand() < 0.3),
      opening_quality: {
        going_first: QUALITY[Math.floor(rand() * QUALITY.length)] ?? null,
        going_second: QUALITY[Math.floor(rand() * QUALITY.length)] ?? null,
      },
    },
  }));
}

describe("compressDeck keeps every probability exact", () => {
  it("matches the uncompressed analysis on random decks", () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const rand = seeded(seed);
      const deck = randomDeck(rand, 9);
      const groups = new Map([["g", new Set([100, 101, 105])]]);
      const conditions: HandConditionLike[] = [
        { id: "c1", name: "c1", requirements: [{ kind: "card", card_id: 102, op: "gte", count: 1 }] },
        {
          id: "c2",
          name: "c2",
          requirements: [{ kind: "role", role: "starter", op: "gte", count: 1 }],
          excludes: [{ kind: "group", group_id: "g", op: "gte", count: 2 }],
        },
        { id: "c3", name: "c3", requirements: [{ kind: "group", group_id: "g", op: "eq", count: 1 }] },
        { id: "c4", name: "c4", requirements: [{ kind: "role", role: "extender", op: "eq", count: 2 }] },
        {
          id: "c5",
          name: "c5",
          requirements: [{ kind: "role", role: "interaction", op: "lte", count: 1 }],
          excludes: [{ kind: "card", card_id: 103, op: "neq", count: 0 }],
        },
        { id: "c6", name: "c6", requirements: [{ kind: "group", group_id: "g", op: "gt", count: 2 }] },
      ];
      const sets = [
        { id: "s1", name: "s1", condition_ids: ["c1", "c2"] },
        { id: "s2", name: "s2", condition_ids: ["c2", "c3", "c4", "c5", "c6"] },
      ];
      for (const turn of ["going_first", "going_second"] as const) {
        for (const size of [3, 5]) {
          const a = analyzeHandConditions(deck, size, conditions, sets, groups, turn);
          const b = analyzeHandConditions(deck, size, conditions, sets, groups, turn, {
            compress: false,
            enumerate: true,
          });
          expect(a.conditions.map((c) => c.weight)).toEqual(b.conditions.map((c) => c.weight));
          expect(a.sets.map((s) => s.unionWeight)).toEqual(b.sets.map((s) => s.unionWeight));
          expect(a.sets.map((s) => s.distribution.weights)).toEqual(
            b.sets.map((s) => s.distribution.weights),
          );
          expect(a.sets.map((s) => s.openingQuality)).toEqual(b.sets.map((s) => s.openingQuality));
          const byKey = (m: typeof a.overlaps) => [...m].sort(([x], [y]) => (x < y ? -1 : 1));
          expect(byKey(a.overlaps)).toEqual(byKey(b.overlaps));
        }
      }
    }
  });

  it("merges identical cards but never a card a condition names", () => {
    const plain = (id: number): MappingCard => ({
      card_id: id,
      quantity: 2,
      taxonomy: { roles: [], opening_quality: { going_first: null, going_second: null } },
    });
    const deck = [plain(1), plain(2), plain(3)];
    const condition: HandConditionLike = {
      id: "c",
      name: "c",
      requirements: [{ kind: "card", card_id: 1, op: "gte", count: 1 }],
    };
    const merged = compressDeck(deck, [condition], new Map());
    expect(merged.map((c) => c.quantity).sort()).toEqual([2, 4]);
  });

  it("makes a ten-card hand fast", () => {
    const rand = seeded(7);
    const deck: MappingCard[] = Array.from({ length: 42 }, (_, i) => ({
      card_id: 1000 + i,
      quantity: 1,
      taxonomy: {
        roles: i % 7 === 0 ? ["starter"] : [],
        opening_quality: { going_first: null, going_second: null },
      },
    }));
    void rand;
    const start = performance.now();
    analyzeHandConditions(
      deck,
      10,
      [{ id: "c", name: "c", requirements: [{ kind: "role", role: "starter", op: "gte", count: 1 }] }],
      [{ id: "s", name: "s", condition_ids: ["c"] }],
      new Map(),
      "going_first",
    );
    expect(performance.now() - start).toBeLessThan(2000);
  });
});

describe("computeCardImpact matches a brute-force count", () => {
  it("agrees on random decks", () => {
    for (let seed = 20; seed < 26; seed += 1) {
      const rand = seeded(seed);
      const deck = randomDeck(rand, 8);
      const groups = new Map([["g", new Set([100, 104])]]);
      const conditions: HandConditionLike[] = [
        { id: "a", name: "a", requirements: [{ kind: "card", card_id: 101, op: "gte", count: 1 }] },
        {
          id: "b",
          name: "b",
          requirements: [{ kind: "role", role: "starter", op: "gte", count: 1 }],
          excludes: [{ kind: "group", group_id: "g", op: "gte", count: 1 }],
        },
      ];
      const set = { id: "s", name: "s", condition_ids: ["a", "b"] };
      const impact = computeCardImpact(deck, 4, conditions, set, groups);

      let total = 0n;
      let passing = 0n;
      const withW = deck.map(() => 0n);
      const withP = deck.map(() => 0n);
      forEachHandComposition(deck, 4, (hand, weight) => {
        total += weight;
        const passed = conditions.some((c) => handConditionHolds(hand, deck, c, groups));
        if (passed) passing += weight;
        deck.forEach((_, i) => {
          if ((hand[i] ?? 0) > 0) {
            withW[i] = withW[i]! + weight;
            if (passed) withP[i] = withP[i]! + weight;
          }
        });
      });
      expect(impact.baseline).toBeCloseTo(Number(passing) / Number(total), 12);
      deck.forEach((card, i) => {
        const row = impact.rows.find((r) => r.card_id === card.card_id)!;
        const expected = withW[i]! === 0n ? null : Number(withP[i]!) / Number(withW[i]!);
        if (expected === null) expect(row.withCard).toBeNull();
        else expect(row.withCard).toBeCloseTo(expected, 12);
      });
    }
  });
});
