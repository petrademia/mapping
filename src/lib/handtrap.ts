import type { MappingDocument } from "./document";
import { newId } from "./handCondition";

/**
 * A handtrap the opponent may hold. It carries the cards of yours it can stop,
 * picked by you, because what a handtrap can hit depends on your deck.
 */
export interface Handtrap {
  id: string;
  name: string;
  /** Passcode of the real card, for its art. Absent for a handtrap you named yourself. */
  card_id?: number;
  /** Main Deck cards of yours that this handtrap can stop. */
  hits: number[];
  notes?: string;
}

/** Two handtraps the opponent holds at once; both may use their effect on your hand. */
export interface HandtrapPair {
  id: string;
  handtrap_ids: [string, string];
}

/** The usual handtraps, with the passcodes of their art. */
export const COMMON_HANDTRAPS: readonly { card_id: number; name: string }[] = [
  { card_id: 97268402, name: "Effect Veiler" },
  { card_id: 10045474, name: "Infinite Impermanence" },
  { card_id: 14558127, name: "Ash Blossom & Joyous Spring" },
  { card_id: 97045737, name: "Dominus Purge" },
  { card_id: 40366667, name: "Dominus Impulse" },
  { card_id: 70088809, name: "Fydraulis Harmonia" },
  { card_id: 73642296, name: "Ghost Belle & Haunted Mansion" },
];

/**
 * Something the opponent goes for when they use a handtrap: one of your cards, or a
 * Group (for example every route that ends at Medius's effect). The list is in the order
 * they prefer; a handtrap still only stops what it can stop (its `hits`).
 */
export type HitTarget =
  | { kind: "card"; card_id: number }
  | { kind: "group"; group_id: string };

export const sameHitTarget = (a: HitTarget, b: HitTarget): boolean =>
  a.kind === "card" && b.kind === "card"
    ? a.card_id === b.card_id
    : a.kind === "group" && b.kind === "group" && a.group_id === b.group_id;

/** Tolerant parse for saved files: unknown Groups and repeats are dropped, order is kept. */
export function parseHitPriority(raw: unknown, groupIds: ReadonlySet<string>): HitTarget[] {
  if (!Array.isArray(raw)) return [];
  const out: HitTarget[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const item = entry as Record<string, unknown>;
    let target: HitTarget | null = null;
    if (item.kind === "card" && Number.isInteger(item.card_id) && (item.card_id as number) > 0) {
      target = { kind: "card", card_id: item.card_id as number };
    } else if (item.kind === "group" && typeof item.group_id === "string" && groupIds.has(item.group_id)) {
      target = { kind: "group", group_id: item.group_id };
    }
    if (target && !out.some((existing) => sameHitTarget(existing, target!))) out.push(target);
  }
  return out;
}

export function addHitTarget(doc: MappingDocument, target: HitTarget): MappingDocument {
  if (doc.hit_priority.some((existing) => sameHitTarget(existing, target))) return doc;
  return { ...doc, hit_priority: [...doc.hit_priority, target] };
}

export function removeHitTarget(doc: MappingDocument, index: number): MappingDocument {
  return { ...doc, hit_priority: doc.hit_priority.filter((_, at) => at !== index) };
}

/** Move a target up (-1) or down (+1) the order. */
export function moveHitTarget(doc: MappingDocument, index: number, delta: -1 | 1): MappingDocument {
  const to = index + delta;
  if (to < 0 || to >= doc.hit_priority.length) return doc;
  const next = [...doc.hit_priority];
  [next[index], next[to]] = [next[to]!, next[index]!];
  return { ...doc, hit_priority: next };
}

export function newHandtrap(name: string, card_id?: number): Handtrap {
  return {
    id: newId("handtrap"),
    name: name.trim() || "Untitled handtrap",
    ...(card_id !== undefined ? { card_id } : {}),
    hits: [],
  };
}

export function newPair(first: string, second: string): HandtrapPair {
  return { id: newId("pair"), handtrap_ids: [first, second] };
}

export function pairLabel(
  pair: HandtrapPair,
  handtraps: readonly Handtrap[],
): string {
  const name = (id: string) => handtraps.find((item) => item.id === id)?.name ?? "removed handtrap";
  return `${name(pair.handtrap_ids[0])} + ${name(pair.handtrap_ids[1])}`;
}

function parseHandtrap(raw: unknown): Handtrap | null {
  if (typeof raw !== "object" || raw === null) return null;
  const item = raw as Record<string, unknown>;
  const id = typeof item.id === "string" ? item.id.trim() : "";
  if (!id) return null;
  const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : "Untitled handtrap";
  const hits = Array.isArray(item.hits)
    ? [...new Set(item.hits.map(Number).filter((n) => Number.isInteger(n) && n > 0))]
    : [];
  const card = Number(item.card_id);
  const handtrap: Handtrap = { id, name, hits };
  if (Number.isInteger(card) && card > 0) handtrap.card_id = card;
  if (typeof item.notes === "string" && item.notes.trim()) handtrap.notes = item.notes;
  return handtrap;
}

/** Tolerant parse for saved files; invalid entries are dropped. */
export function parseHandtraps(raw: unknown): Handtrap[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Handtrap[] = [];
  for (const entry of raw) {
    const handtrap = parseHandtrap(entry);
    if (!handtrap || seen.has(handtrap.id)) continue;
    seen.add(handtrap.id);
    out.push(handtrap);
  }
  return out;
}

/** Pairs keep only entries whose two handtraps still exist. */
export function parsePairs(raw: unknown, handtraps: readonly Handtrap[]): HandtrapPair[] {
  if (!Array.isArray(raw)) return [];
  const known = new Set(handtraps.map((h) => h.id));
  const seen = new Set<string>();
  const out: HandtrapPair[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const item = entry as Record<string, unknown>;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const ids = Array.isArray(item.handtrap_ids) ? item.handtrap_ids : [];
    const [a, b] = ids;
    if (!id || seen.has(id) || typeof a !== "string" || typeof b !== "string") continue;
    if (!known.has(a) || !known.has(b)) continue;
    seen.add(id);
    out.push({ id, handtrap_ids: [a, b] });
  }
  return out;
}

// ---- Editing a document's handtraps

export function addHandtrap(doc: MappingDocument, handtrap: Handtrap): MappingDocument {
  return { ...doc, handtraps: [...doc.handtraps, handtrap] };
}

export function updateHandtrap(doc: MappingDocument, handtrap: Handtrap): MappingDocument {
  return {
    ...doc,
    handtraps: doc.handtraps.map((item) => (item.id === handtrap.id ? handtrap : item)),
  };
}

/** Remove a handtrap and every pair that used it. */
export function removeHandtrap(doc: MappingDocument, id: string): MappingDocument {
  return {
    ...doc,
    handtraps: doc.handtraps.filter((item) => item.id !== id),
    handtrap_pairs: doc.handtrap_pairs.filter((pair) => !pair.handtrap_ids.includes(id)),
  };
}

/** Add or remove one of your cards from the cards a handtrap can stop. */
export function toggleHandtrapHit(
  doc: MappingDocument,
  handtrapId: string,
  cardId: number,
): MappingDocument {
  const handtrap = doc.handtraps.find((item) => item.id === handtrapId);
  if (!handtrap) return doc;
  const hits = handtrap.hits.includes(cardId)
    ? handtrap.hits.filter((id) => id !== cardId)
    : [...handtrap.hits, cardId];
  return updateHandtrap(doc, { ...handtrap, hits });
}

export function setHandtrapHits(
  doc: MappingDocument,
  handtrapId: string,
  hits: readonly number[],
): MappingDocument {
  const handtrap = doc.handtraps.find((item) => item.id === handtrapId);
  if (!handtrap) return doc;
  return updateHandtrap(doc, { ...handtrap, hits: [...new Set(hits)] });
}

/** Save a pair; the same pair (either order) is only kept once. */
export function addHandtrapPair(
  doc: MappingDocument,
  first: string,
  second: string,
): MappingDocument {
  const known = new Set(doc.handtraps.map((item) => item.id));
  if (!known.has(first) || !known.has(second)) return doc;
  const key = [first, second].sort().join("+");
  if (doc.handtrap_pairs.some((pair) => [...pair.handtrap_ids].sort().join("+") === key)) return doc;
  return { ...doc, handtrap_pairs: [...doc.handtrap_pairs, newPair(first, second)] };
}

export function removeHandtrapPair(doc: MappingDocument, pairId: string): MappingDocument {
  return { ...doc, handtrap_pairs: doc.handtrap_pairs.filter((pair) => pair.id !== pairId) };
}
