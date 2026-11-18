import { describe, expect, it } from "vitest";
import { copiesIn, drawOddsRows } from "./drawOdds";

const card = (card_id: number, quantity: number) => ({ card_id, quantity }) as never;

describe("draw odds", () => {
  it("counts the copies of the chosen cards", () => {
    const main = [card(1, 3), card(2, 2), card(3, 1)];
    expect(copiesIn(main, new Set([1, 3]))).toBe(4);
    expect(copiesIn(main, new Set())).toBe(0);
  });

  it("matches the known 3-of in a 40-card deck", () => {
    const five = drawOddsRows(40, 3, 5)[0]!;
    // 1 - C(37,5)/C(40,5) = 0.3375...
    expect(five.seen).toBe(5);
    expect(five.atLeast[0]).toBeCloseTo(0.33755, 4);
    expect(five.atLeast[1]).toBeLessThan(five.atLeast[0]);
    expect(five.atLeast[2]).toBeLessThan(five.atLeast[1]);
  });

  it("grows with each card seen and stops at the deck size", () => {
    const rows = drawOddsRows(40, 3, 5, 3);
    expect(rows.map((row) => row.seen)).toEqual([5, 6, 7, 8]);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i]!.atLeast[0]).toBeGreaterThan(rows[i - 1]!.atLeast[0]);
    }
    expect(drawOddsRows(6, 1, 5, 5).map((row) => row.seen)).toEqual([5, 6]);
  });

  it("is zero with no copies", () => {
    expect(drawOddsRows(40, 0, 5)[0]!.atLeast).toEqual([0, 0, 0]);
  });
});
