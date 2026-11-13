import type { MappingDocument } from "./document";
import { handVersus } from "./handtrapVersus";
import {
  COMPONENT_LABELS,
  combine,
  type ComponentKey,
  type ScorecardSettings,
  type TurnScore,
} from "./scorecard";
import { openingQualityForTurn } from "./taxonomy";

/**
 * The Scorecard's numbers are each the chance that a yes/no check passes for a
 * random hand. This runs the same checks on one hand: a hand's rating is the
 * weighted share of those checks it passes, with the same weights. Averaged over
 * every possible hand of that size it equals the deck's combined number, so a
 * hand can be read against the deck average.
 *
 * Which checks exist, the brick tolerance and the worst handtrap scenario all
 * come from the deck's own `TurnScore`, so the hand and the deck cannot disagree
 * about what is being measured.
 */
export interface HandCheck {
  key: ComponentKey;
  label: string;
  /** null when the deck has nothing to measure it with. */
  passed: boolean | null;
  detail: string;
}

export interface HandRating {
  checks: HandCheck[];
  /** Weighted share of the measured checks passed; null when none count. */
  score: number | null;
  /** The deck's average rating for a hand of this kind (its combined number). */
  deckAverage: number | null;
}

export function rateHand(
  doc: MappingDocument,
  counts: Readonly<Record<number, number>>,
  goalId: string,
  turn: TurnScore,
  settings: ScorecardSettings,
): HandRating {
  const holds = handVersus(doc, counts, []).find((goal) => goal.setId === goalId)?.holds ?? false;
  const checks: HandCheck[] = [];

  checks.push({
    key: "opens",
    label: COMPONENT_LABELS.opens,
    passed: holds,
    detail: holds ? "meets the Hand Goal" : "does not meet the Hand Goal",
  });

  // Clean: the goal with at most the allowed bricks. A brick is a card whose
  // Opening Quality for this turn order is Undesirable.
  if (turn.clean === null) {
    checks.push({ key: "clean", label: COMPONENT_LABELS.clean, passed: null, detail: "no card is marked as a brick" });
  } else {
    let bricks = 0;
    for (const card of doc.main) {
      if (openingQualityForTurn(card.taxonomy.opening_quality, turn.turnOrder) === "undesirable") {
        bricks += counts[card.card_id] ?? 0;
      }
    }
    const allowed = settings.brickTolerance;
    checks.push({
      key: "clean",
      label: COMPONENT_LABELS.clean,
      passed: holds && bricks <= allowed,
      detail: `${bricks} ${bricks === 1 ? "brick" : "bricks"} in hand, up to ${allowed} allowed`,
    });
  }

  // Resilient: against the same worst opponent hand the deck number uses.
  if (turn.resilient === null) {
    checks.push({ key: "resilient", label: COMPONENT_LABELS.resilient, passed: null, detail: "no handtrap defined" });
  } else {
    const survives = handVersus(doc, counts, turn.worstScenarioIds).find((goal) => goal.setId === goalId)?.survives;
    const passed = holds && survives === true;
    checks.push({
      key: "resilient",
      label: COMPONENT_LABELS.resilient,
      passed,
      detail: !holds
        ? "does not meet the Hand Goal to begin with"
        : passed
          ? `still meets it against ${turn.worstScenario}`
          : `broken by ${turn.worstScenario}`,
    });
  }

  if (turn.interaction === null) {
    checks.push({ key: "interaction", label: COMPONENT_LABELS.interaction, passed: null, detail: "no card has the role" });
  } else {
    let inHand = 0;
    for (const card of doc.main) {
      if (card.taxonomy.roles.includes("interaction")) inHand += counts[card.card_id] ?? 0;
    }
    checks.push({
      key: "interaction",
      label: COMPONENT_LABELS.interaction,
      passed: inHand > 0,
      detail: `${inHand} Interaction ${inHand === 1 ? "card" : "cards"} in hand`,
    });
  }

  if (turn.lasting !== null) {
    let inHand = 0;
    for (const card of doc.main) {
      const roles = card.taxonomy.roles;
      const usable =
        roles.includes("lasting") || (turn.turnOrder === "going_second" && roles.includes("lasting_second"));
      if (usable) inHand += counts[card.card_id] ?? 0;
    }
    checks.push({
      key: "lasting",
      label: COMPONENT_LABELS.lasting,
      passed: inHand > 0,
      detail: `${inHand} lasting ${inHand === 1 ? "handtrap" : "handtraps"} in hand`,
    });
  }

  const numbers: Partial<Record<ComponentKey, number | null>> = {};
  for (const check of checks) numbers[check.key] = check.passed === null ? null : check.passed ? 1 : 0;
  return { checks, score: combine(numbers, settings), deckAverage: turn.combined };
}
