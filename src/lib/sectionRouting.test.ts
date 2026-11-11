import { describe, expect, it } from "vitest";
import extraJson from "../../public/extra-deck.json";
import catalogJson from "../../public/catalog.json";
import { routeParsed, routeSection } from "./sectionRouting";

const EXTRA = new Set([90917401, 60344723]);
const KNOWN = new Set([90917401, 60344723, 70488851]);
const known = (id: number) => KNOWN.has(id);

describe("routeSection", () => {
  it("sends Extra Deck monsters from Main to Extra", () => {
    expect(routeSection("main", 90917401, EXTRA, known)).toBe("extra");
    expect(routeSection("main", 70488851, EXTRA, known)).toBe("main");
  });

  it("moves a known non-Extra card out of Extra, but keeps unknown ids", () => {
    expect(routeSection("extra", 70488851, EXTRA, known)).toBe("main");
    expect(routeSection("extra", 999, EXTRA, known)).toBe("extra");
  });

  it("never reroutes Side", () => {
    expect(routeSection("side", 90917401, EXTRA, known)).toBe("side");
    expect(routeSection("side", 70488851, EXTRA, known)).toBe("side");
  });

  it("does nothing when no Extra Deck data is loaded", () => {
    expect(routeSection("main", 90917401, new Set(), known)).toBe("main");
  });
});

describe("routeParsed", () => {
  it("rebalances parsed lines and counts the moves", () => {
    const { sections, moved } = routeParsed(
      {
        main: [
          { card_id: 70488851, quantity: 3 },
          { card_id: 90917401, quantity: 1 },
        ],
        extra: [{ card_id: 70488851, quantity: 1 }],
        side: [{ card_id: 90917401, quantity: 1 }],
      },
      EXTRA,
      known,
    );
    expect(sections.main.map((l) => l.card_id)).toEqual([70488851, 70488851]);
    expect(sections.extra.map((l) => l.card_id)).toEqual([90917401]);
    expect(sections.side.map((l) => l.card_id)).toEqual([90917401]);
    expect(moved).toBe(2);
  });
});

describe("generated Extra Deck data", () => {
  const extra = new Set(extraJson as number[]);
  const catalog = catalogJson as Record<string, string>;

  it("lists the Ars Magna Extra Deck cards and Omega Vidolium", () => {
    for (const id of [90917401, 60344723, 96749437, 23133136]) {
      expect(extra.has(id)).toBe(true);
    }
  });

  it("does not list main-deck cards and only lists named cards", () => {
    expect(extra.has(70488851)).toBe(false);
    expect(extra.has(36270527)).toBe(false);
    for (const id of extra) expect(catalog[String(id)]).toBeDefined();
  });
});
