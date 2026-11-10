import { describe, expect, it } from "vitest";
import { copiesValue, scorerFor } from "./rankScore";
import type { MappingCard } from "./document";

const card = (card_id: number, quantity: number): MappingCard => ({
  card_id,
  quantity,
  taxonomy: { roles: [], opening_quality: { going_first: null, going_second: null } },
});

const deck = [card(1, 3), card(2, 2), card(3, 1), card(4, 4)];
const order = [1, 2, 3, 4];

describe("rank score", () => {
  const scorer = scorerFor(deck, order, "going_first");

  it("weights a card by 1 over the square root of its rank", () => {
    expect(scorer.weightOf(1)).toBe(1);
    expect(scorer.weightOf(2)).toBeCloseTo(1 / Math.SQRT2);
    expect(scorer.weightOf(4)).toBeCloseTo(0.5);
    expect(scorer.weightOf(99)).toBe(0);
    expect(scorer.positionOf(3)).toBe(3);
  });

  it("scores the best possible hand 100%", () => {
    // Best five copies by value: 1st of card 1, 1st of 2, 1st of 3, 2nd of 1 and 1st of 4.
    expect(scorer.score({ 1: 2, 2: 1, 3: 1, 4: 1 })).toBeCloseTo(1);
  });

  it("scores a weaker hand lower, and lower still the further down the ranking", () => {
    const strong = scorer.score({ 1: 2, 2: 2, 3: 1 });
    const weak = scorer.score({ 4: 4, 3: 1 });
    expect(strong).toBeLessThan(1);
    expect(weak).toBeLessThan(strong);
    expect(scorer.score({})).toBe(0);
  });

  it("reaches its exact expected value over every five-card hand", () => {
    // Average the score of every distinct 5-card hand weighted by how often it occurs.
    const copies: number[] = [];
    for (const c of deck) for (let i = 0; i < c.quantity; i += 1) copies.push(c.card_id);
    let sum = 0;
    let count = 0;
    const n = copies.length;
    const pick = (start: number, chosen: number[]): void => {
      if (chosen.length === 5) {
        const counts: Record<number, number> = {};
        for (const id of chosen) counts[id] = (counts[id] ?? 0) + 1;
        sum += scorer.score(counts);
        count += 1;
        return;
      }
      for (let i = start; i < n; i += 1) pick(i + 1, [...chosen, copies[i]!]);
    };
    pick(0, []);
    expect(scorer.expected(5)).toBeCloseTo(sum / count, 10);
  });

  it("counts a second copy at half and a third at a quarter", () => {
    expect(copiesValue(1, 1)).toBe(1);
    expect(copiesValue(1, 2)).toBeCloseTo(1.5);
    expect(copiesValue(1, 3)).toBeCloseTo(1.75);
    expect(copiesValue(0.5, 2)).toBeCloseTo(0.75);
  });

  it("does not punish a deck for running three copies of its best card", () => {
    const distinct = Array.from({ length: 42 }, (_, i) => card(i + 1, 1));
    const stacked = [card(1, 3), ...distinct.slice(1, 40)];
    const a = scorerFor(distinct, distinct.map((c) => c.card_id), "going_first");
    const b = scorerFor(stacked, stacked.map((c) => c.card_id), "going_first");
    const hand = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 };
    // The same hand scores about the same in both decks, not far lower in the stacked one.
    expect(Math.abs(a.score(hand) - b.score(hand))).toBeLessThan(0.1);
  });

  it("lets five good cards beat one great card with four dead ones by a wide margin", () => {
    const big = Array.from({ length: 42 }, (_, i) => card(i + 1, 1));
    const wide = scorerFor(big, big.map((c) => c.card_id), "going_first");
    const oneGreat = wide.score({ 1: 1, 30: 1, 31: 1, 32: 1, 33: 1 });
    const fiveGood = wide.score({ 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 });
    expect(oneGreat).toBeCloseTo(0.53, 1);
    expect(fiveGood).toBeCloseTo(0.82, 1);
    expect(fiveGood - oneGreat).toBeGreaterThan(0.25);
  });

  it("judges another deck by this ranking, giving unknown cards no weight", () => {
    const other = scorerFor([card(1, 1), card(900, 4)], order, "going_first");
    expect(other.weightOf(900)).toBe(0);
    expect(other.score({ 1: 1 })).toBeCloseTo(1);
  });
});
