import { describe, expect, it } from "vitest";
import ydkText from "../../public/default.ydk?raw";
import { deckFromYdkText } from "./defaultDeck";
import { sectionSize } from "./document";

describe("default deck", () => {
  const doc = deckFromYdkText(ydkText);

  it("parses the bundled public/default.ydk into main, extra and side", () => {
    expect(sectionSize(doc.main)).toBeGreaterThanOrEqual(40);
    expect(sectionSize(doc.main)).toBeLessThanOrEqual(60);
    expect(sectionSize(doc.extra)).toBeGreaterThan(0);
    expect(sectionSize(doc.extra)).toBeLessThanOrEqual(15);
    expect(sectionSize(doc.side)).toBe(0);
  });

  it("merges copies and keeps annotations empty", () => {
    const ash = doc.main.find((card) => card.card_id === 14558127);
    expect(ash?.quantity).toBe(2);
    for (const card of doc.main) {
      expect(card.taxonomy.roles).toEqual([]);
    }
  });

  it("stores no card names, so names follow the catalog", () => {
    for (const card of [...doc.main, ...doc.extra]) {
      expect(card.name).toBeUndefined();
    }
  });

  it("starts without models or configurations", () => {
    expect(doc.groups).toEqual([]);
    expect(doc.hand_conditions).toEqual([]);
    expect(doc.configurations).toEqual([]);
  });

  it("reads explicit sections from ydk text", () => {
    const small = deckFromYdkText("#main\n1\n1\n#extra\n2\n!side\n3\n");
    expect(small.main).toEqual([expect.objectContaining({ card_id: 1, quantity: 2 })]);
    expect(small.extra.map((c) => c.card_id)).toEqual([2]);
    expect(small.side.map((c) => c.card_id)).toEqual([3]);
  });
});
