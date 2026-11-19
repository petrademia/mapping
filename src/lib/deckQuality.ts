import type { MappingCard } from "./document";
import { openingQualityForTurn, type OpeningQualityValue } from "./taxonomy";

type TurnOrder = "going_first" | "going_second";

/** A way the deck view groups cards by the Opening Quality you set for one turn order. */
export type QualityKey = "desirable" | "neutral" | "undesirable" | "unset";

export const QUALITY_CHIPS: readonly { key: QualityKey; label: string }[] = [
  { key: "desirable", label: "Desirable" },
  { key: "neutral", label: "Neutral" },
  { key: "undesirable", label: "Undesirable" },
  { key: "unset", label: "Not set" },
];

/** A card's quality for a turn order. Not set (null) is its own state, not the same as Neutral. */
export function qualityOf(card: MappingCard, turn: TurnOrder): QualityKey {
  const value: OpeningQualityValue = openingQualityForTurn(card.taxonomy.opening_quality, turn);
  return value ?? "unset";
}

/** Copies in each state, so "Undesirable 7" is seven physical cards. */
export function qualityCounts(cards: readonly MappingCard[], turn: TurnOrder): Record<QualityKey, number> {
  const counts: Record<QualityKey, number> = { desirable: 0, neutral: 0, undesirable: 0, unset: 0 };
  for (const card of cards) counts[qualityOf(card, turn)] += card.quantity;
  return counts;
}

const QUALITY_ORDER: readonly QualityKey[] = ["desirable", "neutral", "undesirable", "unset"];

/** Where a card sorts by quality: Desirable first, Not set last. */
export function qualityIndex(card: MappingCard, turn: TurnOrder): number {
  return QUALITY_ORDER.indexOf(qualityOf(card, turn));
}
