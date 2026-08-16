import { describe, expect, it } from "vitest";
import { combinations, openingAtLeastProbability } from "./probability";
import { computeDeckProfile, type DeckProfile } from "./deckProfile";
import type { MappingCard } from "./document";
import type { CardTaxonomy, ContextualOpeningQuality } from "./taxonomy";

function tax(cq: ContextualOpeningQuality): CardTaxonomy {
  return { roles: [], opening_quality: cq };
}

function card(
  card_id: number,
  quantity: number,
  cq: ContextualOpeningQuality,
  roles: CardTaxonomy["roles"] = [],
): MappingCard {
  return { card_id, quantity, taxonomy: { roles, opening_quality: cq } };
}

const GF: ContextualOpeningQuality = { going_first: "desirable", going_second: null };
const GS: ContextualOpeningQuality = { going_first: null, going_second: "desirable" };
const UND_GF: ContextualOpeningQuality = {
  going_first: "undesirable",
  going_second: null,
};
const NEU: ContextualOpeningQuality = { going_first: "neutral", going_second: null };
const CLS: ContextualOpeningQuality = { going_first: null, going_second: null };

type MinimalProfile = Pick<
  DeckProfile,
  | "desirableGe1"
  | "neutralGe1"
  | "undesirableGe1"
  | "undesirableGe2"
  | "unclassifiedGe1"
  | "anyAccess"
  | "accessNoUndesirable"
  | "accessUndesirableGe1"
  | "interactionGe1"
  | "accessAndInteraction"
  | "total"
>;

describe("deck profile: opening composition", () => {
  it("computes >=1 desirable as exact hypergeometric", () => {
    const profile = computeDeckProfile({
      deck: [
        card(1, 3, GF),
        card(2, 2, NEU),
        card(3, 1, CLS),
        card(4, 4, CLS),
      ],
      handSize: 5,
      turnOrder: "going_first",
      conditions: [],
      groups: new Map(),
    });
    expect(profile.desirableGe1).toBeCloseTo(
      openingAtLeastProbability(10, 3, 5, 1),
      12,
    );
    expect(profile.desirableGe1).toBeCloseTo(1 - 21 / 252, 12);
  });

  it("computes >=1 neutral and >=1 unclassified", () => {
    const profile = computeDeckProfile({
      deck: [card(1, 3, GF), card(2, 2, NEU), card(3, 5, CLS)],
      handSize: 5,
      turnOrder: "going_first",
      conditions: [],
      groups: new Map(),
    });
    expect(profile.neutralGe1).toBeCloseTo(
      openingAtLeastProbability(10, 2, 5, 1),
      12,
    );
    expect(profile.unclassifiedGe1).toBeCloseTo(
      openingAtLeastProbability(10, 5, 5, 1),
      12,
    );
  });

  it("computes >=1 undesirable and >=2 undesirable", () => {
    const profile = computeDeckProfile({
      deck: [card(1, 2, UND_GF), card(2, 8, CLS)],
      handSize: 5,
      turnOrder: "going_first",
      conditions: [],
      groups: new Map(),
    });
    expect(profile.undesirableGe1).toBeCloseTo(
      openingAtLeastProbability(10, 2, 5, 1),
      12,
    );
    expect(profile.undesirableGe2).toBeCloseTo(
      openingAtLeastProbability(10, 2, 5, 2),
      12,
    );
    // exact: C(2,2)*C(8,3)/C(10,5)
    expect(profile.undesirableGe2).toBeCloseTo(56 / 252, 12);
  });

  it("uses the selected turn order annotation, giving different profiles", () => {
    const fuwalos = card(10, 3, { going_first: "neutral", going_second: "desirable" });
    const proportion = card(11, 7, CLS);
    const gf = computeDeckProfile({
      deck: [fuwalos, proportion],
      handSize: 5,
      turnOrder: "going_first",
      conditions: [],
      groups: new Map(),
    });
    const gs = computeDeckProfile({
      deck: [fuwalos, proportion],
      handSize: 5,
      turnOrder: "going_second",
      conditions: [],
      groups: new Map(),
    });
    expect(gf.desirableGe1).toBe(0);
    expect(gf.neutralGe1).toBeCloseTo(openingAtLeastProbability(10, 3, 5, 1), 12);
    expect(gs.desirableGe1).toBeCloseTo(
      openingAtLeastProbability(10, 3, 5, 1),
      12,
    );
    expect(gs.neutralGe1).toBe(0);
  });

  it("supports the first-6-cards observation point", () => {
    const profile = computeDeckProfile({
      deck: [card(1, 3, GF), card(2, 37, CLS)],
      handSize: 6,
      turnOrder: "going_first",
      conditions: [],
      groups: new Map(),
    });
    expect(profile.desirableGe1).toBeCloseTo(
      openingAtLeastProbability(40, 3, 6, 1),
      12,
    );
  });
});

describe("deck profile: exact combinatorial weighting", () => {
  it("matches hand-enumerated weights for a tiny deck", () => {
    // Rows: [card1 x2 desirable GF], [card2 x2 undesirable GF], [plain x1].
    // Hand size 2, deck size 5 -> C(5,2)=10 total.
    const profile = computeDeckProfile({
      deck: [card(1, 2, GF), card(2, 2, UND_GF), card(3, 1, CLS)],
      handSize: 2,
      turnOrder: "going_first",
      conditions: [],
      groups: new Map(),
    });
    expect(profile.total).toBe(10n);
    // Hand-enumerated: (1,1,0) weight 4, (2,0,0) w 1, (1,0,1) w 2,
    // (0,2,0) w 1, (0,1,1) w 2.
    expect(profile.desirableGe1).toBeCloseTo(0.7, 12);
    expect(profile.undesirableGe1).toBeCloseTo(0.7, 12);
    expect(profile.unclassifiedGe1).toBeCloseTo(0.4, 12);
  });
});

describe("deck profile: access and interaction composition", () => {
  const access = {
    id: "a",
    name: "card1",
    requirements: [{ kind: "card" as const, card_id: 1, op: "gte" as const, count: 1 }],
  };

  it("computes access AND no undesirable and access AND >=1 undesirable", () => {
    const profile = computeDeckProfile({
      deck: [card(1, 1, GF), card(2, 1, UND_GF), card(3, 3, CLS)],
      handSize: 2,
      turnOrder: "going_first",
      conditions: [access],
      groups: new Map(),
    });
    // Hand-enumerated over 5 distinct single-copy cards, C(5,2)=10 hands.
    expect(profile.total).toBe(10n);
    expect(profile.anyAccess).toBeCloseTo(0.4, 12);
    expect(profile.accessNoUndesirable).toBeCloseTo(0.3, 12);
    expect(profile.accessUndesirableGe1).toBeCloseTo(0.1, 12);
    expect(
      profile.accessNoUndesirable + profile.accessUndesirableGe1,
    ).toBeCloseTo(profile.anyAccess, 12);
  });

  it("computes >=1 interaction and access AND interaction", () => {
    const profile = computeDeckProfile({
      deck: [
        card(1, 1, GF, ["interaction"]),
        card(2, 1, CLS),
        card(3, 3, CLS),
      ],
      handSize: 2,
      turnOrder: "going_first",
      conditions: [
        {
          id: "access",
          name: "card2",
          requirements: [
            { kind: "card" as const, card_id: 2, op: "gte" as const, count: 1 },
          ],
        },
      ],
      groups: new Map(),
    });
    // C(5,2)=10 hands. interaction card 1: P>=1 = 1 - C(4,2)/C(5,2) = 0.4.
    // access (card2) AND interaction (card1): hands containing both = (1,1,x),
    // weight 1 -> 0.1.
    expect(profile.interactionGe1).toBeCloseTo(0.4, 12);
    expect(profile.accessAndInteraction).toBeCloseTo(0.1, 12);
    expect(profile.anyAccess).toBeCloseTo(0.4, 12);
  });

  it("unions overlapping access conditions without double counting", () => {
    const overlapping = [
      access,
      {
        id: "b",
        name: "card2",
        requirements: [{ kind: "card" as const, card_id: 1, op: "gte" as const, count: 1 }],
      },
    ];
    const single = computeDeckProfile({
      deck: [card(1, 3, GF), card(2, 37, CLS)],
      handSize: 5,
      turnOrder: "going_first",
      conditions: [access],
      groups: new Map(),
    });
    const union = computeDeckProfile({
      deck: [card(1, 3, GF), card(2, 37, CLS)],
      handSize: 5,
      turnOrder: "going_first",
      conditions: overlapping,
      groups: new Map(),
    });
    expect(union.anyAccess).toBeCloseTo(single.anyAccess, 12);
  });

  it("considers side-deck cards only when they are in the main deck", () => {
    // card4 (undesirable GF) sits only in the side; profile sees the main only.
    const profileMainOnly = computeDeckProfile({
      deck: [card(1, 3, GF), card(2, 37, CLS)],
      handSize: 5,
      turnOrder: "going_first",
      conditions: [],
      groups: new Map(),
    });
    expect(profileMainOnly.undesirableGe1).toBe(0);

    // Same card moved into main changes the profile.
    const withSideMovedIn = computeDeckProfile({
      deck: [card(1, 3, GF), card(4, 3, UND_GF), card(2, 34, CLS)],
      handSize: 5,
      turnOrder: "going_first",
      conditions: [],
      groups: new Map(),
    });
    expect(withSideMovedIn.undesirableGe1).toBeGreaterThan(0);
    expect(withSideMovedIn.total).toBe(
      combinations(40, 5),
    );
  });
});

function profile(
  d: Partial<MinimalProfile> & Pick<MinimalProfile, "total">,
): MinimalProfile {
  return {
    desirableGe1: 0,
    neutralGe1: 0,
    undesirableGe1: 0,
    undesirableGe2: 0,
    unclassifiedGe1: 0,
    anyAccess: 0,
    accessNoUndesirable: 0,
    accessUndesirableGe1: 0,
    interactionGe1: 0,
    accessAndInteraction: 0,
    ...d,
  };
}

void profile;