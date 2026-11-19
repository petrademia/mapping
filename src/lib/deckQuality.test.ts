import { describe, expect, it } from "vitest";
import { qualityCounts, qualityIndex, qualityOf } from "./deckQuality";
import type { MappingCard } from "./document";

const card = (
  card_id: number,
  quantity: number,
  first: "desirable" | "neutral" | "undesirable" | null,
  second: "desirable" | "neutral" | "undesirable" | null = null,
): MappingCard =>
  ({
    card_id,
    quantity,
    taxonomy: { roles: [], opening_quality: { going_first: first, going_second: second } },
  }) as MappingCard;

describe("opening quality in the deck view", () => {
  it("reads the quality for the chosen turn order", () => {
    const c = card(1, 1, "desirable", "undesirable");
    expect(qualityOf(c, "going_first")).toBe("desirable");
    expect(qualityOf(c, "going_second")).toBe("undesirable");
  });

  it("keeps Not set apart from Neutral", () => {
    expect(qualityOf(card(1, 1, null), "going_first")).toBe("unset");
    expect(qualityOf(card(1, 1, "neutral"), "going_first")).toBe("neutral");
  });

  it("counts copies, per turn order", () => {
    const cards = [card(1, 3, "desirable", null), card(2, 2, "undesirable", "desirable"), card(3, 1, null, null)];
    expect(qualityCounts(cards, "going_first")).toEqual({ desirable: 3, neutral: 0, undesirable: 2, unset: 1 });
    expect(qualityCounts(cards, "going_second")).toEqual({ desirable: 2, neutral: 0, undesirable: 0, unset: 4 });
  });

  it("sorts Desirable, Neutral, Undesirable, then Not set", () => {
    const order = [
      qualityIndex(card(1, 1, "desirable"), "going_first"),
      qualityIndex(card(2, 1, "neutral"), "going_first"),
      qualityIndex(card(3, 1, "undesirable"), "going_first"),
      qualityIndex(card(4, 1, null), "going_first"),
    ];
    expect(order).toEqual([0, 1, 2, 3]);
  });
});
