import { describe, expect, it } from "vitest";
import mappingText from "../../public/decks/power-patron-ars-magna-artmage.mapping.json?raw";
import { deckFromMappingText } from "./defaultDeck";
import { createDocument, serializeMapping } from "./document";
import { chooseDeckFile, decideSave, mappingName } from "./saveMapping";

const named = (name: string) => serializeMapping({ ...createDocument(name), name });

describe("saving over the default mapping", () => {
  it("overwrites only when the deck has the same name as the one in the file", () => {
    expect(decideSave(named("Power Patron"), named("Power Patron"))).toEqual({ ok: true });
    // Surrounding spaces do not make a different name.
    expect(decideSave(named("Power Patron"), named("  Power Patron "))).toEqual({ ok: true });
  });

  it("refuses a deck with another name and says why", () => {
    const decision = decideSave(named("Power Patron"), named("Ritual"));
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toContain('"Power Patron"');
  });

  it("refuses when there is no file to replace, or either side is not a mapping", () => {
    expect(decideSave(null, named("Power Patron")).ok).toBe(false);
    expect(decideSave(named("Power Patron"), "not json").ok).toBe(false);
    expect(decideSave(named("Power Patron"), '{"name":"Power Patron"}').ok).toBe(false);
    expect(decideSave("<html></html>", named("Power Patron")).ok).toBe(false);
  });

  it("reads the name from a mapping file's text", () => {
    expect(mappingName(named("Power Patron"))).toBe("Power Patron");
    expect(mappingName("[]")).toBeNull();
    expect(mappingName("")).toBeNull();
  });
});

describe("choosing which deck file a saved deck replaces", () => {
  const files = [
    { file: "a.mapping.json", text: named("Power Patron") },
    { file: "b.mapping.json", text: named("Ritual") },
  ];

  it("picks the file that holds a deck of the same name", () => {
    expect(chooseDeckFile(files, named("Ritual"))).toEqual({ file: "b.mapping.json" });
    expect(chooseDeckFile(files, named("  Power Patron "))).toEqual({ file: "a.mapping.json" });
  });

  it("refuses a name no file has, and a file that is not a mapping", () => {
    const none = chooseDeckFile(files, named("Something new"));
    expect("reason" in none && none.reason).toContain('"Something new"');
    expect("reason" in chooseDeckFile(files, "not json")).toBe(true);
    expect("reason" in chooseDeckFile([], named("Ritual"))).toBe(true);
  });

  it("does not guess between two files with the same name", () => {
    const twins = [...files, { file: "c.mapping.json", text: named("Ritual") }];
    const result = chooseDeckFile(twins, named("Ritual"));
    expect("reason" in result && result.reason).toContain("More than one");
  });

  it("ignores a file in the folder that is not readable", () => {
    const withBroken = [...files, { file: "broken.mapping.json", text: "<html>" }];
    expect(chooseDeckFile(withBroken, named("Ritual"))).toEqual({ file: "b.mapping.json" });
  });
});

describe("the default deck's mapping file", () => {
  it("is a readable deck with cards and its models", () => {
    const doc = deckFromMappingText(mappingText);
    expect(doc).not.toBeNull();
    expect(doc!.main.length).toBeGreaterThan(0);
    expect(doc!.hand_condition_sets.length).toBeGreaterThan(0);
    expect(doc!.groups.length).toBeGreaterThan(0);
  });

  it("is saved in the app's own format, so saving it back changes nothing", () => {
    const doc = deckFromMappingText(mappingText)!;
    expect(serializeMapping(doc).trim()).toBe(mappingText.trim());
  });

  it("is not read from a page that is not a mapping", () => {
    expect(deckFromMappingText("<!doctype html><html></html>")).toBeNull();
    expect(deckFromMappingText("{}")).toBeNull();
    expect(deckFromMappingText(serializeMapping(createDocument("empty")))).toBeNull();
  });
});
