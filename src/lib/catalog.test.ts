import { describe, expect, it } from "vitest";
import catalogJson from "../../public/catalog.json";
import { searchCatalog } from "./catalog";

describe("searchCatalog", () => {
  const catalog = new Map<number, string>([
    [1, "Ash Blossom & Joyous Spring"],
    [2, "Ashened for Continuity"],
    [3, "Nibiru, the Primal Being"],
    [70488851, "Power Patron of Ars Magna - Vidolium"],
  ]);

  it("matches substring case-insensitively and respects limit", () => {
    expect(searchCatalog(catalog, "ash", 2)).toEqual([
      { card_id: 2, name: "Ashened for Continuity" },
      { card_id: 1, name: "Ash Blossom & Joyous Spring" },
    ]);
  });

  it("matches every word in any order, not one contiguous phrase", () => {
    const long = new Map<number, string>([
      [82833574, "Ars Magna Academic Arcane Apparition Acropolis"],
      [74733322, "Artmage Academic Arcane Arts Acropolis"],
    ]);
    expect(searchCatalog(long, "ars magna acropolis")).toEqual([
      { card_id: 82833574, name: "Ars Magna Academic Arcane Apparition Acropolis" },
    ]);
    expect(searchCatalog(long, "acropolis ars")).toHaveLength(1);
    expect(searchCatalog(long, "ars zzz")).toEqual([]);
  });

  it("ranks with BM25: rarer words and shorter names score higher", () => {
    const cards = new Map<number, string>([
      [1, "Dragon"],
      [2, "Blue-Eyes White Dragon"],
      [3, "Dragon Knight of the Ancient Order of Darkness"],
      [4, "Blue-Eyes Ultimate Dragon"],
    ]);
    // "dragon" appears in every name; the shortest name wins on length norm.
    expect(searchCatalog(cards, "dragon")[0]?.card_id).toBe(1);
    // "white" is rare, so it outweighs the common "dragon" for a mixed query.
    expect(searchCatalog(cards, "white dragon")[0]?.card_id).toBe(2);
    expect(searchCatalog(cards, "ultimate dragon")[0]?.card_id).toBe(4);
  });

  it("matches word prefixes while typing and ignores apostrophes", () => {
    const cards = new Map<number, string>([
      [90917401, "Omega Vidolium the Power Patron of Heaven's End"],
      [70488851, "Vidolium the Unstable Power Patron of Unity"],
    ]);
    expect(searchCatalog(cards, "omega vido").map((c) => c.card_id)).toEqual([90917401]);
    expect(searchCatalog(cards, "heaven's end").map((c) => c.card_id)).toEqual([90917401]);
    expect(searchCatalog(cards, "heavens").map((c) => c.card_id)).toEqual([90917401]);
    expect(searchCatalog(cards, "vidolium").map((c) => c.card_id)).toEqual([
      70488851,
      90917401,
    ]);
  });

  it("falls back to substring when no word prefix matches", () => {
    const cards = new Map<number, string>([[1, "Ash Blossom & Joyous Spring"]]);
    expect(searchCatalog(cards, "lossom").map((c) => c.card_id)).toEqual([1]);
    expect(searchCatalog(cards, "zzzz")).toEqual([]);
  });

  it("does not serve a stale index for a different catalog", () => {
    const first = new Map<number, string>([[1, "Alpha Card"]]);
    const second = new Map<number, string>([[2, "Beta Card"]]);
    expect(searchCatalog(first, "alpha")).toHaveLength(1);
    expect(searchCatalog(second, "alpha")).toEqual([]);
    expect(searchCatalog(second, "beta")).toHaveLength(1);
  });

  it("returns empty for blank query", () => {
    expect(searchCatalog(catalog, "   ")).toEqual([]);
  });

  it("resolves a raw passcode query when present", () => {
    expect(searchCatalog(catalog, "70488851")).toEqual([
      { card_id: 70488851, name: "Power Patron of Ars Magna - Vidolium" },
    ]);
  });
});

describe("generated MyCard catalog", () => {
  it("names Mind Mirror Force so Find card can resolve it", () => {
    expect(catalogJson["66247039"]).toBe("Mind Mirror Force");
    const catalog = new Map(
      Object.entries(catalogJson).map(([id, name]) => [Number(id), name]),
    );
    expect(searchCatalog(catalog, "mind mirror force")).toEqual([
      { card_id: 66247039, name: "Mind Mirror Force" },
      { card_id: 66247040, name: "Mind Mirror Force" },
    ]);
  });
});