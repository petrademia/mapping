import { mergeTaxonomies } from "./taxonomy";
import type { MappingCard, MappingDocument } from "./document";
import type { ExtraDeckIds } from "./sectionRouting";

const NO_EXTRA_IDS: ExtraDeckIds = new Set();

/** The most cards an Extra Deck can hold. */
export const EXTRA_DECK_LIMIT = 15;

/**
 * Siding configurations.
 *
 * The document's main/extra/side lists are the **Pre-Side** configuration and
 * also the card pool: for every card, `main + side` copies is the number of
 * copies that can be swapped between Main and Side. A siding configuration
 * only records overrides ("this card has N copies in Main"); every other card
 * follows Pre-Side. Taxonomy stays on the card (by `card_id`) and is never
 * copied into a configuration. Extra Deck monsters side the same way, between
 * the Extra Deck and the Side Deck (up to 15 in Extra): `extra_overrides`
 * records "this card has N copies in Extra".
 *
 * Siding changes deck composition, not what `undesirable` means.
 */
export interface SidingOverride {
  card_id: number;
  main_quantity: number;
}

export interface ExtraOverride {
  card_id: number;
  extra_quantity: number;
}

export interface SidingConfiguration {
  id: string;
  name: string;
  notes?: string;
  overrides: SidingOverride[];
  /** Extra Deck copies that differ from Pre-Side. Missing means none. */
  extra_overrides?: ExtraOverride[];
}

export interface ResolvedConfiguration {
  id: string;
  name: string;
  main: MappingCard[];
  extra: MappingCard[];
  side: MappingCard[];
}

/** DOM id of the Pre-Side deck list, so the panel can link back to it. */
export const DECK_LIST_ID = "deck-list";

export const PRE_SIDE_ID = "pre-side";
export const PRE_SIDE_NAME = "Pre-Side";

function copies(cards: readonly MappingCard[], cardId: number): number {
  return cards.find((card) => card.card_id === cardId)?.quantity ?? 0;
}

/** Total swappable copies of a card across Main and Side. */
export function poolQuantity(doc: MappingDocument, cardId: number): number {
  return copies(doc.main, cardId) + copies(doc.side, cardId);
}

/** An Extra Deck card: a known Extra Deck monster, or one already in the Extra Deck. */
export function isExtraCard(
  doc: MappingDocument,
  cardId: number,
  extraIds: ExtraDeckIds = NO_EXTRA_IDS,
): boolean {
  return extraIds.has(cardId) || copies(doc.extra, cardId) > 0;
}

/** Card pool in stable order: Pre-Side main cards, then side-only cards. Extra Deck cards are siding with Extra, not Main. */
export function poolCards(
  doc: MappingDocument,
  extraIds: ExtraDeckIds = NO_EXTRA_IDS,
): MappingCard[] {
  const seen = new Set<number>();
  const pool: MappingCard[] = [];
  for (const card of [...doc.main, ...doc.side]) {
    if (seen.has(card.card_id)) continue;
    if (isExtraCard(doc, card.card_id, extraIds)) continue;
    seen.add(card.card_id);
    const main = doc.main.find((c) => c.card_id === card.card_id);
    const side = doc.side.find((c) => c.card_id === card.card_id);
    const base = main ?? card;
    pool.push({
      ...base,
      quantity: poolQuantity(doc, card.card_id),
      taxonomy:
        main && side ? mergeTaxonomies(main.taxonomy, side.taxonomy) : base.taxonomy,
      name: main?.name || side?.name,
    });
  }
  return pool;
}

/** Total swappable copies of an Extra Deck card across Extra and Side. */
export function extraPoolQuantity(doc: MappingDocument, cardId: number): number {
  return copies(doc.extra, cardId) + copies(doc.side, cardId);
}

/** Extra Deck cards that can side: the Pre-Side Extra Deck, then Extra Deck monsters in Side. */
export function extraPoolCards(
  doc: MappingDocument,
  extraIds: ExtraDeckIds = NO_EXTRA_IDS,
): MappingCard[] {
  const seen = new Set<number>();
  const pool: MappingCard[] = [];
  for (const card of [...doc.extra, ...doc.side]) {
    if (seen.has(card.card_id)) continue;
    if (!isExtraCard(doc, card.card_id, extraIds)) continue;
    seen.add(card.card_id);
    const extra = doc.extra.find((c) => c.card_id === card.card_id);
    const side = doc.side.find((c) => c.card_id === card.card_id);
    const base = extra ?? card;
    pool.push({
      ...base,
      quantity: extraPoolQuantity(doc, card.card_id),
      taxonomy:
        extra && side ? mergeTaxonomies(extra.taxonomy, side.taxonomy) : base.taxonomy,
      name: extra?.name || side?.name,
    });
  }
  return pool;
}

/** Extra Deck copies of a card under a configuration (null = Pre-Side). */
export function extraQuantity(
  doc: MappingDocument,
  configId: string | null,
  cardId: number,
): number {
  const pool = extraPoolQuantity(doc, cardId);
  const base = copies(doc.extra, cardId);
  const config = findConfiguration(doc, configId);
  const override = config?.extra_overrides?.find((o) => o.card_id === cardId);
  const wanted = override ? override.extra_quantity : base;
  return Math.max(0, Math.min(pool, wanted));
}

/** Cards in the Extra Deck under a configuration (null = Pre-Side). */
export function extraDeckSize(
  doc: MappingDocument,
  configId: string | null,
  extraIds: ExtraDeckIds = NO_EXTRA_IDS,
): number {
  return extraPoolCards(doc, extraIds).reduce(
    (sum, card) => sum + extraQuantity(doc, configId, card.card_id),
    0,
  );
}

/** Main-deck copies of a card under a configuration (null = Pre-Side). */
export function mainQuantity(
  doc: MappingDocument,
  configId: string | null,
  cardId: number,
): number {
  const pool = poolQuantity(doc, cardId);
  const base = copies(doc.main, cardId);
  const config = findConfiguration(doc, configId);
  const override = config?.overrides.find((o) => o.card_id === cardId);
  const wanted = override ? override.main_quantity : base;
  return Math.max(0, Math.min(pool, wanted));
}

/** Display label; an empty name never falls back to the internal id. */
export function configurationLabel(config: SidingConfiguration): string {
  return config.name.trim() || "Untitled";
}

export function findConfiguration(
  doc: MappingDocument,
  configId: string | null,
): SidingConfiguration | null {
  if (configId === null) return null;
  return doc.configurations.find((config) => config.id === configId) ?? null;
}

export function resolveConfiguration(
  doc: MappingDocument,
  configId: string | null,
  extraIds: ExtraDeckIds = NO_EXTRA_IDS,
): ResolvedConfiguration {
  const config = findConfiguration(doc, configId);
  if (!config) {
    return {
      id: PRE_SIDE_ID,
      name: PRE_SIDE_NAME,
      main: doc.main,
      extra: doc.extra,
      side: doc.side,
    };
  }
  const main: MappingCard[] = [];
  const extra: MappingCard[] = [];
  const side: MappingCard[] = [];
  for (const card of poolCards(doc, extraIds)) {
    const inMain = mainQuantity(doc, config.id, card.card_id);
    const inSide = card.quantity - inMain;
    if (inMain > 0) main.push({ ...card, quantity: inMain });
    if (inSide > 0) side.push({ ...card, quantity: inSide });
  }
  for (const card of extraPoolCards(doc, extraIds)) {
    const inExtra = extraQuantity(doc, config.id, card.card_id);
    const inSide = card.quantity - inExtra;
    if (inExtra > 0) extra.push({ ...card, quantity: inExtra });
    if (inSide > 0) side.push({ ...card, quantity: inSide });
  }
  return { id: config.id, name: config.name, main, extra, side };
}

/**
 * A copy of the document whose lists are the active configuration, so every
 * analysis workspace and export reads it unchanged. Never persist this copy:
 * use `mergeAnalysisEdit` to fold edits back into the base document.
 */
export function applyConfiguration(
  doc: MappingDocument,
  configId: string | null = doc.active_configuration_id,
  extraIds: ExtraDeckIds = NO_EXTRA_IDS,
): MappingDocument {
  if (findConfiguration(doc, configId) === null) return doc;
  const resolved = resolveConfiguration(doc, configId, extraIds);
  return {
    ...doc,
    main: resolved.main,
    extra: resolved.extra,
    side: resolved.side,
  };
}

/**
 * Fold an edit made against an applied (sided) view back into the base
 * document: everything except the deck lists is taken from `next`.
 */
export function mergeAnalysisEdit(
  base: MappingDocument,
  next: MappingDocument,
): MappingDocument {
  return {
    ...next,
    main: base.main,
    extra: base.extra,
    side: base.side,
    configurations: base.configurations,
    active_configuration_id: base.active_configuration_id,
  };
}

function nextConfigurationId(doc: MappingDocument): string {
  const ids = new Set(doc.configurations.map((config) => config.id));
  let n = doc.configurations.length + 1;
  while (ids.has(`side-${n}`)) n += 1;
  return `side-${n}`;
}

export function addConfiguration(
  doc: MappingDocument,
  name?: string,
): MappingDocument {
  const id = nextConfigurationId(doc);
  const label = name?.trim() || `Post-Side ${doc.configurations.length + 1}`;
  return {
    ...doc,
    configurations: [...doc.configurations, { id, name: label, overrides: [] }],
    active_configuration_id: id,
  };
}

export function duplicateConfiguration(
  doc: MappingDocument,
  configId: string,
): MappingDocument {
  const source = findConfiguration(doc, configId);
  if (!source) return doc;
  const id = nextConfigurationId(doc);
  return {
    ...doc,
    configurations: [
      ...doc.configurations,
      {
        ...source,
        id,
        name: `${source.name} copy`,
        overrides: source.overrides.map((o) => ({ ...o })),
        ...(source.extra_overrides
          ? { extra_overrides: source.extra_overrides.map((o) => ({ ...o })) }
          : {}),
      },
    ],
    active_configuration_id: id,
  };
}

export function renameConfiguration(
  doc: MappingDocument,
  configId: string,
  name: string,
): MappingDocument {
  return {
    ...doc,
    configurations: doc.configurations.map((config) =>
      config.id === configId ? { ...config, name } : config,
    ),
  };
}

export function setConfigurationNotes(
  doc: MappingDocument,
  configId: string,
  notes: string,
): MappingDocument {
  return {
    ...doc,
    configurations: doc.configurations.map((config) => {
      if (config.id !== configId) return config;
      const { notes: _drop, ...rest } = config;
      return notes.trim() ? { ...rest, notes } : rest;
    }),
  };
}

export function removeConfiguration(
  doc: MappingDocument,
  configId: string,
): MappingDocument {
  return {
    ...doc,
    configurations: doc.configurations.filter((c) => c.id !== configId),
    active_configuration_id:
      doc.active_configuration_id === configId ? null : doc.active_configuration_id,
  };
}

export function setActiveConfiguration(
  doc: MappingDocument,
  configId: string | null,
): MappingDocument {
  if (configId !== null && !findConfiguration(doc, configId)) return doc;
  return { ...doc, active_configuration_id: configId };
}

/**
 * Set how many copies of a card are in Main under a configuration. Clamped to
 * the card pool; an override equal to Pre-Side is dropped so the card keeps
 * following Pre-Side.
 */
export function setConfigurationMainQuantity(
  doc: MappingDocument,
  configId: string,
  cardId: number,
  quantity: number,
): MappingDocument {
  if (!Number.isInteger(quantity)) {
    throw new Error("quantity must be an integer");
  }
  const pool = poolQuantity(doc, cardId);
  const clamped = Math.max(0, Math.min(pool, quantity));
  const base = copies(doc.main, cardId);
  return {
    ...doc,
    configurations: doc.configurations.map((config) => {
      if (config.id !== configId) return config;
      const others = config.overrides.filter((o) => o.card_id !== cardId);
      return {
        ...config,
        overrides:
          clamped === base
            ? others
            : [...others, { card_id: cardId, main_quantity: clamped }],
      };
    }),
  };
}

/**
 * Set how many copies of an Extra Deck card are in Extra under a configuration.
 * Clamped to the card's Extra and Side copies and to the 15-card Extra Deck:
 * asking for more than fits gives as many as fit. An override equal to Pre-Side
 * is dropped.
 */
export function setConfigurationExtraQuantity(
  doc: MappingDocument,
  configId: string,
  cardId: number,
  quantity: number,
  extraIds: ExtraDeckIds = NO_EXTRA_IDS,
): MappingDocument {
  if (!Number.isInteger(quantity)) {
    throw new Error("quantity must be an integer");
  }
  const pool = extraPoolQuantity(doc, cardId);
  const others = extraPoolCards(doc, extraIds)
    .filter((card) => card.card_id !== cardId)
    .reduce((sum, card) => sum + extraQuantity(doc, configId, card.card_id), 0);
  const room = Math.max(0, EXTRA_DECK_LIMIT - others);
  const clamped = Math.max(0, Math.min(pool, quantity, Math.max(room, 0)));
  const base = copies(doc.extra, cardId);
  return {
    ...doc,
    configurations: doc.configurations.map((config) => {
      if (config.id !== configId) return config;
      const rest = (config.extra_overrides ?? []).filter((o) => o.card_id !== cardId);
      const next = clamped === base ? rest : [...rest, { card_id: cardId, extra_quantity: clamped }];
      const { extra_overrides: _drop, ...without } = config;
      return next.length > 0 ? { ...without, extra_overrides: next } : without;
    }),
  };
}

/** Extra Deck cards whose copies differ from Pre-Side, "out" first then "in". */
export function extraDiff(
  doc: MappingDocument,
  configId: string,
  extraIds: ExtraDeckIds = NO_EXTRA_IDS,
): ConfigurationDiffRow[] {
  return extraPoolCards(doc, extraIds)
    .map((card) => {
      const pre = copies(doc.extra, card.card_id);
      const extra = extraQuantity(doc, configId, card.card_id);
      return { card_id: card.card_id, name: card.name, pre_main: pre, main: extra, delta: extra - pre };
    })
    .filter((row) => row.delta !== 0)
    .sort((a, b) => a.delta - b.delta);
}

export interface ConfigurationDiffRow {
  card_id: number;
  name?: string;
  pre_main: number;
  main: number;
  delta: number;
}

/** Cards whose Main copies differ from Pre-Side, "out" first then "in". */
export function configurationDiff(
  doc: MappingDocument,
  configId: string,
): ConfigurationDiffRow[] {
  return poolCards(doc)
    .map((card) => {
      const pre = copies(doc.main, card.card_id);
      const main = mainQuantity(doc, configId, card.card_id);
      return {
        card_id: card.card_id,
        name: card.name,
        pre_main: pre,
        main,
        delta: main - pre,
      };
    })
    .filter((row) => row.delta !== 0)
    .sort((a, b) => a.delta - b.delta);
}

/** Normalize parsed configurations: drop invalid and duplicate entries. */
export function normalizeConfigurations(
  raw: unknown,
): SidingConfiguration[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const result: SidingConfiguration[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    if (!id || id === PRE_SIDE_ID || seen.has(id)) continue;
    seen.add(id);
    const overrides = new Map<number, number>();
    if (Array.isArray(record.overrides)) {
      for (const entry of record.overrides) {
        const o = entry as Record<string, unknown>;
        const cardId = Number(o?.card_id);
        const qty = Number(o?.main_quantity);
        if (
          Number.isInteger(cardId) &&
          cardId > 0 &&
          Number.isInteger(qty) &&
          qty >= 0
        ) {
          overrides.set(cardId, qty);
        }
      }
    }
    const extraOverrides = new Map<number, number>();
    if (Array.isArray(record.extra_overrides)) {
      for (const entry of record.extra_overrides) {
        const o = entry as Record<string, unknown>;
        const cardId = Number(o?.card_id);
        const qty = Number(o?.extra_quantity);
        if (Number.isInteger(cardId) && cardId > 0 && Number.isInteger(qty) && qty >= 0) {
          extraOverrides.set(cardId, qty);
        }
      }
    }
    const config: SidingConfiguration = {
      id,
      name:
        typeof record.name === "string" && record.name.trim()
          ? record.name.trim()
          : id,
      overrides: [...overrides].map(([card_id, main_quantity]) => ({
        card_id,
        main_quantity,
      })),
    };
    if (extraOverrides.size > 0) {
      config.extra_overrides = [...extraOverrides].map(([card_id, extra_quantity]) => ({
        card_id,
        extra_quantity,
      }));
    }
    if (typeof record.notes === "string" && record.notes.trim()) {
      config.notes = record.notes;
    }
    result.push(config);
  }
  return result;
}
