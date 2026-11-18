import { describe, expect, it } from "vitest";
import indexText from "../../public/decks/index.json?raw";
import { parseDeckIndex } from "./deckLibrary";
import { mappingName } from "./saveMapping";
import { parseMappingJson } from "./document";

const files = import.meta.glob("../../public/decks/*.mapping.json", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const byFile = new Map(Object.entries(files).map(([path, text]) => [path.split("/").pop()!, text]));

describe("reading the deck index", () => {
  it("lists the decks with a bare file name and a name, and names the default", () => {
    const index = parseDeckIndex(
      JSON.stringify({
        default: "b.mapping.json",
        decks: [
          { file: "a.mapping.json", name: "A" },
          { file: "b.mapping.json", name: "B" },
        ],
      }),
    );
    expect(index.decks.map((d) => d.name)).toEqual(["A", "B"]);
    expect(index.default).toBe("b.mapping.json");
  });

  it("leaves out entries that could point outside the folder, repeat, or have no name", () => {
    const index = parseDeckIndex(
      JSON.stringify({
        default: "../x.mapping.json",
        decks: [
          { file: "../secrets.mapping.json", name: "Up" },
          { file: "sub/deck.mapping.json", name: "Down" },
          { file: "plain.json", name: "Not a mapping" },
          { file: "ok.mapping.json", name: "OK" },
          { file: "ok.mapping.json", name: "Again" },
          { file: "nameless.mapping.json" },
          "text",
          null,
        ],
      }),
    );
    expect(index.decks).toEqual([{ file: "ok.mapping.json", name: "OK" }]);
    // A default that is not in the list is no default.
    expect(index.default).toBeNull();
  });

  it("is empty for a page that is not an index, or text that is not JSON", () => {
    expect(parseDeckIndex("<!doctype html><html></html>")).toEqual({ default: null, decks: [] });
    expect(parseDeckIndex("{ nope")).toEqual({ default: null, decks: [] });
    expect(parseDeckIndex("[]")).toEqual({ default: null, decks: [] });
  });
});

describe("public/decks/index.json", () => {
  const index = parseDeckIndex(indexText);

  it("lists exactly the mapping files in the folder, with the names saved in them (npm run decks:index)", () => {
    expect([...byFile.keys()].sort()).toEqual(index.decks.map((deck) => deck.file).sort());
    for (const deck of index.decks) {
      expect(mappingName(byFile.get(deck.file)!)).toBe(deck.name);
    }
  });

  it("gives every deck its own name, and a default that exists", () => {
    const names = index.decks.map((deck) => deck.name);
    expect(new Set(names).size).toBe(names.length);
    expect(index.default).not.toBeNull();
  });

  it("holds decks that open with cards and their models", () => {
    for (const [file, text] of byFile) {
      const doc = parseMappingJson(text);
      expect(doc.main.length, file).toBeGreaterThan(0);
      expect(doc.hand_condition_sets.length, file).toBeGreaterThan(0);
    }
  });
});
