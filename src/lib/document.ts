import {
  normalizeGroup,
  normalizeHandCondition,
  normalizeHandConditionSet,
  parseGroup,
  parseHandCondition,
  parseHandConditionSet,
  serializeCondition,
  type Group,
  type HandCondition,
  type HandConditionSet,
} from "./handCondition";
import {
  normalizeAnalysisContext,
  type AnalysisContext,
} from "./analysisContext";
import type { ConditionRequirement } from "./handExplorer";
import {
  EMPTY_TAXONOMY,
  mergeTaxonomies,
  migrateLegacyRoles,
  normalizeTaxonomy,
  uniqueRoles,
  type CardTaxonomy,
  type OpeningQualityValue,
  type Role,
} from "./taxonomy";

export const SCHEMA_VERSION = 6;

/**
 * The fixed-id Hand Condition Set backing the "Modeled Engine Access"
 * analysis. The user explicitly selects which Hand Conditions are members.
 */
export const ENGINE_ACCESS_SET_ID = "modeled-engine-access";
export const ENGINE_ACCESS_SET_NAME = "Modeled Engine Access";

export type DeckSection = "main" | "extra" | "side";

export interface MappingCard {
  card_id: number;
  quantity: number;
  taxonomy: CardTaxonomy;
  name?: string;
}

export interface MappingAnalysis {
  /** Base opening-hand size (always the initial draw; default 5). */
  opening_hand_size: number;
  turn_order: AnalysisContext["turn_order"];
  observation_point: AnalysisContext["observation_point"];
}

export interface MappingDocument {
  schema_version: typeof SCHEMA_VERSION;
  name: string;
  main: MappingCard[];
  extra: MappingCard[];
  side: MappingCard[];
  groups: Group[];
  hand_conditions: HandCondition[];
  hand_condition_sets: HandConditionSet[];
  /** id of the HandConditionSet that defines Modeled Engine Access. */
  engine_access_set_id: string | null;
  analysis: MappingAnalysis;
}

/**
 * A concrete deck list under analysis (siding changes which list is used).
 * Annotations (taxonomy) stay on individual cards referenced by `card_id`;
 * a configuration only groups which cards/copies belong to the Main Deck.
 * Post-side configurations are a future task; v0 exposes only the pre-side
 * configuration derived from the document.
 */
export interface DeckConfiguration {
  id: string;
  name: string;
  main: MappingCard[];
  extra: MappingCard[];
  side: MappingCard[];
}

export function preSideConfiguration(doc: MappingDocument): DeckConfiguration {
  return {
    id: "pre-side",
    name: "Pre-Side",
    main: doc.main,
    extra: doc.extra,
    side: doc.side,
  };
}

function defaultAnalysis(
  overrides: Partial<MappingAnalysis> = {},
): MappingAnalysis {
  const context = normalizeAnalysisContext({
    turn_order: overrides.turn_order,
    observation_point: overrides.observation_point,
  });
  const opening_hand_size = overrides.opening_hand_size ?? 5;
  if (!Number.isInteger(opening_hand_size) || opening_hand_size < 0) {
    throw new Error("opening_hand_size must be a non-negative integer");
  }
  return {
    opening_hand_size,
    turn_order: context.turn_order,
    observation_point: context.observation_point,
  };
}

export function createDocument(name: string): MappingDocument {
  return {
    schema_version: SCHEMA_VERSION,
    name,
    main: [],
    extra: [],
    side: [],
    groups: [],
    hand_conditions: [],
    hand_condition_sets: [
      {
        id: ENGINE_ACCESS_SET_ID,
        name: ENGINE_ACCESS_SET_NAME,
        condition_ids: [],
        aggregation: "any",
      },
    ],
    engine_access_set_id: ENGINE_ACCESS_SET_ID,
    analysis: defaultAnalysis(),
  };
}

export function normalizeCard(card: MappingCard): MappingCard {
  if (!Number.isInteger(card.card_id) || card.card_id <= 0) {
    throw new Error("card_id must be a positive integer");
  }
  if (!Number.isInteger(card.quantity) || card.quantity < 1) {
    throw new Error("quantity must be a positive integer");
  }
  const normalized: MappingCard = {
    card_id: card.card_id,
    quantity: card.quantity,
    taxonomy: normalizeTaxonomy(card.taxonomy),
  };
  const name = card.name?.trim();
  if (name) normalized.name = name;
  return normalized;
}

export function sectionSize(cards: readonly MappingCard[]): number {
  return cards.reduce((sum, card) => sum + card.quantity, 0);
}

export function expandCopies(cards: readonly MappingCard[]): number[] {
  const ids: number[] = [];
  for (const card of cards) {
    for (let i = 0; i < card.quantity; i += 1) ids.push(card.card_id);
  }
  return ids;
}

function replaceSection(
  doc: MappingDocument,
  section: DeckSection,
  cards: MappingCard[],
): MappingDocument {
  return { ...doc, [section]: cards };
}

export function addCard(
  doc: MappingDocument,
  section: DeckSection,
  card: MappingCard,
): MappingDocument {
  const incoming = normalizeCard(card);
  const existing = doc[section].find((item) => item.card_id === incoming.card_id);
  if (existing) {
    return setQuantity(
      doc,
      section,
      incoming.card_id,
      existing.quantity + incoming.quantity,
    );
  }
  return replaceSection(doc, section, [...doc[section], incoming]);
}

export function removeCard(
  doc: MappingDocument,
  section: DeckSection,
  cardId: number,
): MappingDocument {
  return replaceSection(
    doc,
    section,
    doc[section].filter((card) => card.card_id !== cardId),
  );
}

export function addFromParsed(
  doc: MappingDocument,
  parsed: {
    main: readonly { card_id: number; quantity: number }[];
    extra: readonly { card_id: number; quantity: number }[];
    side: readonly { card_id: number; quantity: number }[];
  },
): MappingDocument {
  let next = doc;
  for (const section of ["main", "extra", "side"] as const) {
    for (const card of parsed[section]) {
      next = addCard(next, section, {
        card_id: card.card_id,
        quantity: card.quantity,
        taxonomy: { ...EMPTY_TAXONOMY },
      });
    }
  }
  return next;
}

export function setQuantity(
  doc: MappingDocument,
  section: DeckSection,
  cardId: number,
  quantity: number,
): MappingDocument {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error("quantity must be a positive integer");
  }
  const index = doc[section].findIndex((card) => card.card_id === cardId);
  if (index === -1) {
    return addCard(doc, section, {
      card_id: cardId,
      quantity,
      taxonomy: { ...EMPTY_TAXONOMY },
    });
  }
  const cards = doc[section].map((card, cardIndex) =>
    cardIndex === index ? { ...card, quantity } : card,
  );
  return replaceSection(doc, section, cards);
}

export function setCardTaxonomy(
  doc: MappingDocument,
  section: DeckSection,
  cardId: number,
  taxonomy: CardTaxonomy,
): MappingDocument {
  const normalized = normalizeTaxonomy(taxonomy);
  const index = doc[section].findIndex((card) => card.card_id === cardId);
  if (index === -1) {
    return addCard(doc, section, {
      card_id: cardId,
      quantity: 1,
      taxonomy: normalized,
    });
  }
  const cards = doc[section].map((card, cardIndex) =>
    cardIndex === index ? { ...card, taxonomy: normalized } : card,
  );
  return replaceSection(doc, section, cards);
}

export function setCardRoles(
  doc: MappingDocument,
  section: DeckSection,
  cardId: number,
  roles: readonly Role[],
): MappingDocument {
  const existing = doc[section].find((card) => card.card_id === cardId);
  return setCardTaxonomy(doc, section, cardId, {
    roles: uniqueRoles(roles),
    opening_quality:
      existing?.taxonomy.opening_quality ?? {
        ...EMPTY_TAXONOMY.opening_quality,
      },
  });
}

export function setCardContextualOpeningQuality(
  doc: MappingDocument,
  section: DeckSection,
  cardId: number,
  turnOrder: "going_first" | "going_second",
  opening_quality: OpeningQualityValue,
): MappingDocument {
  const existing = doc[section].find((card) => card.card_id === cardId);
  const current = existing?.taxonomy.opening_quality ?? {
    ...EMPTY_TAXONOMY.opening_quality,
  };
  return setCardTaxonomy(doc, section, cardId, {
    roles: existing?.taxonomy.roles ?? [],
    opening_quality: {
      ...current,
      [turnOrder]: opening_quality,
    },
  });
}

/** Legacy convenience: applies the same judgment to both contexts. */
export function setCardOpeningQuality(
  doc: MappingDocument,
  section: DeckSection,
  cardId: number,
  opening_quality: OpeningQualityValue,
): MappingDocument {
  const existing = doc[section].find((card) => card.card_id === cardId);
  return setCardTaxonomy(doc, section, cardId, {
    roles: existing?.taxonomy.roles ?? [],
    opening_quality: {
      going_first: opening_quality,
      going_second: opening_quality,
    },
  });
}

export function setDeckName(doc: MappingDocument, name: string): MappingDocument {
  return { ...doc, name };
}

export function setOpeningHandSize(
  doc: MappingDocument,
  openingHandSize: number,
): MappingDocument {
  return {
    ...doc,
    analysis: defaultAnalysis({
      ...doc.analysis,
      opening_hand_size: openingHandSize,
    }),
  };
}

export function setAnalysisContext(
  doc: MappingDocument,
  context: AnalysisContext,
): MappingDocument {
  return {
    ...doc,
    analysis: defaultAnalysis({
      ...doc.analysis,
      ...normalizeAnalysisContext(context),
    }),
  };
}

export function analysisContextOf(doc: MappingDocument): AnalysisContext {
  return normalizeAnalysisContext(doc.analysis);
}

export function upsertGroup(
  doc: MappingDocument,
  group: Group,
): MappingDocument {
  const normalized = normalizeGroup(group);
  const index = doc.groups.findIndex((item) => item.id === normalized.id);
  const groups =
    index === -1
      ? [...doc.groups, normalized]
      : doc.groups.map((item, i) => (i === index ? normalized : item));
  return { ...doc, groups };
}

export function removeGroup(
  doc: MappingDocument,
  groupId: string,
): MappingDocument {
  return {
    ...doc,
    groups: doc.groups.filter((group) => group.id !== groupId),
    hand_conditions: doc.hand_conditions.map((condition) => ({
      ...condition,
      requirements: condition.requirements.filter(
        (requirement) =>
          !(requirement.kind === "group" && requirement.group_id === groupId),
      ),
      excludes: condition.excludes.filter(
        (exclusion) =>
          !(exclusion.kind === "group" && exclusion.group_id === groupId),
      ),
    })),
  };
}

export function upsertHandCondition(
  doc: MappingDocument,
  condition: HandCondition,
): MappingDocument {
  const normalized = normalizeHandCondition(condition);
  const index = doc.hand_conditions.findIndex(
    (item) => item.id === normalized.id,
  );
  const hand_conditions =
    index === -1
      ? [...doc.hand_conditions, normalized]
      : doc.hand_conditions.map((item, i) =>
          i === index ? normalized : item,
        );
  return { ...doc, hand_conditions };
}

export function removeHandCondition(
  doc: MappingDocument,
  conditionId: string,
): MappingDocument {
  return {
    ...doc,
    hand_conditions: doc.hand_conditions.filter(
      (condition) => condition.id !== conditionId,
    ),
    // A deleted condition also leaves every set (including Engine Access).
    hand_condition_sets: doc.hand_condition_sets.map((set) => ({
      ...set,
      condition_ids: set.condition_ids.filter((id) => id !== conditionId),
    })),
  };
}

export function setHandConditionRequirements(
  doc: MappingDocument,
  conditionId: string,
  requirements: readonly ConditionRequirement[],
): MappingDocument {
  const index = doc.hand_conditions.findIndex(
    (condition) => condition.id === conditionId,
  );
  if (index === -1) return doc;
  const current = doc.hand_conditions[index]!;
  return upsertHandCondition(doc, {
    ...current,
    requirements: [...requirements],
  });
}

export function setHandConditionExcludes(
  doc: MappingDocument,
  conditionId: string,
  excludes: readonly ConditionRequirement[],
): MappingDocument {
  const index = doc.hand_conditions.findIndex(
    (condition) => condition.id === conditionId,
  );
  if (index === -1) return doc;
  const current = doc.hand_conditions[index]!;
  return upsertHandCondition(doc, {
    ...current,
    excludes: [...excludes],
  });
}

export function upsertHandConditionSet(
  doc: MappingDocument,
  set: HandConditionSet,
): MappingDocument {
  const normalized = normalizeHandConditionSet(set);
  const index = doc.hand_condition_sets.findIndex(
    (item) => item.id === normalized.id,
  );
  const hand_condition_sets =
    index === -1
      ? [...doc.hand_condition_sets, normalized]
      : doc.hand_condition_sets.map((item, i) =>
          i === index ? normalized : item,
        );
  return { ...doc, hand_condition_sets };
}

export function removeHandConditionSet(
  doc: MappingDocument,
  setId: string,
): MappingDocument {
  return {
    ...doc,
    hand_condition_sets: doc.hand_condition_sets.filter(
      (set) => set.id !== setId,
    ),
    engine_access_set_id:
      doc.engine_access_set_id === setId ? null : doc.engine_access_set_id,
  };
}

/** The HandConditionSet that defines Modeled Engine Access, if present. */
export function engineAccessSet(doc: MappingDocument): HandConditionSet | null {
  if (!doc.engine_access_set_id) return null;
  return (
    doc.hand_condition_sets.find((set) => set.id === doc.engine_access_set_id) ??
    null
  );
}

/** ids of the Hand Conditions selected as Modeled Engine Access members. */
export function engineAccessConditionIds(doc: MappingDocument): string[] {
  return engineAccessSet(doc)?.condition_ids ?? [];
}

export function isEngineAccessCondition(
  doc: MappingDocument,
  conditionId: string,
): boolean {
  return engineAccessConditionIds(doc).includes(conditionId);
}

/**
 * Add or remove a Hand Condition from the Modeled Engine Access set.
 * The set is created on demand if the document has no engine-access set yet.
 */
export function setEngineAccessMember(
  doc: MappingDocument,
  conditionId: string,
  member: boolean,
): MappingDocument {
  const set = engineAccessSet(doc) ?? {
    id: ENGINE_ACCESS_SET_ID,
    name: ENGINE_ACCESS_SET_NAME,
    condition_ids: [],
    aggregation: "any" as const,
  };
  const condition_ids = member
    ? [...set.condition_ids, conditionId]
    : set.condition_ids.filter((id) => id !== conditionId);
  const next = upsertHandConditionSet(doc, {
    ...set,
    condition_ids: [...new Set(condition_ids)],
  });
  return { ...next, engine_access_set_id: set.id };
}

function parseCard(raw: unknown, legacyFlatRoles: boolean): MappingCard {
  if (raw === null || typeof raw !== "object") {
    throw new Error("card entries must be objects");
  }
  const record = raw as Record<string, unknown>;
  let taxonomy: CardTaxonomy;
  if (legacyFlatRoles) {
    const roles = Array.isArray(record.roles)
      ? record.roles.map((role) => String(role))
      : [];
    taxonomy = migrateLegacyRoles(roles);
  } else if (record.taxonomy !== undefined) {
    taxonomy = normalizeTaxonomy(
      (record.taxonomy ?? {}) as {
        roles?: string[];
        opening_quality?: unknown;
      },
    );
  } else if (Array.isArray(record.roles)) {
    // Defensive: nested taxonomy missing but flat roles present on v2 payload.
    taxonomy = migrateLegacyRoles(record.roles.map((role) => String(role)));
  } else {
    taxonomy = { ...EMPTY_TAXONOMY };
  }
  const card: MappingCard = {
    card_id: Number(record.card_id),
    quantity: Number(record.quantity),
    taxonomy,
  };
  if (typeof record.name === "string") card.name = record.name;
  return normalizeCard(card);
}

function collapseCards(cards: MappingCard[]): MappingCard[] {
  const order: number[] = [];
  const merged = new Map<number, MappingCard>();
  for (const card of cards) {
    const existing = merged.get(card.card_id);
    if (!existing) {
      order.push(card.card_id);
      merged.set(card.card_id, card);
      continue;
    }
    merged.set(card.card_id, {
      card_id: card.card_id,
      quantity: existing.quantity + card.quantity,
      taxonomy: mergeTaxonomies(existing.taxonomy, card.taxonomy),
      name: existing.name || card.name,
    });
  }
  return order.map((cardId) => merged.get(cardId)!);
}

function deckName(value: unknown): string {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : "untitled";
}

export function parseMappingJson(text: string): MappingDocument {
  const data = JSON.parse(text) as Record<string, unknown>;
  const version = Number(data.schema_version);
  if (![1, 2, 3, 4, 5, SCHEMA_VERSION].includes(version)) {
    throw new Error(`unsupported schema_version: ${String(data.schema_version)}`);
  }
  const legacy = version < 6;
  const legacyFlatRoles = version === 1;
  const analysis = (data.analysis ?? {}) as Record<string, unknown>;
  const parsedAnalysis = defaultAnalysis({
    opening_hand_size: Number(analysis.opening_hand_size ?? 5),
    turn_order:
      analysis.turn_order === "going_second" ? "going_second" : "going_first",
    observation_point:
      analysis.observation_point === "first_turn"
        ? "first_turn"
        : "opening_hand",
  });
  const rawGroups = data.groups ?? data.access_groups;
  const groups = Array.isArray(rawGroups) ? rawGroups.map(parseGroup) : [];
  const rawConditions = data.hand_conditions ?? data.access_conditions;
  const hand_conditions = Array.isArray(rawConditions)
    ? rawConditions.map(parseHandCondition)
    : [];
  const hand_condition_sets = Array.isArray(data.hand_condition_sets)
    ? data.hand_condition_sets.map(parseHandConditionSet)
    : [];

  let engineAccessId: string | null = null;
  const explicitEngineId =
    typeof data.engine_access_set_id === "string"
      ? data.engine_access_set_id
      : null;
  const hasEngineSet = hand_condition_sets.some(
    (set) => set.id === ENGINE_ACCESS_SET_ID,
  );
  if (explicitEngineId && hand_condition_sets.some((set) => set.id === explicitEngineId)) {
    engineAccessId = explicitEngineId;
  } else if (hasEngineSet) {
    engineAccessId = ENGINE_ACCESS_SET_ID;
  }
  if (legacy) {
    // v1-v5 Access Conditions were all treated as Modeled Engine Access
    // members; preserve that membership through the engine-access set.
    const engineSet: HandConditionSet = {
      id: ENGINE_ACCESS_SET_ID,
      name: ENGINE_ACCESS_SET_NAME,
      condition_ids: hand_conditions.map((condition) => condition.id),
      aggregation: "any",
    };
    const withoutDefault = hand_condition_sets.filter(
      (set) => set.id !== ENGINE_ACCESS_SET_ID,
    );
    return {
      schema_version: SCHEMA_VERSION,
      name: deckName(data.name),
      main: collapseCards(
        Array.isArray(data.main)
          ? data.main.map((card) => parseCard(card, legacyFlatRoles))
          : [],
      ),
      extra: collapseCards(
        Array.isArray(data.extra)
          ? data.extra.map((card) => parseCard(card, legacyFlatRoles))
          : [],
      ),
      side: collapseCards(
        Array.isArray(data.side)
          ? data.side.map((card) => parseCard(card, legacyFlatRoles))
          : [],
      ),
      groups,
      hand_conditions,
      hand_condition_sets: [...withoutDefault, engineSet],
      engine_access_set_id: ENGINE_ACCESS_SET_ID,
      analysis: parsedAnalysis,
    };
  }
  return {
    schema_version: SCHEMA_VERSION,
    name: deckName(data.name),
    main: collapseCards(
      Array.isArray(data.main)
        ? data.main.map((card) => parseCard(card, legacyFlatRoles))
        : [],
    ),
    extra: collapseCards(
      Array.isArray(data.extra)
        ? data.extra.map((card) => parseCard(card, legacyFlatRoles))
        : [],
    ),
    side: collapseCards(
      Array.isArray(data.side)
        ? data.side.map((card) => parseCard(card, legacyFlatRoles))
        : [],
    ),
    groups,
    hand_conditions,
    hand_condition_sets,
    engine_access_set_id: engineAccessId,
    analysis: parsedAnalysis,
  };
}

/**
 * Serialize with explicit `opening_quality: null` so unclassified stays
 * distinguishable from `"neutral"` after round-trip.
 */
export function serializeMapping(doc: MappingDocument): string {
  const payload = {
    schema_version: SCHEMA_VERSION,
    name: deckName(doc.name),
    main: doc.main.map(serializeCard),
    extra: doc.extra.map(serializeCard),
    side: doc.side.map(serializeCard),
    groups: doc.groups.map((group) => ({
      id: group.id,
      name: group.name,
      card_ids: [...group.card_ids],
    })),
    hand_conditions: doc.hand_conditions.map((condition) => ({
      id: condition.id,
      name: condition.name,
      requirements: condition.requirements.map(serializeCondition),
      excludes: condition.excludes.map(serializeCondition),
    })),
    hand_condition_sets: doc.hand_condition_sets.map((set) => ({
      id: set.id,
      name: set.name,
      condition_ids: [...set.condition_ids],
      aggregation: set.aggregation,
    })),
    engine_access_set_id: doc.engine_access_set_id,
    analysis: doc.analysis,
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function serializeCard(card: MappingCard): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    card_id: card.card_id,
    quantity: card.quantity,
    taxonomy: {
      roles: [...card.taxonomy.roles],
      opening_quality: {
        going_first: card.taxonomy.opening_quality.going_first,
        going_second: card.taxonomy.opening_quality.going_second,
      },
    },
  };
  if (card.name) entry.name = card.name;
  return entry;
}

export function documentFromParsed(
  name: string,
  parsed: {
    main: { card_id: number; quantity: number }[];
    extra: { card_id: number; quantity: number }[];
    side: { card_id: number; quantity: number }[];
  },
  names: ReadonlyMap<number, string>,
): MappingDocument {
  const toCards = (rows: { card_id: number; quantity: number }[]): MappingCard[] =>
    rows.map((row) =>
      normalizeCard({
        card_id: row.card_id,
        quantity: row.quantity,
        taxonomy: { ...EMPTY_TAXONOMY },
        name: names.get(row.card_id),
      }),
    );
  return {
    ...createDocument(name),
    main: toCards(parsed.main),
    extra: toCards(parsed.extra),
    side: toCards(parsed.side),
  };
}
