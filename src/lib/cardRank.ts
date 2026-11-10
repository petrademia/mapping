import type { MappingCard, MappingDocument } from "./document";

/**
 * A manual preference order of Main Deck cards, best first, kept separately
 * for each turn order. It is an ordering, not a score: no weights are
 * assigned, and nothing in the probability math reads it. Cards missing from a
 * stored order are shown after the ranked ones, in deck order, so a list is
 * always complete.
 */
export type RankContext = "going_first" | "going_second";

export interface CardRank {
  going_first: number[];
  going_second: number[];
}

export const RANK_CONTEXTS: { key: RankContext; label: string }[] = [
  { key: "going_first", label: "Going First" },
  { key: "going_second", label: "Going Second" },
];

export function emptyRank(): CardRank {
  return { going_first: [], going_second: [] };
}

function parseOrder(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  const order: number[] = [];
  for (const value of raw) {
    const id = Number(value);
    if (Number.isInteger(id) && id > 0 && !seen.has(id)) {
      seen.add(id);
      order.push(id);
    }
  }
  return order;
}

/** Tolerant parse for saved files: anything unusable becomes an empty order. */
export function parseCardRank(raw: unknown): CardRank {
  const record = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    going_first: parseOrder(record.going_first),
    going_second: parseOrder(record.going_second),
  };
}

/**
 * Keep stored ids that are still in the Main Deck (once each, in order), then
 * append every Main Deck card the order does not mention, in deck order.
 */
export function normalizeOrder(
  order: readonly number[],
  main: readonly MappingCard[],
): number[] {
  const inDeck = new Set(main.map((card) => card.card_id));
  const result: number[] = [];
  const seen = new Set<number>();
  for (const id of order) {
    if (inDeck.has(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  for (const card of main) {
    if (!seen.has(card.card_id)) {
      seen.add(card.card_id);
      result.push(card.card_id);
    }
  }
  return result;
}

/** The complete order for one context. */
export function rankFor(doc: MappingDocument, context: RankContext): number[] {
  return normalizeOrder(doc.card_rank[context], doc.main);
}

/** True once the user has placed or reordered at least one card in this context. */
export function isRanked(doc: MappingDocument, context: RankContext): boolean {
  return doc.card_rank[context].length > 0;
}

/** Move one item from index `from` to index `to`; out-of-range indexes are clamped. */
export function moveItem(order: readonly number[], from: number, to: number): number[] {
  if (from < 0 || from >= order.length) return [...order];
  const target = Math.max(0, Math.min(order.length - 1, to));
  const next = [...order];
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item!);
  return next;
}

export function setRank(
  doc: MappingDocument,
  context: RankContext,
  order: readonly number[],
): MappingDocument {
  return {
    ...doc,
    card_rank: { ...doc.card_rank, [context]: normalizeOrder(order, doc.main) },
  };
}

/** Forget one context's order; its list goes back to deck order. */
export function resetRank(doc: MappingDocument, context: RankContext): MappingDocument {
  return { ...doc, card_rank: { ...doc.card_rank, [context]: [] } };
}

/** Forget both orders; the lists go back to deck order. */
export function clearRank(doc: MappingDocument): MappingDocument {
  return { ...doc, card_rank: emptyRank() };
}

/** Rank position of each card (1 = best), for export. Omitted until ranked. */
export function rankedIds(doc: MappingDocument, context: RankContext): number[] {
  return isRanked(doc, context) ? rankFor(doc, context) : [];
}
