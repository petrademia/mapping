import { describe, expect, it } from "vitest";
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

  it("returns empty for blank query", () => {
    expect(searchCatalog(catalog, "   ")).toEqual([]);
  });

  it("resolves a raw passcode query when present", () => {
    expect(searchCatalog(catalog, "70488851")).toEqual([
      { card_id: 70488851, name: "Power Patron of Ars Magna - Vidolium" },
    ]);
  });
});