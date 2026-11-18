import { describe, expect, it } from "vitest";
import {
  addCard,
  createDocument,
  replaceDeck,
  sectionSize,
  setCardRoles,
  setConditionSetMember,
  upsertGroup,
  upsertHandCondition,
  ENGINE_ACCESS_SET_ID,
} from "./document";
import { addConfiguration } from "./configuration";
import { EMPTY_TAXONOMY } from "./taxonomy";

function modeled() {
  let doc = createDocument("mine");
  doc = addCard(doc, "main", { card_id: 1, quantity: 3, taxonomy: { ...EMPTY_TAXONOMY } });
  doc = setCardRoles(doc, "main", 1, ["starter"]);
  doc = upsertGroup(doc, { id: "g", name: "G", card_ids: [1] });
  doc = upsertHandCondition(doc, {
    id: "c",
    name: "C",
    requirements: [{ id: "r", kind: "card", card_id: 1, op: "gte", count: 1 }],
    excludes: [],
    distinct_constraints: [],
  });
  doc = setConditionSetMember(doc, ENGINE_ACCESS_SET_ID, "c", true);
  return addConfiguration(doc);
}

describe("replaceDeck", () => {
  const parsed = {
    main: [{ card_id: 5, quantity: 2 }],
    extra: [{ card_id: 6, quantity: 1 }],
    side: [{ card_id: 7, quantity: 3 }],
  };

  it("swaps the card lists and keeps Groups, Hand Conditions and Hand Goals", () => {
    const before = modeled();
    const next = replaceDeck(before, parsed);
    expect(next.main.map((c) => c.card_id)).toEqual([5]);
    expect(sectionSize(next.extra)).toBe(1);
    expect(sectionSize(next.side)).toBe(3);
    expect(next.groups).toEqual(before.groups);
    expect(next.hand_conditions).toEqual(before.hand_conditions);
    expect(next.hand_condition_sets).toEqual(before.hand_condition_sets);
    expect(next.analysis).toEqual(before.analysis);
  });

  it("drops Post-Side lists, which described the old card pool", () => {
    const next = replaceDeck(modeled(), parsed);
    expect(next.configurations).toEqual([]);
    expect(next.active_configuration_id).toBeNull();
  });

  it("starts the new cards without tags or stored names", () => {
    const next = replaceDeck(modeled(), parsed);
    for (const card of [...next.main, ...next.extra, ...next.side]) {
      expect(card.taxonomy.roles).toEqual([]);
      expect(card.name).toBeUndefined();
    }
  });

  it("keeps the tags and stored name of a card that is still in the deck", () => {
    let doc = modeled(); // card 1 x3 in Main, tagged Starter
    doc = setCardRoles(doc, "main", 1, ["starter", "interaction"]);
    doc = {
      ...doc,
      main: doc.main.map((c) =>
        c.card_id === 1
          ? { ...c, name: "Stored name", taxonomy: { ...c.taxonomy, opening_quality: { going_first: "undesirable", going_second: "desirable" } } }
          : c,
      ),
    };
    const next = replaceDeck(doc, { main: [{ card_id: 1, quantity: 2 }, { card_id: 5, quantity: 1 }], extra: [], side: [] });
    const kept = next.main.find((c) => c.card_id === 1)!;
    expect(kept.quantity).toBe(2); // the new list decides how many
    expect(kept.taxonomy.roles).toEqual(["starter", "interaction"]);
    expect(kept.taxonomy.opening_quality).toEqual({ going_first: "undesirable", going_second: "desirable" });
    expect(kept.name).toBe("Stored name");
    // A card that was not in the deck starts empty.
    expect(next.main.find((c) => c.card_id === 5)!.taxonomy.roles).toEqual([]);
  });

  it("takes the tags from the same section first, then from another section", () => {
    let doc = createDocument("d");
    doc = addCard(doc, "main", { card_id: 9, quantity: 1, taxonomy: { roles: ["interaction"], opening_quality: { going_first: null, going_second: null } } });
    doc = addCard(doc, "side", { card_id: 9, quantity: 1, taxonomy: { roles: [], opening_quality: { going_first: null, going_second: null } } });
    // Card 9 stays in Side: it keeps its Side tags (none), not Main's.
    const inSide = replaceDeck(doc, { main: [], extra: [], side: [{ card_id: 9, quantity: 1 }] });
    expect(inSide.side[0]!.taxonomy.roles).toEqual([]);
    // Card 9 goes to Extra, where it never was: it takes the tags from Main, the first section that had it.
    const moved = replaceDeck(doc, { main: [], extra: [{ card_id: 9, quantity: 1 }], side: [] });
    expect(moved.extra[0]!.taxonomy.roles).toEqual(["interaction"]);
  });

  it("does not share tag objects with the old deck", () => {
    const before = modeled();
    const next = replaceDeck(before, { main: [{ card_id: 1, quantity: 3 }], extra: [], side: [] });
    expect(next.main[0]!.taxonomy.roles).toEqual(before.main[0]!.taxonomy.roles);
    expect(next.main[0]!.taxonomy.roles).not.toBe(before.main[0]!.taxonomy.roles);
    expect(next.main[0]!.taxonomy.opening_quality).not.toBe(before.main[0]!.taxonomy.opening_quality);
  });

  it("keeps the deck name unless one is given", () => {
    expect(replaceDeck(modeled(), parsed).name).toBe("mine");
    expect(replaceDeck(modeled(), parsed, "from file").name).toBe("from file");
  });
});
