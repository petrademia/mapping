import { describe, expect, it } from "vitest";
import {
  addRole,
  copiesForOpeningQuality,
  EMPTY_CONTEXTUAL_QUALITY,
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
  setCardContextualOpeningQuality,
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
    expect(
      normalizeTaxonomy({
        roles: [],
        opening_quality: { going_first: "desirable", going_second: "desirable" },
      }),
    ).toEqual({
      roles: [],
      opening_quality: {
        going_first: "desirable",
        going_second: "desirable",
      },
    });
  });

  it("accepts neutral in a single context", () => {
    expect(
      normalizeTaxonomy({
        roles: [],
        opening_quality: { going_first: "neutral", going_second: null },
      }),
    ).toEqual({
      roles: [],
      opening_quality: { going_first: "neutral", going_second: null },
    });
  });

  it("accepts undesirable", () => {
    expect(
      normalizeTaxonomy({
        roles: [],
        opening_quality: {
          going_first: "undesirable",
          going_second: "undesirable",
        },
      }),
    ).toEqual({
      roles: [],
      opening_quality: {
        going_first: "undesirable",
        going_second: "undesirable",
      },
    });
  });

  it("accepts null unclassified", () => {
    expect(
      normalizeTaxonomy({
        roles: [],
        opening_quality: { going_first: null, going_second: null },
      }),
    ).toEqual({
      roles: [],
      opening_quality: { going_first: null, going_second: null },
    });
  });

  it("allows different quality per context and updates one independently", () => {
    let doc = setCardContextualOpeningQuality(
      setCardContextualOpeningQuality(createDocument("t"), "main", 1, "going_first", "desirable"),
      "main",
      1,
      "going_second",
      "undesirable",
    );
    expect(doc.main[0]?.taxonomy.opening_quality).toEqual({
      going_first: "desirable",
      going_second: "undesirable",
    });
  });

  it("keeps null and neutral distinguishable after serialization", () => {
    let doc = createDocument("t");
    doc = setCardTaxonomy(doc, "main", 1, {
      roles: ["starter"],
      opening_quality: { going_first: null, going_second: null },
    });
    doc = setCardTaxonomy(doc, "main", 2, {
      roles: [],
      opening_quality: { going_first: "neutral", going_second: null },
    });
    const json = serializeMapping(doc);
    const parsed = JSON.parse(json) as {
      main: { taxonomy: { opening_quality: unknown } }[];
    };
    expect(parsed.main[0]?.taxonomy.opening_quality).toEqual({
      going_first: null,
      going_second: null,
    });
    expect(parsed.main[1]?.taxonomy.opening_quality).toEqual({
      going_first: "neutral",
      going_second: null,
    });
    const restored = parseMappingJson(json);
    expect(restored.main[0]?.taxonomy.opening_quality).toEqual({
      going_first: null,
      going_second: null,
    });
    expect(restored.main[1]?.taxonomy.opening_quality).toEqual({
      going_first: "neutral",
      going_second: null,
    });
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
      opening_quality: { going_first: null, going_second: null },
    });
    expect(other.main[0]?.taxonomy).toEqual({
      roles: ["interaction"],
      opening_quality: {
        going_first: "undesirable",
        going_second: "undesirable",
      },
    });
    expect(doc).not.toHaveProperty("card_definitions");
  });

  it("counts overlapping role slots from quantities", () => {
    const density = roleDensity([
      {
        quantity: 3,
        taxonomy: {
          roles: ["starter", "extender"],
          opening_quality: EMPTY_CONTEXTUAL_QUALITY,
        },
      },
      {
        quantity: 2,
        taxonomy: {
          roles: ["extender", "interaction"],
          opening_quality: EMPTY_CONTEXTUAL_QUALITY,
        },
      },
      {
        quantity: 1,
        taxonomy: { roles: [], opening_quality: EMPTY_CONTEXTUAL_QUALITY },
      },
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

  it("counts mutually exclusive opening-quality slots per context", () => {
    const gf = openingQualityDensity(
      [
        {
          quantity: 3,
          taxonomy: {
            roles: ["starter"],
            opening_quality: { going_first: "desirable", going_second: null },
          },
        },
        {
          quantity: 2,
          taxonomy: {
            roles: [],
            opening_quality: { going_first: "neutral", going_second: "desirable" },
          },
        },
        {
          quantity: 1,
          taxonomy: {
            roles: ["interaction"],
            opening_quality: {
              going_first: "undesirable",
              going_second: "undesirable",
            },
          },
        },
        { quantity: 4, taxonomy: { roles: [], opening_quality: EMPTY_CONTEXTUAL_QUALITY } },
      ],
      "going_first",
    );
    expect(gf).toEqual({
      desirable: 3,
      neutral: 2,
      undesirable: 1,
      unclassified: 4,
    });
    expect(
      gf.desirable + gf.neutral + gf.undesirable + gf.unclassified,
    ).toBe(10);
    expect(
      copiesForOpeningQuality(
        [
          {
            quantity: 4,
            taxonomy: { roles: [], opening_quality: EMPTY_CONTEXTUAL_QUALITY },
          },
        ],
        "going_first",
        null,
      ),
    ).toBe(4);
  });

  it("round-trips taxonomy through serialization", () => {
    let doc = createDocument("round");
    doc = setCardTaxonomy(doc, "main", 7, {
      roles: ["starter", "extender"],
      opening_quality: { going_first: "desirable", going_second: null },
    });
    const restored = parseMappingJson(serializeMapping(doc));
    expect(restored.schema_version).toBe(5);
    expect(restored.main[0]?.taxonomy).toEqual({
      roles: ["starter", "extender"],
      opening_quality: { going_first: "desirable", going_second: null },
    });
  });

  it("migrates legacy brick to undesirable in both contexts and drops removed roles", () => {
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
      opening_quality: {
        going_first: "undesirable",
        going_second: "undesirable",
      },
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
    expect(migrated.schema_version).toBe(5);
    expect(migrated).not.toHaveProperty("vocabulary");
    expect(migrated.main[0]?.taxonomy).toEqual({
      roles: ["starter"],
      opening_quality: {
        going_first: "undesirable",
        going_second: "undesirable",
      },
    });
    expect(migrated.main[1]?.taxonomy).toEqual({
      roles: [],
      opening_quality: { going_first: null, going_second: null },
    });
  });
});
