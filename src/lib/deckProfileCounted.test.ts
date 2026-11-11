import { describe, expect, it } from "vitest";
import { computeDeckProfile, copyCountFor } from "./deckProfile";
import type { MappingCard } from "./document";
import { forEachHandComposition, handConditionHolds, type HandConditionLike } from "./handExplorer";
import { openingQualityForTurn, type OpeningQualityValue, type Role } from "./taxonomy";

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const QUALITY: OpeningQualityValue[] = [null, "desirable", "neutral", "undesirable"];
const ROLES: Role[] = ["starter", "extender", "interaction"];

describe("computeDeckProfile counts instead of listing hands", () => {
  it("matches a hand-by-hand count on random annotated decks", () => {
    for (let seed = 1; seed <= 8; seed += 1) {
      const rand = seeded(seed);
      const deck: MappingCard[] = Array.from({ length: 11 }, (_, i) => ({
        card_id: 10 + i,
        quantity: 1 + Math.floor(rand() * 3),
        taxonomy: {
          roles: ROLES.filter(() => rand() < 0.3),
          opening_quality: {
            going_first: QUALITY[Math.floor(rand() * QUALITY.length)] ?? null,
            going_second: QUALITY[Math.floor(rand() * QUALITY.length)] ?? null,
          },
        },
      }));
      const groups = new Map([["g", new Set([10, 12, 15])]]);
      const conditions: HandConditionLike[] = [
        { id: "a", name: "a", requirements: [{ kind: "card", card_id: 11, op: "gte", count: 1 }] },
        {
          id: "b",
          name: "b",
          requirements: [{ kind: "role", role: "starter", op: "gte", count: 1 }],
          excludes: [{ kind: "group", group_id: "g", op: "gte", count: 2 }],
        },
        { id: "c", name: "c", requirements: [{ kind: "group", group_id: "g", op: "eq", count: 1 }] },
      ];
      for (const turnOrder of ["going_first", "going_second"] as const) {
        const handSize = 4;
        const profile = computeDeckProfile({
          deck,
          handSize,
          turnOrder,
          conditions,
          accessConditionIds: ["a", "b", "c"],
          groups,
        });

        let any = 0n;
        let noUndesirable = 0n;
        let undesirable = 0n;
        let withInteraction = 0n;
        const buckets = [0n, 0n, 0n, 0n];
        forEachHandComposition(deck, handSize, (hand, weight) => {
          const satisfied = conditions.filter((c) => handConditionHolds(hand, deck, c, groups)).length;
          buckets[satisfied] = buckets[satisfied]! + weight;
          if (satisfied === 0) return;
          any += weight;
          const bad = copyCountFor(
            hand,
            deck,
            (card) => openingQualityForTurn(card.taxonomy.opening_quality, turnOrder) === "undesirable",
          );
          const interaction = copyCountFor(hand, deck, (card) => card.taxonomy.roles.includes("interaction"));
          if (bad === 0) noUndesirable += weight;
          else undesirable += weight;
          if (interaction >= 1) withInteraction += weight;
        });

        expect(profile.anyAccessWeight).toBe(any);
        expect(profile.accessNoUndesirableWeight).toBe(noUndesirable);
        expect(profile.accessUndesirableGe1Weight).toBe(undesirable);
        expect(profile.accessAndInteractionWeight).toBe(withInteraction);
        expect(profile.accessMultiplicity.weights).toEqual(buckets);
      }
    }
  });
});
