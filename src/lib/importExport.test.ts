import { describe, expect, it } from "vitest";
import { powerPatronArsMagnaDemo } from "../data/powerPatronArsMagnaDemo";
import {
  addFromParsed,
  createDocument,
  parseMappingJson,
  SCHEMA_VERSION,
  sectionSize,
  serializeMapping,
  setCardRoles,
  setCardTaxonomy,
  setQuantity,
} from "./document";
import { parseDeckText, parseYdk, serializeYdk } from "./ydk";
import { exportYapping, serializeYapping } from "./exportYapping";

describe("import/export", () => {
  it("round-trips a MAPPING document", () => {
    const original = setCardTaxonomy(powerPatronArsMagnaDemo, "main", 70488851, {
      roles: ["starter", "extender"],
      opening_quality: { going_first: "desirable", going_second: "desirable" },
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
    expect(JSON.parse(json).main[0].taxonomy.opening_quality).toEqual({
      going_first: null,
      going_second: null,
    });
  });

  it("keeps quantities through serialization", () => {
    let doc = createDocument("Test");
    doc = {
      ...doc,
      main: [
        {
          card_id: 7,
          quantity: 1,
          taxonomy: {
            roles: [],
            opening_quality: { going_first: null, going_second: null },
          },
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
            taxonomy: {
              roles: ["starter"],
              opening_quality: { going_first: null, going_second: null },
            },
          },
        ],
        extra: [
          {
            card_id: 2,
            quantity: 1,
            taxonomy: {
              roles: ["extender"],
              opening_quality: { going_first: null, going_second: null },
            },
          },
        ],
        side: [
          {
            card_id: 3,
            quantity: 2,
            taxonomy: {
              roles: ["interaction"],
              opening_quality: { going_first: null, going_second: null },
            },
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
    expect(
      exported.metadata.card_opening_quality.going_first["17473466"],
    ).toBe("neutral");
    expect(
      exported.metadata.card_opening_quality.going_second["17473466"],
    ).toBe("neutral");
    expect(exported).not.toHaveProperty("interruption_specs");
    expect(exported).not.toHaveProperty("fixtures");
    expect(exported.metadata.source).toBe("mapping");
    expect(exported.metadata.mapping_schema_version).toBe(SCHEMA_VERSION);
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
            taxonomy: {
              roles: ["starter"],
              opening_quality: { going_first: null, going_second: null },
            },
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
          opening_quality: { going_first: "neutral", going_second: "neutral" },
        },
      },
    ]);
  });

  it("migrates schema v3 scalar opening_quality to both contexts", () => {
    const parsed = parseMappingJson(
      JSON.stringify({
        schema_version: 3,
        name: "legacy-quality",
        main: [
          {
            card_id: 1,
            quantity: 2,
            taxonomy: { roles: ["starter"], opening_quality: "undesirable" },
          },
          {
            card_id: 2,
            quantity: 1,
            taxonomy: { roles: [], opening_quality: null },
          },
        ],
        extra: [],
        side: [],
        analysis: { opening_hand_size: 5 },
      }),
    );
    expect(parsed.schema_version).toBe(SCHEMA_VERSION);
    expect(parsed.main[0]?.taxonomy.opening_quality).toEqual({
      going_first: "undesirable",
      going_second: "undesirable",
    });
    expect(parsed.main[1]?.taxonomy.opening_quality).toEqual({
      going_first: null,
      going_second: null,
    });
  });

  it("rejects unsupported schema versions", () => {
    expect(() =>
      parseMappingJson(
        JSON.stringify({ schema_version: 99, name: "x", main: [], extra: [], side: [] }),
      ),
    ).toThrow(/schema_version/);
  });

  it("does not treat quantity 0 as card removal", () => {
    const doc = setQuantity(createDocument("Test"), "main", 7, 2);
    expect(() => setQuantity(doc, "main", 7, 0)).toThrow(/quantity/);
    expect(doc.main[0]?.quantity).toBe(2);
  });

  it("parseDeckText uses defaultSection when headers are absent", () => {
    expect(parseDeckText("7 2\n8", "extra")).toEqual({
      main: [],
      extra: [
        { card_id: 7, quantity: 2 },
        { card_id: 8, quantity: 1 },
      ],
      side: [],
    });
  });

  it("addFromParsed appends without wiping taxonomy", () => {
    let doc = createDocument("t");
    doc = setCardRoles(doc, "main", 1, ["starter"]);
    doc = addFromParsed(doc, {
      main: [{ card_id: 1, quantity: 2 }],
      extra: [{ card_id: 9, quantity: 1 }],
      side: [],
    });
    expect(doc.main).toEqual([
      {
        card_id: 1,
        quantity: 3,
        taxonomy: {
          roles: ["starter"],
          opening_quality: { going_first: null, going_second: null },
        },
      },
    ]);
    expect(doc.extra).toEqual([
      {
        card_id: 9,
        quantity: 1,
        taxonomy: {
          roles: [],
          opening_quality: { going_first: null, going_second: null },
        },
      },
    ]);
  });
});
