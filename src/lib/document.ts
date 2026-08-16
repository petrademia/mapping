import {
  normalizeAccessCondition,
  normalizeAccessGroup,
  parseAccessCondition,
  parseAccessGroup,
  serializeRequirement,
  type AccessCondition,
  type AccessGroup,
} from "./access";
import {
  normalizeAnalysisContext,
  type AnalysisContext,
} from "./analysisContext";
import type { HandCondition } from "./handExplorer";
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

export const SCHEMA_VERSION = 3;

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
  access_groups: AccessGroup[];
  access_conditions: AccessCondition[];
  analysis: MappingAnalysis;
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
    access_groups: [],
    access_conditions: [],
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
    opening_quality: existing?.taxonomy.opening_quality ?? null,
  });
}

export function setCardOpeningQuality(
  doc: MappingDocument,
  section: DeckSection,
  cardId: number,
  opening_quality: OpeningQualityValue,
): MappingDocument {
  const existing = doc[section].find((card) => card.card_id === cardId);
  return setCardTaxonomy(doc, section, cardId, {
    roles: existing?.taxonomy.roles ?? [],
    opening_quality,
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

export function upsertAccessGroup(
  doc: MappingDocument,
  group: AccessGroup,
): MappingDocument {
  const normalized = normalizeAccessGroup(group);
  const index = doc.access_groups.findIndex((item) => item.id === normalized.id);
  const access_groups =
    index === -1
      ? [...doc.access_groups, normalized]
      : doc.access_groups.map((item, i) => (i === index ? normalized : item));
  return { ...doc, access_groups };
}

export function removeAccessGroup(
  doc: MappingDocument,
  groupId: string,
): MappingDocument {
  return {
    ...doc,
    access_groups: doc.access_groups.filter((group) => group.id !== groupId),
    access_conditions: doc.access_conditions.map((condition) => ({
      ...condition,
      requirements: condition.requirements.filter(
        (requirement) =>
          !(requirement.kind === "group" && requirement.group_id === groupId),
      ),
    })),
  };
}

export function upsertAccessCondition(
  doc: MappingDocument,
  condition: AccessCondition,
): MappingDocument {
  const normalized = normalizeAccessCondition(condition);
  const index = doc.access_conditions.findIndex(
    (item) => item.id === normalized.id,
  );
  const access_conditions =
    index === -1
      ? [...doc.access_conditions, normalized]
      : doc.access_conditions.map((item, i) =>
          i === index ? normalized : item,
        );
  return { ...doc, access_conditions };
}

export function removeAccessCondition(
  doc: MappingDocument,
  conditionId: string,
): MappingDocument {
  return {
    ...doc,
    access_conditions: doc.access_conditions.filter(
      (condition) => condition.id !== conditionId,
    ),
  };
}

export function setAccessConditionRequirements(
  doc: MappingDocument,
  conditionId: string,
  requirements: readonly HandCondition[],
): MappingDocument {
  const index = doc.access_conditions.findIndex(
    (condition) => condition.id === conditionId,
  );
  if (index === -1) return doc;
  const current = doc.access_conditions[index]!;
  return upsertAccessCondition(doc, {
    ...current,
    requirements: [...requirements],
  });
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
  if (![1, 2, SCHEMA_VERSION].includes(version)) {
    throw new Error(`unsupported schema_version: ${String(data.schema_version)}`);
  }
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
  const access_groups = Array.isArray(data.access_groups)
    ? data.access_groups.map(parseAccessGroup)
    : [];
  const access_conditions = Array.isArray(data.access_conditions)
    ? data.access_conditions.map(parseAccessCondition)
    : [];
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
    access_groups,
    access_conditions,
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
    access_groups: doc.access_groups.map((group) => ({
      id: group.id,
      name: group.name,
      card_ids: [...group.card_ids],
    })),
    access_conditions: doc.access_conditions.map((condition) => ({
      id: condition.id,
      name: condition.name,
      requirements: condition.requirements.map(serializeRequirement),
    })),
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
      opening_quality: card.taxonomy.opening_quality,
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
