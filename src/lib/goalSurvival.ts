import type { TurnOrder } from "./analysisContext";
import type { MappingDocument } from "./document";
import type { Handtrap } from "./handtrap";
import { analyzeVersus } from "./handtrapVersus";
import { TURN_CONTEXTS } from "./scorecard";
import { rolesForTurn } from "./turnRoles";

/** How many interruptions each Hand Goal can take, for one turn order. */
export interface GoalSurvival {
  /** P(the goal still holds) after 1 interruption, and after 2. */
  afterOne: number | null;
  afterTwo: number | null;
}

export interface GoalSurvivalRequest {
  doc: MappingDocument;
  turnOrder: TurnOrder;
}

export type GoalSurvivalResult = { error: string } | { survival: Record<string, GoalSurvival> };

/**
 * For every Hand Goal with a Hand Condition: the chance it still holds after 1 and after 2
 * interruptions. Each interruption stops the card in your hand that hurts most, so no handtrap
 * has to be defined. One exact pass answers every goal at once. This is the same figure the
 * Scorecard's interruption table gives for its goal.
 */
export function computeGoalSurvival({ doc, turnOrder }: GoalSurvivalRequest): GoalSurvivalResult {
  const goals = doc.hand_condition_sets.filter((set) => set.condition_ids.length > 0);
  if (goals.length === 0) return { survival: {} };
  const context = turnOrder === "going_first" ? TURN_CONTEXTS.first : TURN_CONTEXTS.second;
  const scoped: MappingDocument = {
    ...doc,
    main: rolesForTurn(doc.main, turnOrder),
    analysis: { ...doc.analysis, ...context },
  };
  const everyCard: Handtrap = {
    id: "__interruption",
    name: "Any interruption",
    hits: scoped.main.map((card) => card.card_id),
  };
  const outcome = analyzeVersus(
    { ...scoped, handtraps: [...scoped.handtraps, everyCard] },
    [1, 2].map((stops) => ({
      id: `__interruptions-${stops}`,
      label: `${stops} ${stops === 1 ? "interruption" : "interruptions"}`,
      handtrapIds: Array<string>(stops).fill(everyCard.id),
    })),
    { opponent: "worst_case", goalIds: goals.map((goal) => goal.id) },
  );
  if ("error" in outcome) return { error: outcome.error };
  const survival: Record<string, GoalSurvival> = {};
  for (const goal of goals) {
    const at = (index: number): number | null =>
      outcome.scenarios[index]?.goals.find((entry) => entry.setId === goal.id)?.probability ?? null;
    survival[goal.id] = { afterOne: at(0), afterTwo: at(1) };
  }
  return { survival };
}
