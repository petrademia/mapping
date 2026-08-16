import { describe, expect, it } from "vitest";
import { powerPatronArsMagnaDemo } from "../data/powerPatronArsMagnaDemo";
import {
  createDocument,
  parseMappingJson,
  sectionSize,
  serializeMapping,
  setCardRoles,
  setCardTaxonomy,
  setQuantity,
} from "./document";
import { parseYdk, serializeYdk } from "./ydk";
import { exportYapping, serializeYapping } from "./exportYapping";

describe("import/export", () => {
  it("round-trips a MAPPING document", () => {
    const original = setCardTaxonomy(powerPatronArsMagnaDemo, "main", 70488851, {
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
      setCardRoles(powerPatronArsMagnaDemo, "main", 70488851, [
        "starter",
        "extender",
      ]),
    );
    expect(exported.name).toBe("power_patron_ars_magna_v0");
    expect(exported.main_deck.filter((id) => id === 70488851)).toHaveLength(3);
    expect(exported.extra_deck).toContain(4063756);
    expect(exported.card_roles["70488851"]).toEqual(["starter", "extender"]);
    expect(exported.card_roles["97556336"]).toEqual(["starter"]);
    expect(exported.metadata.card_opening_quality["17473466"]).toBe("neutral");
    expect(exported).not.toHaveProperty("interruption_specs");
    expect(exported).not.toHaveProperty("fixtures");
    expect(exported.metadata.source).toBe("mapping");
    expect(exported.metadata.mapping_schema_version).toBe(3);
    expect(exported.metadata.opening_hand_size).toBe(5);
    expect(exported.metadata.deck_size).toBe(exported.main_deck.length);
    expect(exported.metadata.deck_size).toBe(
      sectionSize(powerPatronArsMagnaDemo.main),
    );
    expect(
      JSON.parse(serializeYapping(powerPatronArsMagnaDemo)).card_roles,
    ).toBeTypeOf("object");
  });

  it("parses YDK main/extra/side quantities", () => {
    const parsed = parseYdk(`#created by mapping
#main
70488851
70488851
70488851
26237713
#extra
4063756
4063756
!side
14558129
`);
    expect(parsed.main).toEqual([
      { card_id: 70488851, quantity: 3 },
      { card_id: 26237713, quantity: 1 },
    ]);
    expect(parsed.extra).toEqual([{ card_id: 4063756, quantity: 2 }]);
    expect(parsed.side).toEqual([{ card_id: 14558129, quantity: 1 }]);
  });

  it("serializes YDK with expanded copies and empty section headers", () => {
    const text = serializeYdk({
      main: [
        { card_id: 70488851, quantity: 3 },
        { card_id: 26237713, quantity: 1 },
      ],
      extra: [{ card_id: 4063756, quantity: 2 }],
      side: [],
    });
    expect(text).toBe(`#created by mapping
#main
70488851
70488851
70488851
26237713
#extra
4063756
4063756
!side
`);
    expect(parseYdk(text)).toEqual({
      main: [
        { card_id: 70488851, quantity: 3 },
        { card_id: 26237713, quantity: 1 },
      ],
      extra: [{ card_id: 4063756, quantity: 2 }],
      side: [],
    });
  });

  it("coerces a blank name instead of dropping the document", () => {
    const parsed = parseMappingJson(
      JSON.stringify({
        schema_version: 3,
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
        schema_version: 3,
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
        taxonomy: {
          roles: ["starter", "extender"],
          opening_quality: "neutral",
        },
      },
    ]);
  });

  it("does not treat quantity 0 as card removal", () => {
    const doc = setQuantity(createDocument("Test"), "main", 7, 2);
    expect(() => setQuantity(doc, "main", 7, 0)).toThrow(/quantity/);
    expect(doc.main[0]?.quantity).toBe(2);
  });
});
