import { describe, expect, it } from "vitest";
import {
  EMPTY_TAXONOMY,
  normalizeTaxonomy,
  mergeTaxonomies,
  openingQualityForTurn,
  openingQualityDensity,
  copiesForOpeningQuality,
  type ContextualOpeningQuality,
} from "./taxonomy";
import { createDocument, setCardTaxonomy } from "./document";
import type { MappingCard } from "./document";

function tax(cq: Partial<ContextualOpeningQuality> = {}): ContextualOpeningQuality {
  return { going_first: null, going_second: null, ...cq };
}

function card(
  card_id: number,
  quantity: number,
  cq: ContextualOpeningQuality,
): MappingCard {
  return { card_id, quantity, taxonomy: { roles: [], opening_quality: cq } };
}

describe("contextual opening quality model", () => {
  it("defaults GF and GS quality to unclassified", () => {
    expect(EMPTY_TAXONOMY.opening_quality).toEqual({
      going_first: null,
      going_second: null,
    });
    expect(normalizeTaxonomy({ roles: [] }).opening_quality).toEqual({
      going_first: null,
      going_second: null,
    });
  });

  it("defaults both contexts to unclassified on a new card", () => {
    const doc = setCardTaxonomy(createDocument("t"), "main", 1, {
      roles: [],
      opening_quality: EMPTY_TAXONOMY.opening_quality,
    });
    expect(doc.main[0]?.taxonomy.opening_quality).toEqual({
      going_first: null,
      going_second: null,
    });
  });

  it("lets GF and GS differ", () => {
    const taxonomy = normalizeTaxonomy({
      roles: ["interaction"],
      opening_quality: { going_first: "neutral", going_second: "desirable" },
    });
    expect(taxonomy.opening_quality).toEqual({
      going_first: "neutral",
      going_second: "desirable",
    });
  });

  it("keeps neutral distinct from unclassified in storage", () => {
    const neutral = normalizeTaxonomy({
      roles: [],
      opening_quality: { going_first: "neutral", going_second: null },
    });
    expect(neutral.opening_quality.going_first).toBe("neutral");
    expect(neutral.opening_quality.going_second).toBeNull();
  });

  it("selects the context-dependent quality via openingQualityForTurn", () => {
    const cq = tax({ going_first: "undesirable", going_second: "desirable" });
    expect(openingQualityForTurn(cq, "going_first")).toBe("undesirable");
    expect(openingQualityForTurn(cq, "going_second")).toBe("desirable");
  });

  it("migrates a legacy scalar opening quality to both contexts", () => {
    expect(
      normalizeTaxonomy({ roles: [], opening_quality: "undesirable" }),
    ).toEqual({
      roles: [],
      opening_quality: { going_first: "undesirable", going_second: "undesirable" },
    });
    expect(normalizeTaxonomy({ roles: [], opening_quality: null })).toEqual({
      roles: [],
      opening_quality: { going_first: null, going_second: null },
    });
  });

  it("merges taxonomies preferring explicit quality per context", () => {
    const a = normalizeTaxonomy({
      roles: ["starter"],
      opening_quality: { going_first: "desirable", going_second: null },
    });
    const b = normalizeTaxonomy({
      roles: ["extender"],
      opening_quality: { going_first: null, going_second: "neutral" },
    });
    const merged = mergeTaxonomies(a, b);
    expect(merged.roles).toEqual(["starter", "extender"]);
    expect(merged.opening_quality).toEqual({
      going_first: "desirable",
      going_second: "neutral",
    });
  });
});

describe("contextual quality density", () => {
  it("counts per-context quality slots summing to deck size", () => {
    const cards = [
      card(1, 3, tax({ going_first: "desirable", going_second: "neutral" })),
      card(2, 2, tax({ going_first: null, going_second: "undesirable" })),
    ];
    const gf = openingQualityDensity(cards, "going_first");
    const gs = openingQualityDensity(cards, "going_second");
    expect(gf).toEqual({ desirable: 3, neutral: 0, undesirable: 0, unclassified: 2 });
    expect(gs).toEqual({ desirable: 0, neutral: 3, undesirable: 2, unclassified: 0 });
    expect(
      gf.desirable + gf.neutral + gf.undesirable + gf.unclassified,
    ).toBe(5);
  });

  it("counts copies for a contextual quality", () => {
    const cards = [
      card(1, 3, tax({ going_first: "undesirable", going_second: "desirable" })),
      card(2, 2, tax({ going_first: "undesirable", going_second: null })),
    ];
    expect(copiesForOpeningQuality(cards, "going_first", "undesirable")).toBe(5);
    expect(copiesForOpeningQuality(cards, "going_second", "undesirable")).toBe(0);
    expect(copiesForOpeningQuality(cards, "going_second", null)).toBe(2);
  });
});