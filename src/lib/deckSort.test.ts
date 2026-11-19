import { describe, expect, it } from "vitest";
import { labelIndex } from "./deckLabels";
import { sortCards, sortsFor, upgradeSort } from "./deckSort";
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

/** The label sort, reading labels from the tags (no Hand Goal). */
const labelled = () => ({ ...context(), labelOf: (c: MappingCard) => labelIndex(c, undefined) });

const cards = [card(1), card(2, ["interaction"]), card(3, ["starter", "extender"]), card(4, ["extender"])];

describe("sortCards", () => {
  it("As built keeps the order and returns a copy", () => {
    const out = sortCards(cards, "built", context());
    expect(out.map((c) => c.card_id)).toEqual([1, 2, 3, 4]);
    expect(out).not.toBe(cards);
  });

  it("sorts by label: starter, extender, interaction, then unlabelled", () => {
    expect(sortCards(cards, "label", labelled()).map((c) => c.card_id)).toEqual([3, 4, 2, 1]);
  });

  it("sorts by name without regard to case", () => {
    expect(sortCards(cards, "name", context()).map((c) => c.card_id)).toEqual([2, 4, 3, 1]);
  });

  it("sorts by Card Rank, unranked last in built order", () => {
    expect(sortCards(cards, "rank", context([4, 2])).map((c) => c.card_id)).toEqual([4, 2, 1, 3]);
  });

  it("keeps ties in the order the deck was built", () => {
    const same = [card(1, ["starter"]), card(2, ["starter"]), card(3, ["starter"])];
    expect(sortCards(same, "label", labelled()).map((c) => c.card_id)).toEqual([1, 2, 3]);
  });
});

describe("sorting by label", () => {
  it("groups by the label index, keeping the built order inside a group", () => {
    const cards = [card(1), card(2), card(3), card(4)];
    const labelOf = (c: MappingCard) => ({ 1: 3, 2: 0, 3: 3, 4: 0 })[c.card_id as 1 | 2 | 3 | 4];
    const sorted = sortCards(cards, "label", { nameOf: () => "", rankOrder: null, labelOf });
    expect(sorted.map((c) => c.card_id)).toEqual([2, 4, 1, 3]);
  });
});

describe("sorting by quality", () => {
  it("orders by the quality index, keeping the built order inside a group", () => {
    const cs = [card(1), card(2), card(3), card(4)];
    const qualityOf = (c: MappingCard) => ({ 1: 2, 2: 0, 3: 2, 4: 0 })[c.card_id as 1 | 2 | 3 | 4];
    const sorted = sortCards(cs, "quality", { ...context(), qualityOf });
    expect(sorted.map((c) => c.card_id)).toEqual([2, 4, 1, 3]);
  });
});

describe("a sort saved before Role and Label became one", () => {
  it("turns Role into Label and leaves the others", () => {
    expect(upgradeSort("role")).toBe("label");
    expect(upgradeSort("name")).toBe("name");
    expect(upgradeSort(undefined)).toBeUndefined();
  });
});

describe("sortsFor", () => {
  it("offers only what applies to each section", () => {
    expect(sortsFor("main")).toEqual(["built", "label", "quality", "rank", "name"]);
    expect(sortsFor("side")).toEqual(["built", "label", "quality", "name"]);
    expect(sortsFor("extra")).toEqual(["built", "name"]);
  });
});
