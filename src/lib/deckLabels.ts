import type { MappingCard } from "./document";
import type { DerivedLabels } from "./derivedLabels";

/** A label the deck view can spotlight: every other card is dimmed. */
export type Spotlight = "all" | "starter" | "extender" | "interaction" | "breaker" | "brick";

/** The chips, in the order the Label sort groups cards. */
export const SPOTLIGHTS: readonly { key: Spotlight; label: string }[] = [
  { key: "all", label: "All" },
  { key: "starter", label: "Starters" },
  { key: "extender", label: "Extenders" },
  { key: "interaction", label: "Interaction" },
  { key: "breaker", label: "Breakers" },
  { key: "brick", label: "Bricks" },
];

export type CardLabel = Exclude<Spotlight, "all">;

/** The order cards group in when sorted by label: a card shows under the first label it has. */
const LABEL_ORDER: readonly CardLabel[] = ["starter", "extender", "interaction", "breaker", "brick"];

/**
 * Which labels a card has. Starter, Extender and Brick are read from the Hand Conditions when a Hand
 * Goal exists (`derived`), otherwise Starter and Extender come from the tags. A Brick is only known
 * from the Hand Conditions. Interaction (which includes your lingering handtraps) and Breaker are the
 * tags you set by hand.
 */
export function labelsOf(card: MappingCard, derived: DerivedLabels | undefined): Record<CardLabel, boolean> {
  const roles = card.taxonomy.roles;
  return {
    starter: derived ? derived.starter : roles.includes("starter"),
    extender: derived ? derived.extender : roles.includes("extender"),
    interaction: roles.includes("interaction") || roles.includes("lingering") || roles.includes("lingering_second"),
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
  const counts: Record<Spotlight, number> = { all: 0, starter: 0, extender: 0, interaction: 0, breaker: 0, brick: 0 };
  for (const card of cards) {
    counts.all += card.quantity;
    const flags = labelsOf(card, derivedOf(card));
    for (const key of LABEL_ORDER) if (flags[key]) counts[key] += card.quantity;
  }
  return counts;
}

/** Where a card sorts by label: Starters, Extenders, Interaction, Breakers, Bricks, then unlabelled. */
export function labelIndex(card: MappingCard, derived: DerivedLabels | undefined): number {
  const flags = labelsOf(card, derived);
  const at = LABEL_ORDER.findIndex((key) => flags[key]);
  return at === -1 ? LABEL_ORDER.length : at;
}
