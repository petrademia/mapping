import { describe, expect, it } from "vitest";
import { brandedDemo } from "../data/brandedDemo";
import {
  createDocument,
  parseMappingJson,
  serializeMapping,
  setCardRoles,
  setCardTaxonomy,
  setQuantity,
} from "./document";
import { parseYdk } from "./ydk";
import { exportYapping, serializeYapping } from "./exportYapping";

describe("import/export", () => {
  it("round-trips a MAPPING document", () => {
    const original = setCardTaxonomy(brandedDemo, "main", 62962630, {
      roles: ["starter", "extender"],
      opening_quality: "desirable",
    });
    const restored = parseMappingJson(serializeMapping(original));
    expect(restored).toEqual(original);
  });

  it("keeps multi-role labels through serialization", () => {
    const json = serializeMapping(
      setCardRoles(createDocument("Test"), "main", 1, ["starter", "extender"]),
    );
    expect(JSON.parse(json).main[0].taxonomy.roles).toEqual([
      "starter",
      "extender",
    ]);
    expect(JSON.parse(json).main[0].taxonomy.opening_quality).toBeNull();
  });

  it("keeps quantities through serialization", () => {
    let doc = createDocument("Test");
    doc = {
      ...doc,
      main: [
        {
          card_id: 7,
          quantity: 1,
          taxonomy: { roles: [], opening_quality: null },
        },
      ],
    };
    doc = setQuantity(doc, "main", 7, 3);
    expect(parseMappingJson(serializeMapping(doc)).main[0]?.quantity).toBe(3);
  });

  it("keeps main, extra, and side distinct", () => {
    const doc = parseMappingJson(
      serializeMapping({
        ...createDocument("Split"),
        main: [
          {
            card_id: 1,
            quantity: 3,
            taxonomy: { roles: ["starter"], opening_quality: null },
          },
        ],
        extra: [
          {
            card_id: 2,
            quantity: 1,
            taxonomy: { roles: ["extender"], opening_quality: null },
          },
        ],
        side: [
          {
            card_id: 3,
            quantity: 2,
            taxonomy: { roles: ["interaction"], opening_quality: null },
          },
        ],
      }),
    );
    expect(doc.main.map((card) => card.card_id)).toEqual([1]);
    expect(doc.extra.map((card) => card.card_id)).toEqual([2]);
    expect(doc.side.map((card) => card.card_id)).toEqual([3]);
  });

  it("emits the YAPPING archetype fields load_archetype expects", () => {
    const exported = exportYapping(
      setCardRoles(brandedDemo, "main", 62962630, ["starter", "extender"]),
    );
    expect(exported.name).toBe("branded_albaz_v1");
    expect(exported.main_deck.filter((id) => id === 62962630)).toHaveLength(3);
    expect(exported.extra_deck).toContain(44146295);
    expect(exported.card_roles["62962630"]).toEqual(["starter", "extender"]);
    expect(exported.card_roles["55273560"]).toEqual(["starter", "extender"]);
    expect(exported.metadata.card_opening_quality["68468459"]).toBe(
      "undesirable",
    );
    expect(exported).not.toHaveProperty("interruption_specs");
    expect(exported).not.toHaveProperty("fixtures");
    expect(exported.metadata.source).toBe("mapping");
    expect(exported.metadata.mapping_schema_version).toBe(2);
    expect(exported.metadata.opening_hand_size).toBe(5);
    expect(exported.metadata.deck_size).toBe(exported.main_deck.length);
    expect(JSON.parse(serializeYapping(brandedDemo)).card_roles).toBeTypeOf(
      "object",
    );
  });

  it("parses YDK main/extra/side quantities", () => {
    const parsed = parseYdk(`#created by mapping
#main
62962630
62962630
62962630
44362883
#extra
44146295
44146295
!side
10045474
`);
    expect(parsed.main).toEqual([
      { card_id: 62962630, quantity: 3 },
      { card_id: 44362883, quantity: 1 },
    ]);
    expect(parsed.extra).toEqual([{ card_id: 44146295, quantity: 2 }]);
    expect(parsed.side).toEqual([{ card_id: 10045474, quantity: 1 }]);
  });

  it("coerces a blank name instead of dropping the document", () => {
    const parsed = parseMappingJson(
      JSON.stringify({
        schema_version: 2,
        name: "   ",
        main: [
          {
            card_id: 1,
            quantity: 1,
            taxonomy: { roles: ["starter"], opening_quality: null },
          },
        ],
        extra: [],
        side: [],
        analysis: { opening_hand_size: 5 },
      }),
    );
    expect(parsed.name).toBe("untitled");
    expect(parsed.main[0]?.card_id).toBe(1);
  });

  it("collapses duplicate card ids in a section", () => {
    const parsed = parseMappingJson(
      JSON.stringify({
        schema_version: 2,
        name: "dup",
        main: [
          {
            card_id: 1,
            quantity: 2,
            taxonomy: { roles: ["starter"], opening_quality: null },
          },
          {
            card_id: 1,
            quantity: 1,
            taxonomy: { roles: ["extender"], opening_quality: "neutral" },
          },
        ],
        extra: [],
        side: [],
        analysis: { opening_hand_size: 5 },
      }),
    );
    expect(parsed.main).toEqual([
      {
        card_id: 1,
        quantity: 3,
        taxonomy: { roles: ["starter", "extender"], opening_quality: "neutral" },
      },
    ]);
  });

  it("does not treat quantity 0 as card removal", () => {
    const doc = setQuantity(createDocument("Test"), "main", 7, 2);
    expect(() => setQuantity(doc, "main", 7, 0)).toThrow(/quantity/);
    expect(doc.main[0]?.quantity).toBe(2);
  });
});
