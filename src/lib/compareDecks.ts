import { observedCards } from "./analysisContext";
import {
  analysisContextOf,
  sectionSize,
  type MappingCard,
  type MappingDocument,
} from "./document";
import { groupsToMembership } from "./handCondition";
import { analyzeHandConditions } from "./handExplorer";
import { openingQualityForTurn, ROLES, type Role } from "./taxonomy";

const ANY_GOAL = "__any_condition";

export interface GoalScore {
  id: string;
  name: string;
  probability: number;
  weight: bigint;
}

export interface DeckScore {
  name: string;
  mainSize: number;
  /** Cards drawn for the compared hand (5, or 6 going second). */
  sample: number;
  total: bigint;
  goals: GoalScore[];
  /** P(a hand matches at least one Hand Condition of any goal). */
  anyMatch: number;
  /** P(a hand matches no Hand Condition at all): the chance of a brick. */
  brick: number;
  /** P(a hand matches two or more Hand Conditions): how much the conditions overlap. */
  overlap: number;
  /** Copies in Main carrying each Role (a card with two roles counts in both). */
  roles: Record<Role, number>;
  /** Copies in Main by Opening Quality for the compared turn order. */
  quality: { desirable: number; neutral: number; undesirable: number; unset: number };
}

export type DeckScoreResult = DeckScore | { error: string };

/**
 * Measure a deck against the Hand Goals it carries. Everything is exact: one
 * pass over the hand space, no sampling.
 */
export function scoreDeck(doc: MappingDocument): DeckScoreResult {
  const mainSize = sectionSize(doc.main);
  const context = analysisContextOf(doc);
  const sample = observedCards(context, doc.analysis.opening_hand_size);
  if (mainSize === 0) return { error: "This deck has no Main Deck cards." };
  if (sample > mainSize) {
    return { error: `The Main Deck has ${mainSize} cards, fewer than the ${sample} drawn.` };
  }

  const conditionIds = doc.hand_conditions.map((condition) => condition.id);
  const analysis = analyzeHandConditions(
    doc.main,
    sample,
    doc.hand_conditions,
    [
      ...doc.hand_condition_sets,
      { id: ANY_GOAL, name: "Any condition", condition_ids: conditionIds },
    ],
    groupsToMembership(doc.groups),
    context.turn_order,
  );
  const any = analysis.sets.find((set) => set.id === ANY_GOAL);
  const none = any?.distribution.weights[0] ?? 0n;
  const ratio = (weight: bigint): number =>
    analysis.total === 0n ? 0 : Number((weight * 1_000_000n) / analysis.total) / 1_000_000;
  const atLeastTwo = (any?.distribution.weights ?? []).slice(2).reduce((sum, w) => sum + w, 0n);

  const roles = Object.fromEntries(ROLES.map((role) => [role, 0])) as Record<Role, number>;
  const quality = { desirable: 0, neutral: 0, undesirable: 0, unset: 0 };
  for (const card of doc.main) {
    for (const role of card.taxonomy.roles) roles[role] += card.quantity;
    const value = openingQualityForTurn(card.taxonomy.opening_quality, context.turn_order);
    if (value === "desirable" || value === "neutral" || value === "undesirable") {
      quality[value] += card.quantity;
    } else {
      quality.unset += card.quantity;
    }
  }

  return {
    name: doc.name,
    mainSize,
    sample,
    total: analysis.total,
    goals: analysis.sets
      .filter((set) => set.id !== ANY_GOAL && set.conditionIds.length > 0)
      .map((set) => ({
        id: set.id,
        name: set.name,
        probability: set.union,
        weight: set.unionWeight,
      })),
    anyMatch: 1 - ratio(none),
    brick: ratio(none),
    overlap: ratio(atLeastTwo),
    roles,
    quality,
  };
}

/**
 * Give the other deck the same yardstick as this one: this deck's Groups, Hand
 * Conditions, Hand Goals and analysis settings, and for every card it shares,
 * this deck's roles and opening quality (the other deck's own annotations win
 * when it has any).
 */
export function inheritModels(base: MappingDocument, other: MappingDocument): MappingDocument {
  const known = new Map<number, MappingCard>();
  for (const card of [...base.main, ...base.extra, ...base.side]) known.set(card.card_id, card);
  const annotated = (card: MappingCard): MappingCard => {
    const own = card.taxonomy;
    const hasOwn =
      own.roles.length > 0 ||
      own.opening_quality.going_first !== null ||
      own.opening_quality.going_second !== null;
    const shared = known.get(card.card_id);
    return hasOwn || !shared ? card : { ...card, taxonomy: shared.taxonomy };
  };
  return {
    ...base,
    name: other.name,
    main: other.main.map(annotated),
    extra: other.extra.map(annotated),
    side: other.side.map(annotated),
    configurations: [],
    active_configuration_id: null,
  };
}

export interface CardDelta {
  card_id: number;
  /** Copies in the other deck minus copies in this one. */
  delta: number;
}

/** Main Deck differences: cards the other deck adds (+) and drops (-). */
export function mainDifferences(base: MappingDocument, other: MappingDocument): CardDelta[] {
  const copies = (doc: MappingDocument) => {
    const map = new Map<number, number>();
    for (const card of doc.main) map.set(card.card_id, (map.get(card.card_id) ?? 0) + card.quantity);
    return map;
  };
  const a = copies(base);
  const b = copies(other);
  const ids = new Set([...a.keys(), ...b.keys()]);
  return [...ids]
    .map((card_id) => ({ card_id, delta: (b.get(card_id) ?? 0) - (a.get(card_id) ?? 0) }))
    .filter((row) => row.delta !== 0)
    .sort((x, y) => y.delta - x.delta || x.card_id - y.card_id);
}
