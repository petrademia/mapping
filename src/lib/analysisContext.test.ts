import { describe, expect, it } from "vitest";
import {
  analysisContextFromPreset,
  analysisContextPreset,
  normalizeAnalysisContext,
  observedCards,
} from "./analysisContext";
import {
  createDocument,
  parseMappingJson,
  serializeMapping,
  setAnalysisContext,
  setOpeningHandSize,
} from "./document";
import {
  combinations,
  openingAtLeastProbability,
} from "./probability";
import { summarizeHandConditions } from "./handExplorer";
import type { MappingCard } from "./document";
import type { CardTaxonomy } from "./taxonomy";

function tax(roles: CardTaxonomy["roles"] = []): CardTaxonomy {
  return { roles, opening_quality: { going_first: null, going_second: null } };
}

function card(
  card_id: number,
  quantity: number,
  roles: CardTaxonomy["roles"] = [],
): MappingCard {
  return { card_id, quantity, taxonomy: tax(roles) };
}

describe("analysis context sample sizes", () => {
  it("maps going first + opening hand to 5", () => {
    expect(
      observedCards(
        { turn_order: "going_first", observation_point: "opening_hand" },
        5,
      ),
    ).toBe(5);
  });

  it("maps going second + opening hand to 5", () => {
    expect(
      observedCards(
        { turn_order: "going_second", observation_point: "opening_hand" },
        5,
      ),
    ).toBe(5);
  });

  it("maps going second + first turn to 6", () => {
    expect(
      observedCards(
        { turn_order: "going_second", observation_point: "first_turn" },
        5,
      ),
    ).toBe(6);
  });

  it("coerces invalid going_first + first_turn to opening hand", () => {
    const normalized = normalizeAnalysisContext({
      turn_order: "going_first",
      observation_point: "first_turn",
    });
    expect(normalized).toEqual({
      turn_order: "going_first",
      observation_point: "opening_hand",
    });
    expect(observedCards(normalized, 5)).toBe(5);
  });

  it("respects custom opening-hand size", () => {
    expect(
      observedCards(
        { turn_order: "going_second", observation_point: "first_turn" },
        4,
      ),
    ).toBe(5);
  });
});

describe("analysis context probabilities", () => {
  const main = [card(1, 3), card(2, 37)];

  it("keeps identical initial-5 probability going first and second", () => {
    const condition = {
      id: "x",
      name: "X",
      requirements: [
        { kind: "card" as const, card_id: 1, op: "gte" as const, count: 1 },
      ],
    };
    const gf = summarizeHandConditions(
      main,
      observedCards(
        { turn_order: "going_first", observation_point: "opening_hand" },
        5,
      ),
      [condition],
      ["x"],
    );
    const gs = summarizeHandConditions(
      main,
      observedCards(
        { turn_order: "going_second", observation_point: "opening_hand" },
        5,
      ),
      [condition],
      ["x"],
    );
    expect(gf.anyAccess).toBeCloseTo(gs.anyAccess, 12);
    expect(gf.anyAccess).toBeCloseTo(openingAtLeastProbability(40, 3, 5, 1), 12);
  });

  it("changes probability correctly from 5 to 6 cards for a card condition", () => {
    const condition = {
      id: "x",
      name: "X",
      requirements: [
        { kind: "card" as const, card_id: 1, op: "gte" as const, count: 1 },
      ],
    };
    const p5 = summarizeHandConditions(main, 5, [condition], ["x"]).anyAccess;
    const p6 = summarizeHandConditions(main, 6, [condition], ["x"]).anyAccess;
    expect(p5).toBeCloseTo(openingAtLeastProbability(40, 3, 5, 1), 12);
    expect(p6).toBeCloseTo(openingAtLeastProbability(40, 3, 6, 1), 12);
    expect(p6).toBeGreaterThan(p5);
    expect(p5).toBeCloseTo(1 - Number(combinations(37, 5)) / Number(combinations(40, 5)), 10);
    expect(p6).toBeCloseTo(1 - Number(combinations(37, 6)) / Number(combinations(40, 6)), 10);
  });

  it("applies sample size to role conditions and overlapping roles", () => {
    const deck = [card(1, 3, ["starter", "extender"]), card(2, 37)];
    const conditions = [
      {
        id: "s",
        name: "starter",
        requirements: [
          { kind: "role" as const, role: "starter" as const, op: "gte" as const, count: 1 },
        ],
      },
      {
        id: "e",
        name: "extender",
        requirements: [
          {
            kind: "role" as const,
            role: "extender" as const,
            op: "gte" as const,
            count: 1,
          },
        ],
      },
    ];
    const at5 = summarizeHandConditions(deck, 5, conditions, ["s", "e"]);
    const at6 = summarizeHandConditions(deck, 6, conditions, ["s", "e"]);
    expect(at5.conditions[0]!.probability).toBeCloseTo(
      at5.conditions[1]!.probability,
      12,
    );
    expect(at5.anyAccess).toBeCloseTo(at5.conditions[0]!.probability, 12);
    expect(at6.anyAccess).toBeGreaterThan(at5.anyAccess);
  });

  it("applies sample size to access-condition unions without double counting", () => {
    const deck = [card(50, 3, ["starter"]), card(99, 37)];
    const conditions = [
      {
        id: "a",
        name: "card",
        requirements: [
          { kind: "card" as const, card_id: 50, op: "gte" as const, count: 1 },
        ],
      },
      {
        id: "b",
        name: "role",
        requirements: [
          { kind: "role" as const, role: "starter" as const, op: "gte" as const, count: 1 },
        ],
      },
    ];
    const at5 = summarizeHandConditions(deck, 5, conditions, ["a", "b"]);
    const at6 = summarizeHandConditions(deck, 6, conditions, ["a", "b"]);
    expect(at5.anyAccess).toBeCloseTo(at5.conditions[0]!.probability, 12);
    expect(at6.anyAccess).toBeCloseTo(at6.conditions[0]!.probability, 12);
    expect(at6.anyAccess).toBeGreaterThan(at5.anyAccess);
  });
});

describe("analysis context persistence", () => {
  it("round-trips analysis context through serialization", () => {
    let doc = createDocument("ctx");
    doc = setOpeningHandSize(doc, 5);
    doc = setAnalysisContext(doc, {
      turn_order: "going_second",
      observation_point: "first_turn",
    });
    const restored = parseMappingJson(serializeMapping(doc));
    expect(restored.analysis).toEqual({
      opening_hand_size: 5,
      turn_order: "going_second",
      observation_point: "first_turn",
    });
  });

  it("defaults missing context fields on load", () => {
    const restored = parseMappingJson(
      JSON.stringify({
        schema_version: 3,
        name: "legacy",
        main: [],
        extra: [],
        side: [],
        analysis: { opening_hand_size: 5 },
      }),
    );
    expect(restored.analysis.turn_order).toBe("going_first");
    expect(restored.analysis.observation_point).toBe("opening_hand");
  });

  it("maps presets bidirectionally", () => {
    expect(
      analysisContextPreset(
        analysisContextFromPreset("going_second_first_turn"),
      ),
    ).toBe("going_second_first_turn");
    expect(
      analysisContextPreset(analysisContextFromPreset("going_first_opening")),
    ).toBe("going_first_opening");
  });
});
