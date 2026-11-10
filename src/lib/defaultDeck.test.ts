import { describe, expect, it } from "vitest";
import ydkText from "../../public/default.ydk?raw";
import { deckFromYdkText } from "./defaultDeck";
import { sectionSize } from "./document";

// These tests describe any valid default deck, so replacing public/default.ydk
// does not break them.
describe("default deck", () => {
  const doc = deckFromYdkText(ydkText);

  it("parses the bundled public/default.ydk into legal-sized sections", () => {
    expect(sectionSize(doc.main)).toBeGreaterThanOrEqual(40);
    expect(sectionSize(doc.main)).toBeLessThanOrEqual(60);
    expect(sectionSize(doc.extra)).toBeLessThanOrEqual(15);
    expect(sectionSize(doc.side)).toBeLessThanOrEqual(15);
  });

  it("loads the Extra and Side sections as well as Main", () => {
    expect(sectionSize(doc.extra)).toBeGreaterThan(0);
    expect(sectionSize(doc.side)).toBeGreaterThan(0);
  });

  it("matches the file's own section counts", () => {
    const counts = { main: 0, extra: 0, side: 0 };
    let section: keyof typeof counts = "main";
    for (const raw of ydkText.split(/\r?\n/)) {
      const line = raw.trim().toLowerCase();
      if (line === "#main") section = "main";
      else if (line === "#extra") section = "extra";
      else if (line === "!side" || line === "#side") section = "side";
      else if (/^\d+$/.test(line)) counts[section] += 1;
    }
    expect(sectionSize(doc.main)).toBe(counts.main);
    expect(sectionSize(doc.extra)).toBe(counts.extra);
    expect(sectionSize(doc.side)).toBe(counts.side);
  });

  it("merges repeated ids into one row with a quantity", () => {
    const ids = [...doc.main, ...doc.extra, ...doc.side].map((card) => card.card_id);
    expect(new Set(ids.filter((id, i) => ids.indexOf(id) === i)).size).toBe(
      new Set(ids).size,
    );
    expect(doc.main.some((card) => card.quantity > 1)).toBe(true);
    for (const section of [doc.main, doc.extra, doc.side]) {
      expect(new Set(section.map((c) => c.card_id)).size).toBe(section.length);
    }
  });

  it("keeps annotations empty and stores no card names", () => {
    for (const card of [...doc.main, ...doc.extra, ...doc.side]) {
      expect(card.taxonomy.roles).toEqual([]);
      expect(card.name).toBeUndefined();
    }
  });

  it("starts without models or configurations", () => {
    expect(doc.groups).toEqual([]);
    expect(doc.hand_conditions).toEqual([]);
    expect(doc.configurations).toEqual([]);
  });

  it("adds side cards to the side section", () => {
    const withMore = deckFromYdkText(`${ydkText.trimEnd()}\n24224830\n24224830\n`);
    expect(sectionSize(withMore.side)).toBe(sectionSize(doc.side) + 2);
    expect(sectionSize(withMore.extra)).toBe(sectionSize(doc.extra));
    expect(sectionSize(withMore.main)).toBe(sectionSize(doc.main));
  });

  it("reads explicit sections from ydk text", () => {
    const small = deckFromYdkText("#main\n1\n1\n#extra\n2\n!side\n3\n");
    expect(small.main).toEqual([expect.objectContaining({ card_id: 1, quantity: 2 })]);
    expect(small.extra.map((c) => c.card_id)).toEqual([2]);
    expect(small.side.map((c) => c.card_id)).toEqual([3]);
  });
});
