import { describe, expect, it } from "vitest";
import { labelIndex, labelsOf, matchesSpotlight, spotlightCounts } from "./deckLabels";
import type { MappingCard } from "./document";

const card = (card_id: number, quantity: number, roles: string[] = []): MappingCard =>
  ({ card_id, quantity, taxonomy: { roles, opening_quality: { going_first: null, going_second: null } } }) as MappingCard;

const derived = (starter: boolean, extender: boolean, brick: boolean) => ({ starter, extender, brick });

describe("deck labels", () => {
  it("reads Starter, Extender and Brick from the Hand Conditions when they exist", () => {
    const flags = labelsOf(card(1, 1, ["starter"]), derived(false, true, false));
    expect(flags).toEqual({ starter: false, extender: true, brick: false, breaker: false });
  });

  it("falls back to the tags without a Hand Goal, and knows no Bricks", () => {
    const flags = labelsOf(card(1, 1, ["starter", "breaker"]), undefined);
    expect(flags).toEqual({ starter: true, extender: false, brick: false, breaker: true });
  });

  it("counts copies, not cards", () => {
    const cards = [card(1, 3), card(2, 2), card(3, 1, ["breaker"])];
    const map = new Map([
      [1, derived(false, false, true)],
      [2, derived(true, false, false)],
      [3, derived(false, false, false)],
    ]);
    const counts = spotlightCounts(cards, (c) => map.get(c.card_id));
    expect(counts).toEqual({ all: 6, starter: 2, extender: 0, brick: 3, breaker: 1 });
  });

  it("spotlights only the cards with the label", () => {
    const brick = card(1, 1);
    const starter = card(2, 1);
    expect(matchesSpotlight(brick, derived(false, false, true), "brick")).toBe(true);
    expect(matchesSpotlight(starter, derived(true, false, false), "brick")).toBe(false);
    expect(matchesSpotlight(starter, derived(true, false, false), "all")).toBe(true);
  });

  it("sorts Starters, Extenders, Breakers, Bricks, then the rest", () => {
    const order = [
      labelIndex(card(1, 1), derived(true, true, false)),
      labelIndex(card(2, 1), derived(false, true, false)),
      labelIndex(card(3, 1, ["breaker"]), derived(false, false, false)),
      labelIndex(card(4, 1), derived(false, false, true)),
      labelIndex(card(5, 1), derived(false, false, false)),
    ];
    expect(order).toEqual([0, 1, 2, 3, 4]);
  });
});
