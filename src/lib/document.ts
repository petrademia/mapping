import { DEFAULT_ROLES, uniqueRoles } from "./roles";

export const SCHEMA_VERSION = 1;

export type DeckSection = "main" | "extra" | "side";

export interface MappingCard {
  card_id: number;
  quantity: number;
  roles: string[];
  name?: string;
}

export interface MappingDocument {
  schema_version: typeof SCHEMA_VERSION;
  name: string;
  vocabulary: string[];
  main: MappingCard[];
  extra: MappingCard[];
  side: MappingCard[];
  analysis: {
    opening_hand_size: number;
  };
}

const SECTIONS: DeckSection[] = ["main", "extra", "side"];

export function createDocument(name: string): MappingDocument {
  return {
    schema_version: SCHEMA_VERSION,
    name,
    vocabulary: [...DEFAULT_ROLES],
    main: [],
    extra: [],
    side: [],
    analysis: { opening_hand_size: 5 },
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
    roles: uniqueRoles(card.roles),
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

function withVocabulary(doc: MappingDocument, roles: readonly string[]): string[] {
  return uniqueRoles([...doc.vocabulary, ...roles]);
}

function replaceSection(
  doc: MappingDocument,
  section: DeckSection,
  cards: MappingCard[],
): MappingDocument {
  const vocabulary = withVocabulary(
    doc,
    cards.flatMap((card) => card.roles),
  );
  return { ...doc, [section]: cards, vocabulary };
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
    return addCard(doc, section, { card_id: cardId, quantity, roles: [] });
  }
  const cards = doc[section].map((card, cardIndex) =>
    cardIndex === index ? { ...card, quantity } : card,
  );
  return replaceSection(doc, section, cards);
}

export function setCardRoles(
  doc: MappingDocument,
  section: DeckSection,
  cardId: number,
  roles: readonly string[],
): MappingDocument {
  const normalized = uniqueRoles(roles);
  const index = doc[section].findIndex((card) => card.card_id === cardId);
  if (index === -1) {
    return addCard(doc, section, {
      card_id: cardId,
      quantity: 1,
      roles: normalized,
    });
  }
  const cards = doc[section].map((card, cardIndex) =>
    cardIndex === index ? { ...card, roles: normalized } : card,
  );
  return replaceSection(doc, section, cards);
}

export function setDeckName(doc: MappingDocument, name: string): MappingDocument {
  return { ...doc, name };
}

export function setOpeningHandSize(
  doc: MappingDocument,
  openingHandSize: number,
): MappingDocument {
  if (!Number.isInteger(openingHandSize) || openingHandSize < 0) {
    throw new Error("opening_hand_size must be a non-negative integer");
  }
  return { ...doc, analysis: { opening_hand_size: openingHandSize } };
}

export function addVocabularyRole(
  doc: MappingDocument,
  role: string,
): MappingDocument {
  return { ...doc, vocabulary: uniqueRoles([...doc.vocabulary, role]) };
}

function parseCard(raw: unknown): MappingCard {
  if (raw === null || typeof raw !== "object") {
    throw new Error("card entries must be objects");
  }
  const record = raw as Record<string, unknown>;
  const roles = Array.isArray(record.roles)
    ? record.roles.map((role) => String(role))
    : [];
  const card: MappingCard = {
    card_id: Number(record.card_id),
    quantity: Number(record.quantity),
    roles,
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
      roles: uniqueRoles([...existing.roles, ...card.roles]),
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
  if (data.schema_version !== SCHEMA_VERSION) {
    throw new Error(`unsupported schema_version: ${String(data.schema_version)}`);
  }
  const analysis = (data.analysis ?? {}) as Record<string, unknown>;
  const openingHandSize = Number(analysis.opening_hand_size ?? 5);
  if (!Number.isInteger(openingHandSize) || openingHandSize < 0) {
    throw new Error("analysis.opening_hand_size must be a non-negative integer");
  }
  const vocabulary = Array.isArray(data.vocabulary)
    ? uniqueRoles(data.vocabulary.map((role) => String(role)))
    : [...DEFAULT_ROLES];
  const doc: MappingDocument = {
    schema_version: SCHEMA_VERSION,
    name: deckName(data.name),
    vocabulary,
    main: collapseCards(Array.isArray(data.main) ? data.main.map(parseCard) : []),
    extra: collapseCards(Array.isArray(data.extra) ? data.extra.map(parseCard) : []),
    side: collapseCards(Array.isArray(data.side) ? data.side.map(parseCard) : []),
    analysis: { opening_hand_size: openingHandSize },
  };
  return {
    ...doc,
    vocabulary: uniqueRoles([
      ...doc.vocabulary,
      ...SECTIONS.flatMap((section) =>
        doc[section].flatMap((card) => card.roles),
      ),
    ]),
  };
}

export function serializeMapping(doc: MappingDocument): string {
  return `${JSON.stringify({ ...doc, name: deckName(doc.name) }, null, 2)}\n`;
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
        roles: [],
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
