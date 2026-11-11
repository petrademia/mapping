import { observedCards } from "./analysisContext";
import { analysisContextOf, sectionSize, type MappingDocument } from "./document";
import { groupsToMembership } from "./handCondition";
import { analyzeHandConditions } from "./handExplorer";
import { analyzeVersus, scenariosFor } from "./handtrapVersus";

/**
 * The scorecard: three exact numbers about one Hand Goal, and one combined
 * number that is only as meaningful as the weights you give them.
 *
 * - Opens: how often a hand meets the Hand Goal.
 * - Resilient: how often it still does after the opponent's handtraps, in the
 *   worst case over the handtraps and pairs you defined.
 * - Interaction: how often a hand holds at least one card with the Interaction role.
 */
export interface ScorecardWeights {
  opens: number;
  resilient: number;
  interaction: number;
}

export const DEFAULT_WEIGHTS: ScorecardWeights = { opens: 1, resilient: 1, interaction: 1 };

export interface ScenarioSurvival {
  label: string;
  probability: number;
}

export interface Scorecard {
  goalId: string;
  goalName: string;
  /** Cards drawn (5, or 6 going second on the first turn). */
  sample: number;
  mainSize: number;
  opens: number;
  /** Worst case over every scenario; null until a handtrap is defined. */
  resilient: number | null;
  /** The scenario that gives `resilient`. */
  worstScenario: string | null;
  scenarios: ScenarioSurvival[];
  /** P(at least one Interaction card in hand); null when no card has the role. */
  interaction: number | null;
  interactionCopies: number;
  /** Weighted mean of the numbers above that exist; null when no weight is left. */
  combined: number | null;
  /** The weights actually used, after dropping missing numbers. */
  usedWeights: Partial<ScorecardWeights>;
  /** Why a number is missing. */
  notes: string[];
}

export type ScorecardResult = Scorecard | { error: string };

/** The Hand Goals that can be scored: those with at least one Hand Condition. */
export function scorableGoals(doc: MappingDocument): { id: string; name: string }[] {
  return doc.hand_condition_sets
    .filter((set) => set.condition_ids.some((id) => doc.hand_conditions.some((c) => c.id === id)))
    .map((set) => ({ id: set.id, name: set.name }));
}

/** P(at least one of `special` cards among `sample` drawn from `deck`), exact. */
export function atLeastOne(deck: number, special: number, sample: number): number {
  if (special <= 0 || sample <= 0) return 0;
  if (special >= deck || sample > deck - special) return 1;
  let none = 1;
  for (let i = 0; i < sample; i += 1) none *= (deck - special - i) / (deck - i);
  return 1 - none;
}

export function combine(
  numbers: Partial<Record<keyof ScorecardWeights, number | null>>,
  weights: ScorecardWeights,
): { combined: number | null; used: Partial<ScorecardWeights> } {
  const used: Partial<ScorecardWeights> = {};
  let sum = 0;
  let total = 0;
  for (const key of ["opens", "resilient", "interaction"] as const) {
    const value = numbers[key];
    const weight = Math.max(0, weights[key]);
    if (value === null || value === undefined || weight === 0) continue;
    used[key] = weight;
    sum += weight * value;
    total += weight;
  }
  return { combined: total === 0 ? null : sum / total, used };
}

export function scorecard(
  doc: MappingDocument,
  goalId: string | null,
  weights: ScorecardWeights = DEFAULT_WEIGHTS,
): ScorecardResult {
  const mainSize = sectionSize(doc.main);
  const context = analysisContextOf(doc);
  const sample = observedCards(context, doc.analysis.opening_hand_size);
  if (mainSize === 0) return { error: "This deck has no Main Deck cards." };
  if (sample > mainSize) {
    return { error: `The Main Deck has ${mainSize} cards, fewer than the ${sample} drawn.` };
  }

  const goals = scorableGoals(doc);
  const goal =
    goals.find((entry) => entry.id === goalId) ??
    goals.find((entry) => entry.id === doc.engine_access_set_id) ??
    goals[0];
  if (!goal) return { error: "Define a Hand Goal with at least one Hand Condition first." };

  const analysis = analyzeHandConditions(
    doc.main,
    sample,
    doc.hand_conditions,
    doc.hand_condition_sets,
    groupsToMembership(doc.groups),
    context.turn_order,
  );
  const opens = analysis.sets.find((set) => set.id === goal.id)?.union ?? 0;

  const notes: string[] = [];
  let resilient: number | null = null;
  let worstScenario: string | null = null;
  const scenarios: ScenarioSurvival[] = [];
  const scenarioList = scenariosFor(doc);
  if (scenarioList.length === 0) {
    notes.push("Add a handtrap in the Handtraps tab to measure resilience.");
  } else {
    const versus = analyzeVersus(doc, scenarioList);
    if ("error" in versus) {
      notes.push(versus.error);
    } else {
      for (const result of versus.scenarios) {
        const row = result.goals.find((item) => item.setId === goal.id);
        if (!row) continue;
        scenarios.push({ label: result.scenario.label, probability: row.probability });
      }
      const worst = scenarios.reduce<ScenarioSurvival | null>(
        (low, item) => (low === null || item.probability < low.probability ? item : low),
        null,
      );
      resilient = worst?.probability ?? null;
      worstScenario = worst?.label ?? null;
    }
  }

  const interactionCopies = doc.main.reduce(
    (sum, card) => sum + (card.taxonomy.roles.includes("interaction") ? card.quantity : 0),
    0,
  );
  let interaction: number | null = null;
  if (interactionCopies === 0) {
    notes.push("No card has the Interaction role. Mark them in the deck list to measure it.");
  } else {
    interaction = atLeastOne(mainSize, interactionCopies, sample);
  }

  const { combined, used } = combine({ opens, resilient, interaction }, weights);
  return {
    goalId: goal.id,
    goalName: goal.name,
    sample,
    mainSize,
    opens,
    resilient,
    worstScenario,
    scenarios,
    interaction,
    interactionCopies,
    combined,
    usedWeights: used,
    notes,
  };
}
