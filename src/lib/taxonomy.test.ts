import { describe, expect, it } from "vitest";
import {
  addRole,
  copiesForOpeningQuality,
  isRole,
  migrateLegacyRoles,
  normalizeTaxonomy,
  openingQualityDensity,
  removeRole,
  roleDensity,
  uniqueRoles,
} from "./taxonomy";
import {
  createDocument,
  parseMappingJson,
  serializeMapping,
  setCardOpeningQuality,
  setCardRoles,
  setCardTaxonomy,
} from "./document";

describe("Taxonomy v0 roles", () => {
  it("assigns starter", () => {
    expect(uniqueRoles(["starter"])).toEqual(["starter"]);
  });

  it("assigns extender", () => {
    expect(uniqueRoles(["extender"])).toEqual(["extender"]);
  });

  it("assigns interaction", () => {
    expect(uniqueRoles(["interaction"])).toEqual(["interaction"]);
  });

  it("allows multiple roles to coexist", () => {
    expect(uniqueRoles(["starter", "extender", "interaction"])).toEqual([
      "starter",
      "extender",
      "interaction",
    ]);
  });

  it("rejects duplicate roles", () => {
    expect(uniqueRoles(["starter", "starter", "extender"])).toEqual([
      "starter",
      "extender",
    ]);
    expect(addRole(["starter"], "starter")).toEqual(["starter"]);
  });

  it("rejects removed roles from the current schema", () => {
    expect(isRole("recovery")).toBe(false);
    expect(isRole("brick")).toBe(false);
    expect(isRole("engine_requirement")).toBe(false);
    expect(uniqueRoles(["starter", "recovery", "brick", "engine_requirement"])).toEqual(
      ["starter"],
    );
    expect(() =>
      normalizeTaxonomy({
        roles: ["starter"],
        opening_quality: "brick",
      }),
    ).toThrow(/opening_quality/);
  });

  it("adds and removes without dropping other roles", () => {
    const roles = addRole(["starter"], "interaction");
    expect(roles).toEqual(["starter", "interaction"]);
    expect(removeRole(roles, "starter")).toEqual(["interaction"]);
  });
});

describe("Taxonomy v0 opening quality", () => {
  it("accepts desirable", () => {
    expect(normalizeTaxonomy({ roles: [], opening_quality: "desirable" })).toEqual({
      roles: [],
      opening_quality: "desirable",
    });
  });

  it("accepts neutral", () => {
    expect(normalizeTaxonomy({ roles: [], opening_quality: "neutral" })).toEqual({
      roles: [],
      opening_quality: "neutral",
    });
  });

  it("accepts undesirable", () => {
    expect(
      normalizeTaxonomy({ roles: [], opening_quality: "undesirable" }),
    ).toEqual({
      roles: [],
      opening_quality: "undesirable",
    });
  });

  it("accepts null unclassified", () => {
    expect(normalizeTaxonomy({ roles: [], opening_quality: null })).toEqual({
      roles: [],
      opening_quality: null,
    });
  });

  it("only allows one opening quality value", () => {
    const doc = setCardOpeningQuality(
      setCardOpeningQuality(createDocument("t"), "main", 1, "desirable"),
      "main",
      1,
      "undesirable",
    );
    expect(doc.main[0]?.taxonomy.opening_quality).toBe("undesirable");
  });

  it("keeps null and neutral distinguishable after serialization", () => {
    let doc = createDocument("t");
    doc = setCardTaxonomy(doc, "main", 1, {
      roles: ["starter"],
      opening_quality: null,
    });
    doc = setCardTaxonomy(doc, "main", 2, {
      roles: [],
      opening_quality: "neutral",
    });
    const json = serializeMapping(doc);
    const parsed = JSON.parse(json) as {
      main: { taxonomy: { opening_quality: unknown } }[];
    };
    expect(parsed.main[0]?.taxonomy.opening_quality).toBeNull();
    expect(parsed.main[1]?.taxonomy.opening_quality).toBe("neutral");
    const restored = parseMappingJson(json);
    expect(restored.main[0]?.taxonomy.opening_quality).toBeNull();
    expect(restored.main[1]?.taxonomy.opening_quality).toBe("neutral");
  });
});

describe("Taxonomy v0 deck context and density", () => {
  it("stores taxonomy on deck cards, not a global card definition", () => {
    let doc = createDocument("A");
    doc = setCardRoles(doc, "main", 100, ["starter"]);
    let other = createDocument("B");
    other = setCardRoles(other, "main", 100, ["interaction"]);
    other = setCardOpeningQuality(other, "main", 100, "undesirable");
    expect(doc.main[0]?.taxonomy).toEqual({
      roles: ["starter"],
      opening_quality: null,
    });
    expect(other.main[0]?.taxonomy).toEqual({
      roles: ["interaction"],
      opening_quality: "undesirable",
    });
    expect(doc).not.toHaveProperty("card_definitions");
  });

  it("counts overlapping role slots from quantities", () => {
    const density = roleDensity([
      {
        quantity: 3,
        taxonomy: { roles: ["starter", "extender"], opening_quality: null },
      },
      {
        quantity: 2,
        taxonomy: { roles: ["extender", "interaction"], opening_quality: null },
      },
      { quantity: 1, taxonomy: { roles: [], opening_quality: null } },
    ]);
    expect(density).toEqual({
      starter: 3,
      extender: 5,
      interaction: 2,
    });
    expect(density.starter + density.extender + density.interaction).toBeGreaterThan(
      6,
    );
  });

  it("counts mutually exclusive opening-quality slots", () => {
    const density = openingQualityDensity([
      {
        quantity: 3,
        taxonomy: { roles: ["starter"], opening_quality: "desirable" },
      },
      {
        quantity: 2,
        taxonomy: { roles: [], opening_quality: "neutral" },
      },
      {
        quantity: 1,
        taxonomy: { roles: ["interaction"], opening_quality: "undesirable" },
      },
      { quantity: 4, taxonomy: { roles: [], opening_quality: null } },
    ]);
    expect(density).toEqual({
      desirable: 3,
      neutral: 2,
      undesirable: 1,
      unclassified: 4,
    });
    expect(
      density.desirable +
        density.neutral +
        density.undesirable +
        density.unclassified,
    ).toBe(10);
    expect(copiesForOpeningQuality(
      [
        {
          quantity: 4,
          taxonomy: { roles: [], opening_quality: null },
        },
      ],
      null,
    )).toBe(4);
  });

  it("round-trips taxonomy through serialization", () => {
    let doc = createDocument("round");
    doc = setCardTaxonomy(doc, "main", 7, {
      roles: ["starter", "extender"],
      opening_quality: "desirable",
    });
    const restored = parseMappingJson(serializeMapping(doc));
    expect(restored.schema_version).toBe(3);
    expect(restored.main[0]?.taxonomy).toEqual({
      roles: ["starter", "extender"],
      opening_quality: "desirable",
    });
  });

  it("migrates legacy brick to undesirable and drops removed roles", () => {
    expect(
      migrateLegacyRoles([
        "starter",
        "brick",
        "recovery",
        "engine_requirement",
        "extender",
      ]),
    ).toEqual({
      roles: ["starter", "extender"],
      opening_quality: "undesirable",
    });

    const migrated = parseMappingJson(
      JSON.stringify({
        schema_version: 1,
        name: "legacy",
        vocabulary: [
          "starter",
          "extender",
          "interaction",
          "recovery",
          "brick",
          "engine_requirement",
        ],
        main: [
          {
            card_id: 1,
            quantity: 2,
            roles: ["starter", "recovery", "brick"],
          },
          {
            card_id: 2,
            quantity: 1,
            roles: ["engine_requirement"],
          },
        ],
        extra: [],
        side: [],
        analysis: { opening_hand_size: 5 },
      }),
    );
    expect(migrated.schema_version).toBe(3);
    expect(migrated).not.toHaveProperty("vocabulary");
    expect(migrated.main[0]?.taxonomy).toEqual({
      roles: ["starter"],
      opening_quality: "undesirable",
    });
    expect(migrated.main[1]?.taxonomy).toEqual({
      roles: [],
      opening_quality: null,
    });
  });
});
