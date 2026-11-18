import { describe, expect, it } from "vitest";
import { createDocument, parseMappingJson, serializeMapping, type MappingDocument } from "./document";
import { deriveLabels } from "./derivedLabels";
import { atLeastCopies, breakerCopies, DEFAULT_SETTINGS, scorecard, unmeasured, weakest, type Scorecard } from "./scorecard";
import type { Role } from "./taxonomy";

const tax = (roles: Role[]) => ({ roles, opening_quality: { going_first: null, going_second: null } });

/**
 * 10 cards: card 1 x4 is the route, card 2 x1 is a board breaker in both turn orders, card 3 x2 is a
 * board breaker only going second, card 4 x3 does nothing.
 */
function build(): MappingDocument {
  return {
    ...createDocument("t"),
    main: [
      { card_id: 1, quantity: 4, taxonomy: tax([]) },
      { card_id: 2, quantity: 1, taxonomy: tax(["breaker"]) },
      { card_id: 3, quantity: 2, taxonomy: tax(["breaker_second"]) },
      { card_id: 4, quantity: 3, taxonomy: tax([]) },
    ],
    hand_conditions: [
      { id: "c1", name: "c1", requirements: [{ kind: "card", card_id: 1, op: "gte", count: 1 }], excludes: [] },
    ],
    hand_condition_sets: [{ id: "g", name: "Goal", condition_ids: ["c1"], aggregation: "any" }],
  } as unknown as MappingDocument;
}

const only = { ...DEFAULT_SETTINGS, opens: 0, clean: 0, resilient: 0, interaction: 0, lingering: 0, breaking: 1 };

function ok(result: ReturnType<typeof scorecard>): Scorecard {
  if ("error" in result) throw new Error(result.error);
  return result;
}

describe("board breakers", () => {
  it("counts a both-turns breaker in both turn orders and a going-second one only going second", () => {
    expect(breakerCopies(build(), "going_first")).toBe(1);
    expect(breakerCopies(build(), "going_second")).toBe(3);
    const card = ok(scorecard(build(), "g", only));
    // Going first, five of ten, one usable breaker: 1 - C(9,5) / C(10,5) = 126 / 252.
    expect(card.first.breaking).toBeCloseTo(0.5, 12);
    // Going second, six of ten, three usable: 1 - C(7,6) / C(10,6) = 203 / 210.
    expect(card.second.breaking).toBeCloseTo(203 / 210, 12);
    expect(card.first.combined).toBeCloseTo(0.5, 12);
  });

  it("can ask for more than one breaker", () => {
    // Two of the three going second: k = 2: 3 * C(7,4) = 105, k = 3: C(7,3) = 35: 140 / 210.
    const two = ok(scorecard(build(), "g", { ...only, breakersNeeded: 2 }));
    expect(two.second.breaking).toBeCloseTo(140 / 210, 12);
    // Going first there is only one usable breaker, so two can never be held.
    expect(two.first.breaking).toBe(0);
    expect(atLeastCopies(10, 3, 6, 3)).toBeCloseTo(35 / 210, 12);
    expect(atLeastCopies(10, 3, 6, 0)).toBe(1);
    expect(atLeastCopies(10, 2, 6, 3)).toBe(0);
  });

  it("is null when no breaker works in that turn order", () => {
    const doc = build();
    doc.main = doc.main.map((c) => (c.card_id === 2 ? { ...c, taxonomy: tax([]) } : c));
    const card = ok(scorecard(doc, "g", only));
    expect(card.first.breaking).toBeNull();
    expect(card.second.breaking).toBeCloseTo(1 - 28 / 210, 12); // two going-second breakers, six cards: 1 - C(8,6)/C(10,6)
  });

  it("does not change the headline until it is given a weight, and is never the weakest part", () => {
    const withRoles = ok(scorecard(build(), "g", DEFAULT_SETTINGS));
    const plain = build();
    plain.main = plain.main.map((c) => ({ ...c, taxonomy: tax([]) }));
    const without = ok(scorecard(plain, "g", DEFAULT_SETTINGS));
    expect(DEFAULT_SETTINGS.breaking).toBe(0);
    expect(withRoles.first.combined).toBe(without.first.combined);
    expect(weakest(withRoles.first)?.key).not.toBe("breaking");
    expect(unmeasured(without.first)).not.toContain("breaking");
  });

  it("keeps a breaker from counting as a brick, and is saved with the card", () => {
    const labels = deriveLabels(build());
    expect(labels.get(2)?.brick).toBe(false);
    expect(labels.get(3)?.brick).toBe(false);
    expect(labels.get(4)?.brick).toBe(true);
    const back = parseMappingJson(serializeMapping(build()));
    expect(back.main.find((c) => c.card_id === 2)?.taxonomy.roles).toEqual(["breaker"]);
    expect(back.main.find((c) => c.card_id === 3)?.taxonomy.roles).toEqual(["breaker_second"]);
  });
});
