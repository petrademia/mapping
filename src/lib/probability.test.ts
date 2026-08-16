import { describe, expect, it } from "vitest";
import {
  openingAtLeastProbability,
  openingCountDistribution,
  openingCountProbability,
  ProbabilityError,
} from "./probability";

describe("composition probabilities", () => {
  it("matches hypergeometric P(X = k)", () => {
    const p0 = openingCountProbability(40, 3, 5, 0);
    const p1 = openingCountProbability(40, 3, 5, 1);
    const p2 = openingCountProbability(40, 3, 5, 2);
    const p3 = openingCountProbability(40, 3, 5, 3);
    expect(p0).toBeCloseTo(0.662449392712551, 12);
    expect(p1).toBeCloseTo(0.301113360323887, 12);
    expect(p2 + p3).toBeCloseTo(1 - p0 - p1, 12);
    expect(openingCountProbability(40, 3, 5, 5)).toBe(0);
  });

  it("matches P(X >= 1) from the YAPPING Branded check", () => {
    expect(openingAtLeastProbability(40, 3, 5, 1)).toBeCloseTo(0.3375506073, 9);
    expect(openingAtLeastProbability(40, 3, 5, 0)).toBe(1);
  });

  it("has a count distribution that sums to 1", () => {
    const dist = openingCountDistribution(40, 9, 5);
    const total =
      dist.exact[0]! + dist.exact[1]! + dist.exact[2]! + dist.atLeast3;
    expect(total).toBeCloseTo(1, 12);
    expect(dist.atLeast3).toBeCloseTo(
      openingAtLeastProbability(40, 9, 5, 3),
      12,
    );
  });

  it("treats a zero-role deck as P(X = 0) = 1", () => {
    expect(openingCountProbability(40, 0, 5, 0)).toBe(1);
    expect(openingAtLeastProbability(40, 0, 5, 1)).toBe(0);
    const dist = openingCountDistribution(40, 0, 5);
    expect(dist.exact[0]).toBe(1);
    expect(dist.exact[1]).toBe(0);
    expect(dist.atLeast3).toBe(0);
  });

  it("treats every card matching as P(X = hand size) = 1", () => {
    expect(openingCountProbability(40, 40, 5, 5)).toBe(1);
    expect(openingCountProbability(40, 40, 5, 4)).toBe(0);
    expect(openingAtLeastProbability(40, 40, 5, 1)).toBe(1);
  });

  it("stays accurate when combinations exceed Number precision", () => {
    const dist = openingCountDistribution(60, 20, 25);
    const total =
      dist.exact[0]! + dist.exact[1]! + dist.exact[2]! + dist.atLeast3;
    expect(total).toBeCloseTo(1, 10);
  });

  it("rejects invalid deck and hand sizes", () => {
    expect(() => openingCountProbability(40, 41, 5, 1)).toThrow(ProbabilityError);
    expect(() => openingCountProbability(40, 3, 41, 1)).toThrow(ProbabilityError);
    expect(() => openingAtLeastProbability(0, 0, 1, 1)).toThrow(ProbabilityError);
    expect(() => openingCountProbability(-1, 0, 0, 0)).toThrow(ProbabilityError);
  });
});
