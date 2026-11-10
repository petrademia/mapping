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

  it("keeps the deck name unless one is given", () => {
    expect(replaceDeck(modeled(), parsed).name).toBe("mine");
    expect(replaceDeck(modeled(), parsed, "from file").name).toBe("from file");
  });
});
