import { describe, expect, it } from "vitest";
import {
  createDocument,
  preSideConfiguration,
  setCardContextualOpeningQuality,
  setCardRoles,
  type DeckConfiguration,
} from "./document";
import { computeDeckProfile } from "./deckProfile";
import { combinations } from "./probability";
import type { ContextualOpeningQuality } from "./taxonomy";

const CLS: ContextualOpeningQuality = { going_first: null, going_second: null };

const EMPTY_HAND = { handSize: 2, turnOrder: "going_first" as const, conditions: [], groups: new Map() };

describe("deck configuration boundary", () => {
  it("pre-side configuration mirrors the document lists", () => {
    let doc = createDocument("d");
    doc = setCardRoles(doc, "main", 100, ["starter"]);
    doc = setCardContextualOpeningQuality(doc, "main", 100, "going_first", "desirable");
    const config = preSideConfiguration(doc);
    expect(config.id).toBe("pre-side");
    expect(config.name).toBe("Pre-Side");
    expect(config.main).toEqual(doc.main);
  });

  it("annotations live on cards, not on configuration copies", () => {
    let doc = createDocument("d");
    doc = setCardRoles(doc, "main", 100, ["interaction"]);
    doc = setCardContextualOpeningQuality(doc, "main", 100, "going_second", "desirable");
    const config = preSideConfiguration(doc);
    expect(config.main[0]?.taxonomy.roles).toEqual(["interaction"]);
    expect(config.main[0]?.taxonomy.opening_quality).toEqual({
      going_first: null,
      going_second: "desirable",
    });
  });

  it("switching configuration changes the analyzed Main Deck", () => {
    const preside = {
      id: "preside",
      name: "Pre-Side",
      main: [{ card_id: 1, quantity: 3, taxonomy: { roles: [], opening_quality: { ...CLS } } }],
      extra: [],
      side: [],
    };
    const postside: DeckConfiguration = {
      ...preside,
      id: "postside",
      name: "Post-Side",
      main: [{ card_id: 2, quantity: 3, taxonomy: { roles: [], opening_quality: { ...CLS } } }],
    };
    expect(preside.main.map((c) => c.card_id)).not.toEqual(
      postside.main.map((c) => c.card_id),
    );
    const deckSize = (deck: DeckConfiguration) =>
      deck.main.reduce((sum, card) => sum + card.quantity, 0);
    expect(deckSize(preside)).toBe(deckSize(postside));
    const p1 = computeDeckProfile({ deck: preside.main, ...EMPTY_HAND });
    const p2 = computeDeckProfile({ deck: postside.main, ...EMPTY_HAND });
    expect(p1.deckSize).toBe(p2.deckSize);
    expect(p1.total).toBe(p2.total);
  });

  it("annotations remain associated with cards when a config changes lists", () => {
    const shared = {
      card_id: 10,
      quantity: 2,
      taxonomy: {
        roles: ["interaction"],
        opening_quality: { going_first: "undesirable", going_second: "undesirable" },
      },
    };
    const a: DeckConfiguration = {
      id: "a",
      name: "A",
      main: [{ ...shared }],
      extra: [],
      side: [],
    };
    const b: DeckConfiguration = {
      id: "b",
      name: "B",
      main: [
        { ...shared },
        { card_id: 11, quantity: 1, taxonomy: { roles: [], opening_quality: { ...CLS } } },
      ],
      extra: [],
      side: [],
    };
    expect(a.main[0]?.taxonomy).toEqual(b.main[0]?.taxonomy);
    expect(a.main[0]?.card_id).toBe(b.main[0]?.card_id);
  });

  it("side-deck cards are not counted in opening-hand probability", () => {
    const config: DeckConfiguration = {
      id: "p",
      name: "P",
      main: [{ card_id: 1, quantity: 3, taxonomy: { roles: [], opening_quality: { ...CLS } } }],
      extra: [],
      side: [
        { card_id: 999, quantity: 3, taxonomy: { roles: [], opening_quality: { ...CLS } } },
      ],
    };
    const profile = computeDeckProfile({ deck: config.main, ...EMPTY_HAND });
    expect(profile.deckSize).toBe(3);
    expect(profile.total).toBe(combinations(3, 2));
  });
});