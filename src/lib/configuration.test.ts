import { describe, expect, it } from "vitest";
import {
  addConfiguration,
  applyConfiguration,
  configurationDiff,
  mergeAnalysisEdit,
  removeConfiguration,
  resolveConfiguration,
  setActiveConfiguration,
  setConfigurationMainQuantity,
} from "./configuration";
import {
  addCard,
  createDocument,
  parseMappingJson,
  serializeMapping,
  sectionSize,
  setCardRoles,
  upsertGroup,
} from "./document";
import { EMPTY_TAXONOMY } from "./taxonomy";

function base() {
  let doc = createDocument("d");
  const add = (section: "main" | "side", id: number, quantity: number) => {
    doc = addCard(doc, section, { card_id: id, quantity, taxonomy: { ...EMPTY_TAXONOMY } });
  };
  add("main", 1, 3);
  add("main", 2, 2);
  add("side", 2, 1);
  add("side", 9, 2);
  return doc;
}

const pairs = (cards: { card_id: number; quantity: number }[]) =>
  cards.map((c) => [c.card_id, c.quantity]);

describe("siding configurations", () => {
  it("a new configuration equals Pre-Side until overridden", () => {
    const doc = addConfiguration(base());
    const r = resolveConfiguration(doc, doc.active_configuration_id);
    expect(pairs(r.main)).toEqual([[1, 3], [2, 2]]);
    expect(pairs(r.side)).toEqual([[2, 1], [9, 2]]);
  });

  it("moves copies between main and side and conserves the pool", () => {
    let doc = addConfiguration(base());
    const id = doc.active_configuration_id!;
    doc = setConfigurationMainQuantity(doc, id, 1, 1);
    doc = setConfigurationMainQuantity(doc, id, 9, 2);
    const r = resolveConfiguration(doc, id);
    expect(pairs(r.main)).toEqual([[1, 1], [2, 2], [9, 2]]);
    expect(pairs(r.side)).toEqual([[1, 2], [2, 1]]);
    expect(sectionSize(r.main) + sectionSize(r.side)).toBe(
      sectionSize(doc.main) + sectionSize(doc.side),
    );
  });

  it("clamps to the pool and drops overrides equal to Pre-Side", () => {
    let doc = addConfiguration(base());
    const id = doc.active_configuration_id!;
    doc = setConfigurationMainQuantity(doc, id, 2, 99);
    expect(resolveConfiguration(doc, id).main.find((c) => c.card_id === 2)?.quantity).toBe(3);
    doc = setConfigurationMainQuantity(doc, id, 2, 2);
    expect(doc.configurations[0]!.overrides).toEqual([]);
    doc = setConfigurationMainQuantity(doc, id, 1, -5);
    expect(resolveConfiguration(doc, id).main.some((c) => c.card_id === 1)).toBe(false);
  });

  it("unlisted cards follow later Pre-Side edits", () => {
    let doc = addConfiguration(base());
    const id = doc.active_configuration_id!;
    doc = setConfigurationMainQuantity(doc, id, 1, 1);
    doc = addCard(doc, "main", { card_id: 5, quantity: 1, taxonomy: { ...EMPTY_TAXONOMY } });
    expect(resolveConfiguration(doc, id).main.some((c) => c.card_id === 5)).toBe(true);
  });

  it("annotations are shared by card_id", () => {
    let doc = setCardRoles(base(), "side", 9, ["interaction"]);
    doc = addConfiguration(doc);
    const id = doc.active_configuration_id!;
    doc = setConfigurationMainQuantity(doc, id, 9, 1);
    expect(
      resolveConfiguration(doc, id).main.find((c) => c.card_id === 9)?.taxonomy.roles,
    ).toEqual(["interaction"]);
  });

  it("applyConfiguration swaps lists; mergeAnalysisEdit never persists them", () => {
    let doc = addConfiguration(base());
    const id = doc.active_configuration_id!;
    doc = setConfigurationMainQuantity(doc, id, 1, 0);
    const view = applyConfiguration(doc);
    expect(view.main.some((c) => c.card_id === 1)).toBe(false);
    const edited = upsertGroup(view, { id: "g", name: "G", card_ids: [1] });
    const merged = mergeAnalysisEdit(doc, edited);
    expect(merged.main).toBe(doc.main);
    expect(merged.groups).toHaveLength(1);
    expect(merged.configurations).toBe(doc.configurations);
  });

  it("Pre-Side view is the document itself", () => {
    const doc = setActiveConfiguration(addConfiguration(base()), null);
    expect(applyConfiguration(doc)).toBe(doc);
  });

  it("removing the active configuration falls back to Pre-Side", () => {
    const doc = addConfiguration(base());
    expect(removeConfiguration(doc, doc.active_configuration_id!).active_configuration_id).toBeNull();
  });

  it("diff lists outs before ins", () => {
    let doc = addConfiguration(base());
    const id = doc.active_configuration_id!;
    doc = setConfigurationMainQuantity(doc, id, 1, 1);
    doc = setConfigurationMainQuantity(doc, id, 9, 2);
    expect(configurationDiff(doc, id).map((r) => [r.card_id, r.delta])).toEqual([
      [1, -2],
      [9, 2],
    ]);
  });

  it("round-trips through JSON and loads v7 documents", () => {
    let doc = addConfiguration(base());
    const id = doc.active_configuration_id!;
    doc = setConfigurationMainQuantity(doc, id, 1, 1);
    const parsed = parseMappingJson(serializeMapping(doc));
    expect(parsed.configurations).toEqual(doc.configurations);
    expect(parsed.active_configuration_id).toBe(id);
    const legacy = JSON.parse(serializeMapping(createDocument("x")));
    legacy.schema_version = 7;
    delete legacy.configurations;
    delete legacy.active_configuration_id;
    const v7 = parseMappingJson(JSON.stringify(legacy));
    expect(v7.configurations).toEqual([]);
    expect(v7.active_configuration_id).toBeNull();
  });
});
