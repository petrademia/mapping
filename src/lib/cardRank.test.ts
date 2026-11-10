import { describe, expect, it } from "vitest";
import {
  clearRank,
  isRanked,
  moveItem,
  normalizeOrder,
  parseCardRank,
  rankFor,
  resetRank,
  setRank,
} from "./cardRank";
import { exportYapping } from "./exportYapping";
import {
  addCard,
  createDocument,
  parseMappingJson,
  removeCard,
  replaceDeck,
  serializeMapping,
} from "./document";
import { EMPTY_TAXONOMY } from "./taxonomy";

function deck() {
  let doc = createDocument("d");
  for (const id of [10, 20, 30, 40]) {
    doc = addCard(doc, "main", { card_id: id, quantity: 1, taxonomy: { ...EMPTY_TAXONOMY } });
  }
  return doc;
}

describe("card rank", () => {
  it("starts unranked and shows deck order", () => {
    const doc = deck();
    expect(isRanked(doc, "going_first")).toBe(false);
    expect(rankFor(doc, "going_first")).toEqual([10, 20, 30, 40]);
  });

  it("keeps the two contexts separate", () => {
    const doc = setRank(setRank(deck(), "going_first", [30, 10]), "going_second", [40]);
    expect(rankFor(doc, "going_first")).toEqual([30, 10, 20, 40]);
    expect(rankFor(doc, "going_second")).toEqual([40, 10, 20, 30]);
    expect(isRanked(doc, "going_first")).toBe(true);
  });

  it("drops cards that left the Main Deck and appends new ones", () => {
    let doc = setRank(deck(), "going_first", [40, 30, 20, 10]);
    doc = removeCard(doc, "main", 30);
    expect(rankFor(doc, "going_first")).toEqual([40, 20, 10]);
    doc = addCard(doc, "main", { card_id: 50, quantity: 1, taxonomy: { ...EMPTY_TAXONOMY } });
    expect(rankFor(doc, "going_first")).toEqual([40, 20, 10, 50]);
  });

  it("survives replacing the deck", () => {
    const doc = setRank(deck(), "going_first", [40, 30]);
    const next = replaceDeck(doc, {
      main: [{ card_id: 30, quantity: 1 }, { card_id: 99, quantity: 1 }],
      extra: [],
      side: [],
    });
    expect(rankFor(next, "going_first")).toEqual([30, 99]);
  });

  it("moves items and clamps the target", () => {
    expect(moveItem([1, 2, 3, 4], 3, 0)).toEqual([4, 1, 2, 3]);
    expect(moveItem([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4]);
    expect(moveItem([1, 2, 3, 4], 1, 99)).toEqual([1, 3, 4, 2]);
    expect(moveItem([1, 2, 3, 4], 1, -5)).toEqual([2, 1, 3, 4]);
    expect(moveItem([1, 2, 3], 9, 0)).toEqual([1, 2, 3]);
  });

  it("normalizes duplicates and unknown ids", () => {
    expect(normalizeOrder([20, 20, 999, 10], deck().main)).toEqual([20, 10, 30, 40]);
  });

  it("parses saved data tolerantly", () => {
    expect(parseCardRank(undefined)).toEqual({ going_first: [], going_second: [] });
    expect(parseCardRank({ going_first: [3, "4", -1, 3, "x"], going_second: "no" })).toEqual({
      going_first: [3, 4],
      going_second: [],
    });
  });

  it("round-trips through mapping JSON and loads v8 files", () => {
    const doc = setRank(deck(), "going_second", [40, 10]);
    const parsed = parseMappingJson(serializeMapping(doc));
    expect(parsed.card_rank).toEqual(doc.card_rank);
    const legacy = JSON.parse(serializeMapping(createDocument("x")));
    legacy.schema_version = 8;
    delete legacy.card_rank;
    expect(parseMappingJson(JSON.stringify(legacy)).card_rank).toEqual({
      going_first: [],
      going_second: [],
    });
  });

  it("exports only ranked contexts to YAPPING", () => {
    expect(exportYapping(deck()).metadata.card_rank).toBeUndefined();
    const doc = setRank(deck(), "going_second", [40, 10]);
    expect(exportYapping(doc).metadata.card_rank).toEqual({
      going_second: [40, 10, 20, 30],
    });
  });

  it("resetRank forgets one context only", () => {
    const doc = resetRank(
      setRank(setRank(deck(), "going_first", [40]), "going_second", [30]),
      "going_first",
    );
    expect(isRanked(doc, "going_first")).toBe(false);
    expect(isRanked(doc, "going_second")).toBe(true);
  });

  it("clearRank returns both lists to deck order", () => {
    const doc = clearRank(setRank(deck(), "going_first", [40]));
    expect(isRanked(doc, "going_first")).toBe(false);
    expect(rankFor(doc, "going_first")).toEqual([10, 20, 30, 40]);
  });
});
