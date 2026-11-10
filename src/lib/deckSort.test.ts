import { describe, expect, it } from "vitest";
import { sortCards, sortsFor } from "./deckSort";
import type { MappingCard } from "./document";
import type { Role } from "./taxonomy";

const card = (card_id: number, roles: Role[] = []): MappingCard => ({
  card_id,
  quantity: 1,
  taxonomy: { roles, opening_quality: { going_first: null, going_second: null } },
});

const names: Record<number, string> = { 1: "Zeta", 2: "alpha", 3: "Mid", 4: "Beta" };
const context = (rankOrder: number[] | null = null) => ({
  nameOf: (c: MappingCard) => names[c.card_id] ?? String(c.card_id),
  rankOrder,
});

const cards = [card(1), card(2, ["interaction"]), card(3, ["starter", "extender"]), card(4, ["extender"])];

describe("sortCards", () => {
  it("As built keeps the order and returns a copy", () => {
    const out = sortCards(cards, "built", context());
    expect(out.map((c) => c.card_id)).toEqual([1, 2, 3, 4]);
    expect(out).not.toBe(cards);
  });

  it("sorts by role: starter, extender, interaction, then unassigned", () => {
    expect(sortCards(cards, "role", context()).map((c) => c.card_id)).toEqual([3, 4, 2, 1]);
  });

  it("sorts by name without regard to case", () => {
    expect(sortCards(cards, "name", context()).map((c) => c.card_id)).toEqual([2, 4, 3, 1]);
  });

  it("sorts by Card Rank, unranked last in built order", () => {
    expect(sortCards(cards, "rank", context([4, 2])).map((c) => c.card_id)).toEqual([4, 2, 1, 3]);
  });

  it("keeps ties in the order the deck was built", () => {
    const same = [card(1, ["starter"]), card(2, ["starter"]), card(3, ["starter"])];
    expect(sortCards(same, "role", context()).map((c) => c.card_id)).toEqual([1, 2, 3]);
  });
});

describe("sortsFor", () => {
  it("offers only what applies to each section", () => {
    expect(sortsFor("main")).toEqual(["built", "role", "rank", "name"]);
    expect(sortsFor("side")).toEqual(["built", "role", "name"]);
    expect(sortsFor("extra")).toEqual(["built", "name"]);
  });
});
