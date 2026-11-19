import type { MappingCard } from "./document";
import type { DerivedLabels } from "./derivedLabels";

/** A label the deck view can spotlight: every other card is dimmed. */
export type Spotlight = "all" | "starter" | "extender" | "brick" | "breaker";

export const SPOTLIGHTS: readonly { key: Spotlight; label: string }[] = [
  { key: "all", label: "All" },
  { key: "starter", label: "Starters" },
  { key: "extender", label: "Extenders" },
  { key: "brick", label: "Bricks" },
  { key: "breaker", label: "Breakers" },
];

export type CardLabel = Exclude<Spotlight, "all">;

/** The order cards group in when sorted by label: a card shows under the first label it has. */
const LABEL_ORDER: readonly CardLabel[] = ["starter", "extender", "breaker", "brick"];

/**
 * Which labels a card has. Starter, Extender and Brick are read from the Hand Conditions when a Hand
 * Goal exists (`derived`), otherwise Starter and Extender come from the tags. A Brick is only known
 * from the Hand Conditions. Breaker is the tag you set by hand.
 */
export function labelsOf(card: MappingCard, derived: DerivedLabels | undefined): Record<CardLabel, boolean> {
  const roles = card.taxonomy.roles;
  return {
    starter: derived ? derived.starter : roles.includes("starter"),
    extender: derived ? derived.extender : roles.includes("extender"),
    brick: derived ? derived.brick : false,
    breaker: roles.includes("breaker") || roles.includes("breaker_second"),
  };
}

export function matchesSpotlight(card: MappingCard, derived: DerivedLabels | undefined, spotlight: Spotlight): boolean {
  return spotlight === "all" || labelsOf(card, derived)[spotlight];
}

/** Copies of each label in the cards, so "Bricks 9" is nine physical cards. */
export function spotlightCounts(
  cards: readonly MappingCard[],
  derivedOf: (card: MappingCard) => DerivedLabels | undefined,
): Record<Spotlight, number> {
  const counts: Record<Spotlight, number> = { all: 0, starter: 0, extender: 0, brick: 0, breaker: 0 };
  for (const card of cards) {
    counts.all += card.quantity;
    const flags = labelsOf(card, derivedOf(card));
    for (const key of LABEL_ORDER) if (flags[key]) counts[key] += card.quantity;
  }
  return counts;
}

/** Where a card sorts by label: Starters first, then Extenders, Breakers, Bricks, then unlabelled. */
export function labelIndex(card: MappingCard, derived: DerivedLabels | undefined): number {
  const flags = labelsOf(card, derived);
  const at = LABEL_ORDER.findIndex((key) => flags[key]);
  return at === -1 ? LABEL_ORDER.length : at;
}
