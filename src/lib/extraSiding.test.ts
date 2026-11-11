import { describe, expect, it } from "vitest";
import {
  addConfiguration,
  applyConfiguration,
  EXTRA_DECK_LIMIT,
  extraDeckSize,
  extraDiff,
  extraQuantity,
  poolCards,
  setConfigurationExtraQuantity,
} from "./configuration";
import {
  addCard,
  createDocument,
  parseMappingJson,
  serializeMapping,
  type MappingCard,
  type MappingDocument,
} from "./document";

const card = (card_id: number, quantity: number): MappingCard => ({
  card_id,
  quantity,
  taxonomy: { roles: [], opening_quality: { going_first: null, going_second: null } },
});

const EXTRA_IDS = new Set([900, 901, 902]);

function deck(): MappingDocument {
  let doc = createDocument("t");
  doc = addCard(doc, "main", card(1, 3));
  doc = addCard(doc, "extra", card(900, 2));
  doc = addCard(doc, "side", card(2, 1));
  doc = addCard(doc, "side", card(901, 1)); // an Extra Deck monster waiting in Side
  doc = addConfiguration(doc);
  return doc;
}

const configId = (doc: MappingDocument) => doc.configurations[0]!.id;

describe("siding the Extra Deck", () => {
  it("keeps Extra Deck monsters out of the Main pool", () => {
    const doc = deck();
    expect(poolCards(doc, EXTRA_IDS).map((c) => c.card_id)).toEqual([1, 2]);
  });

  it("swaps a Side Extra Deck card in and an Extra card out", () => {
    let doc = deck();
    const id = configId(doc);
    doc = setConfigurationExtraQuantity(doc, id, 900, 1, EXTRA_IDS); // one 900 out
    doc = setConfigurationExtraQuantity(doc, id, 901, 1, EXTRA_IDS); // 901 in
    const view = applyConfiguration(doc, id, EXTRA_IDS);
    expect(view.extra.map((c) => [c.card_id, c.quantity])).toEqual([
      [900, 1],
      [901, 1],
    ]);
    // The card sent out lands in Side; the rest of Side is untouched.
    expect(view.side.find((c) => c.card_id === 900)?.quantity).toBe(1);
    expect(view.side.find((c) => c.card_id === 2)?.quantity).toBe(1);
    expect(view.side.some((c) => c.card_id === 901)).toBe(false);
    // Main is unchanged and the Pre-Side lists are not touched.
    expect(view.main).toEqual(doc.main);
    expect(doc.extra.map((c) => c.card_id)).toEqual([900]);
  });

  it("never lets the Extra Deck pass 15 cards", () => {
    let doc = createDocument("full");
    for (let i = 0; i < EXTRA_DECK_LIMIT; i += 1) doc = addCard(doc, "extra", card(900 + i, 1));
    doc = addCard(doc, "side", card(2000, 1));
    const ids = new Set([...Array(EXTRA_DECK_LIMIT).keys()].map((i) => 900 + i).concat(2000));
    doc = addConfiguration(doc);
    const id = configId(doc);
    // Full: another card cannot come in.
    doc = setConfigurationExtraQuantity(doc, id, 2000, 1, ids);
    expect(extraQuantity(doc, id, 2000)).toBe(0);
    expect(extraDeckSize(doc, id, ids)).toBe(EXTRA_DECK_LIMIT);
    // Send one out, then the other fits.
    doc = setConfigurationExtraQuantity(doc, id, 900, 0, ids);
    doc = setConfigurationExtraQuantity(doc, id, 2000, 1, ids);
    expect(extraDeckSize(doc, id, ids)).toBe(EXTRA_DECK_LIMIT);
    expect(extraQuantity(doc, id, 2000)).toBe(1);
  });

  it("drops an override that equals Pre-Side", () => {
    let doc = deck();
    const id = configId(doc);
    doc = setConfigurationExtraQuantity(doc, id, 900, 1, EXTRA_IDS);
    expect(doc.configurations[0]!.extra_overrides).toHaveLength(1);
    doc = setConfigurationExtraQuantity(doc, id, 900, 2, EXTRA_IDS);
    expect(doc.configurations[0]!.extra_overrides).toBeUndefined();
  });

  it("reports the Extra Deck differences from Pre-Side", () => {
    let doc = deck();
    const id = configId(doc);
    doc = setConfigurationExtraQuantity(doc, id, 900, 0, EXTRA_IDS);
    doc = setConfigurationExtraQuantity(doc, id, 901, 1, EXTRA_IDS);
    expect(extraDiff(doc, id, EXTRA_IDS).map((r) => [r.card_id, r.delta])).toEqual([
      [900, -2],
      [901, 1],
    ]);
  });

  it("survives saving and loading", () => {
    let doc = deck();
    doc = setConfigurationExtraQuantity(doc, configId(doc), 901, 1, EXTRA_IDS);
    const restored = parseMappingJson(serializeMapping(doc));
    expect(restored.configurations[0]!.extra_overrides).toEqual([
      { card_id: 901, extra_quantity: 1 },
    ]);
  });
});
