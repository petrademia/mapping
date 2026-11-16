import { describe, expect, it } from "vitest";
import mappingText from "../../public/default.mapping.json?raw";
import { deckFromMappingText } from "./defaultDeck";
import { createDocument, serializeMapping } from "./document";
import { decideSave, mappingName } from "./saveMapping";

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

describe("the default mapping file", () => {
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
