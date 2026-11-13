import { describe, expect, it } from "vitest";
import { createDocument, type MappingDocument } from "./document";
import { deriveLabels } from "./derivedLabels";
import { DEFAULT_SETTINGS, scorecard, unmeasured, weakest, type Scorecard } from "./scorecard";
import { parseMappingJson, serializeMapping } from "./document";
import type { Role } from "./taxonomy";

const tax = (roles: Role[]) => ({ roles, opening_quality: { going_first: null, going_second: null } });

/**
 * 10 cards: card 1 x4 is the route, card 2 x2 is a lingering handtrap that works in both turn
 * orders, card 3 x2 is a lingering handtrap that only works going second, card 4 x2 does nothing.
 */
function build(): MappingDocument {
  return {
    ...createDocument("t"),
    main: [
      { card_id: 1, quantity: 4, taxonomy: tax([]) },
      { card_id: 2, quantity: 2, taxonomy: tax(["lingering"]) },
      { card_id: 3, quantity: 2, taxonomy: tax(["lingering_second"]) },
      { card_id: 4, quantity: 2, taxonomy: tax([]) },
    ],
    hand_conditions: [
      { id: "c1", name: "c1", requirements: [{ kind: "card", card_id: 1, op: "gte", count: 1 }], excludes: [] },
    ],
    hand_condition_sets: [{ id: "g", name: "Goal", condition_ids: ["c1"], aggregation: "any" }],
  } as unknown as MappingDocument;
}

const only = { opens: 0, clean: 0, resilient: 0, interaction: 0, lingering: 1, first: 1, second: 1, brickTolerance: 1 };

function ok(result: ReturnType<typeof scorecard>): Scorecard {
  if ("error" in result) throw new Error(result.error);
  return result;
}

describe("lingering disruption", () => {
  it("counts a both-turns card in both turn orders and a going-second card only going second", () => {
    const card = ok(scorecard(build(), "g", only));
    // Going first, five of ten cards, two usable copies: 1 - C(8,5) / C(10,5) = 196 / 252.
    expect(card.first.lingering).toBeCloseTo(196 / 252, 12);
    // Going second, six of ten, four usable copies: 1 - C(6,6) / C(10,6) = 209 / 210.
    expect(card.second.lingering).toBeCloseTo(209 / 210, 12);
    // With only that weight set, the combined number is that number.
    expect(card.first.combined).toBeCloseTo(196 / 252, 12);
    expect(card.second.combined).toBeCloseTo(209 / 210, 12);
  });

  it("is null when no card is usable in that turn order", () => {
    const doc = build();
    doc.main = doc.main.map((c) => (c.card_id === 2 ? { ...c, taxonomy: tax([]) } : c));
    const card = ok(scorecard(doc, "g", only));
    expect(card.first.lingering).toBeNull();
    // Going second only the two going-second copies count: 1 - C(8,6) / C(10,6) = 182 / 210.
    expect(card.second.lingering).toBeCloseTo(182 / 210, 12);
  });

  it("does not change the headline until it is given a weight", () => {
    const withRoles = ok(scorecard(build(), "g", DEFAULT_SETTINGS));
    const without = build();
    without.main = without.main.map((c) => ({ ...c, taxonomy: tax([]) }));
    const plain = ok(scorecard(without, "g", DEFAULT_SETTINGS));
    expect(DEFAULT_SETTINGS.lingering).toBe(0);
    expect(withRoles.first.combined).toBe(plain.first.combined);
    expect(withRoles.second.combined).toBe(plain.second.combined);
  });

  it("is an extra: never the weakest part, never reported as not measured", () => {
    const card = ok(scorecard(build(), "g", DEFAULT_SETTINGS));
    expect(weakest(card.first)?.key).not.toBe("lingering");
    const bare = build();
    bare.main = bare.main.map((c) => ({ ...c, taxonomy: tax([]) }));
    expect(unmeasured(ok(scorecard(bare, "g", DEFAULT_SETTINGS)).first)).not.toContain("lingering");
  });

  it("keeps a lingering card from counting as a brick", () => {
    const labels = deriveLabels(build());
    expect(labels.get(2)?.brick).toBe(false);
    expect(labels.get(3)?.brick).toBe(false);
    expect(labels.get(4)?.brick).toBe(true);
  });

  it("is saved with the card and read back", () => {
    const back = parseMappingJson(serializeMapping(build()));
    expect(back.main.find((c) => c.card_id === 2)?.taxonomy.roles).toEqual(["lingering"]);
    expect(back.main.find((c) => c.card_id === 3)?.taxonomy.roles).toEqual(["lingering_second"]);
  });
});
