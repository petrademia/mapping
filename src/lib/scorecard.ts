import { normalizeAnalysisContext, observedCards, type AnalysisContext, type TurnOrder } from "./analysisContext";
import { sectionSize, type MappingDocument } from "./document";
import { groupsToMembership, type HandCondition, type HandConditionSet } from "./handCondition";
import { analyzeHandConditions } from "./handExplorer";
import { analyzeVersus, scenariosFor } from "./handtrapVersus";
import { openingQualityForTurn } from "./taxonomy";

/**
 * The scorecard measures one Hand Goal, separately for going first and going
 * second, in terms of how the Main Deck's slots are spent.
 *
 * - Opens: how often a hand meets the Hand Goal.
 * - Clean: how often it meets it holding at most `brickTolerance` bricks, where a
 *   brick is a card whose Opening Quality for that turn order is Undesirable.
 *   Raising the tolerance shows how many bricks the deck can carry, which is
 *   what buys room for high-power cards that are dead in some hands.
 * - Resilient: how often it still meets it after the opponent's handtraps, worst case.
 * - Interaction: how often a hand holds at least one Interaction card.
 *
 * Everything is exact. The combined numbers are weighted means, so they only
 * mean what the weights you choose make them mean.
 */
export interface ScorecardWeights {
  opens: number;
  clean: number;
  resilient: number;
  interaction: number;
  /** How much going first and going second each count toward the overall number. */
  first: number;
  second: number;
}

export const DEFAULT_WEIGHTS: ScorecardWeights = {
  opens: 1,
  clean: 1,
  resilient: 1,
  interaction: 1,
  first: 1,
  second: 1,
};

export interface ScorecardSettings extends ScorecardWeights {
  /** Bricks a hand may hold and still count as clean (0 to BRICK_CURVE_MAX). */
  brickTolerance: number;
}

export const DEFAULT_SETTINGS: ScorecardSettings = { ...DEFAULT_WEIGHTS, brickTolerance: 1 };

/** The brick curve is measured for 0 up to this many bricks. */
export const BRICK_CURVE_MAX = 3;

/** The two situations measured: the opening hand going first, the first-turn hand going second. */
export const TURN_CONTEXTS: Record<"first" | "second", AnalysisContext> = {
  first: { turn_order: "going_first", observation_point: "opening_hand" },
  second: { turn_order: "going_second", observation_point: "first_turn" },
};

export interface ScenarioSurvival {
  label: string;
  probability: number;
  /** The handtraps in play, so one hand can be judged against the same scenario. */
  handtrapIds: string[];
}

export interface SlotMix {
  /** Copies by Opening Quality for this turn order. */
  desirable: number;
  neutral: number;
  undesirable: number;
  unset: number;
}

export interface TurnScore {
  turnOrder: TurnOrder;
  /** Cards in the hand measured. */
  sample: number;
  slots: SlotMix;
  opens: number;
  /** P(goal and at most `brickTolerance` bricks); null when no card is a brick. */
  clean: number | null;
  /** P(goal and at most k bricks) for k = 0 .. BRICK_CURVE_MAX; empty when no card is a brick. */
  brickCurve: number[];
  /** Worst case over every handtrap scenario; null until a handtrap is defined. */
  resilient: number | null;
  worstScenario: string | null;
  /** The handtraps of that worst scenario. */
  worstScenarioIds: string[];
  scenarios: ScenarioSurvival[];
  /** P(at least one Interaction card); null when no card has the role. */
  interaction: number | null;
  /** Weighted mean of the numbers that exist; null when no weight is left. */
  combined: number | null;
  notes: string[];
}

export interface Scorecard {
  goalId: string;
  goalName: string;
  mainSize: number;
  interactionCopies: number;
  brickTolerance: number;
  first: TurnScore;
  second: TurnScore;
  /** Mean of the two turn orders' combined numbers by the first/second weights. */
  overall: number | null;
}

export type ScorecardResult = Scorecard | { error: string };

export const COMPONENT_LABELS = {
  opens: "Opens",
  clean: "Clean",
  resilient: "Resilient",
  interaction: "Interaction",
} as const;

export type ComponentKey = keyof typeof COMPONENT_LABELS;

/** The measured number that is lowest for a turn order: the place to look first. */
export function weakest(turn: TurnScore): { key: ComponentKey; value: number } | null {
  let low: { key: ComponentKey; value: number } | null = null;
  for (const key of Object.keys(COMPONENT_LABELS) as ComponentKey[]) {
    const value = turn[key];
    if (value !== null && (low === null || value < low.value)) low = { key, value };
  }
  return low;
}

/** The numbers that could not be measured for a turn order. */
export function unmeasured(turn: TurnScore): ComponentKey[] {
  return (Object.keys(COMPONENT_LABELS) as ComponentKey[]).filter((key) => turn[key] === null);
}

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

const NUMBER_KEYS = ["opens", "clean", "resilient", "interaction"] as const;

/** A weighted mean over the numbers that exist and have weight; null when none do. */
export function combine(
  numbers: Partial<Record<(typeof NUMBER_KEYS)[number], number | null>>,
  weights: ScorecardWeights,
): number | null {
  let sum = 0;
  let total = 0;
  for (const key of NUMBER_KEYS) {
    const value = numbers[key];
    const weight = Math.max(0, weights[key]);
    if (value === null || value === undefined || weight === 0) continue;
    sum += weight * value;
    total += weight;
  }
  return total === 0 ? null : sum / total;
}

const BRICK_GROUP = "__brick";

function turnScore(
  doc: MappingDocument,
  context: AnalysisContext,
  goal: { id: string; name: string },
  settings: ScorecardSettings,
): TurnScore {
  const { turn_order: turnOrder } = normalizeAnalysisContext(context);
  const mainSize = sectionSize(doc.main);
  const sample = observedCards(context, doc.analysis.opening_hand_size);
  const notes: string[] = [];
  const scoped: MappingDocument = { ...doc, analysis: { ...doc.analysis, ...context } };

  // Slot mix and the cards that count as bricks in this turn order.
  const slots: SlotMix = { desirable: 0, neutral: 0, undesirable: 0, unset: 0 };
  const bricks = new Set<number>();
  for (const card of doc.main) {
    const quality = openingQualityForTurn(card.taxonomy.opening_quality, turnOrder);
    if (quality === "desirable" || quality === "neutral" || quality === "undesirable") {
      slots[quality] += card.quantity;
    } else {
      slots.unset += card.quantity;
    }
    if (quality === "undesirable") bricks.add(card.card_id);
  }

  // One exact pass: the Hand Goal itself, and for each tolerance k a copy of every
  // member condition that also allows at most k bricks.
  const goalSet = doc.hand_condition_sets.find((set) => set.id === goal.id)!;
  const members = [...new Set(goalSet.condition_ids)]
    .map((id) => doc.hand_conditions.find((condition) => condition.id === id))
    .filter((condition): condition is HandCondition => condition !== undefined);
  const extraConditions: HandCondition[] = [];
  const extraSets: HandConditionSet[] = [];
  if (bricks.size > 0) {
    for (let k = 0; k <= BRICK_CURVE_MAX; k += 1) {
      const ids: string[] = [];
      for (const member of members) {
        const id = `${member.id}::brick${k}`;
        ids.push(id);
        extraConditions.push({
          ...member,
          id,
          requirements: [
            ...member.requirements,
            { id: `${id}::req`, kind: "group", group_id: BRICK_GROUP, op: "lte", count: k },
          ],
        });
      }
      extraSets.push({ id: `__goal-brick-${k}`, name: goal.name, condition_ids: ids, aggregation: "any" });
    }
  } else {
    notes.push(
      `No card is marked Undesirable for ${turnOrder === "going_first" ? "going first" : "going second"}, so bricks are not measured. Mark them in the deck list.`,
    );
  }
  const groups = new Map(groupsToMembership(doc.groups));
  groups.set(BRICK_GROUP, bricks);
  const analysis = analyzeHandConditions(
    doc.main,
    sample,
    [...doc.hand_conditions, ...extraConditions],
    [...doc.hand_condition_sets, ...extraSets],
    groups,
    turnOrder,
  );
  const unionOf = (id: string): number => analysis.sets.find((set) => set.id === id)?.union ?? 0;
  const opens = unionOf(goal.id);
  const brickCurve =
    bricks.size > 0 ? Array.from({ length: BRICK_CURVE_MAX + 1 }, (_, k) => unionOf(`__goal-brick-${k}`)) : [];
  const clean = brickCurve.length > 0 ? (brickCurve[settings.brickTolerance] ?? null) : null;

  // Resilience against the handtraps defined in the Handtraps tab.
  let resilient: number | null = null;
  let worstScenario: string | null = null;
  let worstScenarioIds: string[] = [];
  const scenarios: ScenarioSurvival[] = [];
  const scenarioList = scenariosFor(doc);
  if (scenarioList.length === 0) {
    notes.push("Add a handtrap in the Handtraps tab to measure resilience.");
  } else {
    const versus = analyzeVersus(scoped, scenarioList);
    if ("error" in versus) {
      notes.push(versus.error);
    } else {
      for (const result of versus.scenarios) {
        const row = result.goals.find((item) => item.setId === goal.id);
        if (row) {
          scenarios.push({
            label: result.scenario.label,
            probability: row.probability,
            handtrapIds: [...result.scenario.handtrapIds],
          });
        }
      }
      const worst = scenarios.reduce<ScenarioSurvival | null>(
        (low, item) => (low === null || item.probability < low.probability ? item : low),
        null,
      );
      resilient = worst?.probability ?? null;
      worstScenario = worst?.label ?? null;
      worstScenarioIds = worst?.handtrapIds ?? [];
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

  return {
    turnOrder,
    sample,
    slots,
    opens,
    clean,
    brickCurve,
    resilient,
    worstScenario,
    worstScenarioIds,
    scenarios,
    interaction,
    combined: combine({ opens, clean, resilient, interaction }, settings),
    notes,
  };
}

export function scorecard(
  doc: MappingDocument,
  goalId: string | null,
  settings: ScorecardSettings = DEFAULT_SETTINGS,
): ScorecardResult {
  const mainSize = sectionSize(doc.main);
  if (mainSize === 0) return { error: "This deck has no Main Deck cards." };
  const biggest = Math.max(
    observedCards(TURN_CONTEXTS.first, doc.analysis.opening_hand_size),
    observedCards(TURN_CONTEXTS.second, doc.analysis.opening_hand_size),
  );
  if (biggest > mainSize) {
    return { error: `The Main Deck has ${mainSize} cards, fewer than the ${biggest} drawn.` };
  }

  const goals = scorableGoals(doc);
  const goal =
    goals.find((entry) => entry.id === goalId) ??
    goals.find((entry) => entry.id === doc.engine_access_set_id) ??
    goals[0];
  if (!goal) return { error: "Define a Hand Goal with at least one Hand Condition first." };

  const tolerance = Math.max(0, Math.min(BRICK_CURVE_MAX, Math.floor(settings.brickTolerance)));
  const used = { ...settings, brickTolerance: tolerance };
  const first = turnScore(doc, TURN_CONTEXTS.first, goal, used);
  const second = turnScore(doc, TURN_CONTEXTS.second, goal, used);

  const parts: { value: number; weight: number }[] = [];
  if (first.combined !== null && settings.first > 0) parts.push({ value: first.combined, weight: settings.first });
  if (second.combined !== null && settings.second > 0) parts.push({ value: second.combined, weight: settings.second });
  const total = parts.reduce((sum, part) => sum + part.weight, 0);
  const overall = total === 0 ? null : parts.reduce((sum, part) => sum + part.value * part.weight, 0) / total;

  return {
    goalId: goal.id,
    goalName: goal.name,
    mainSize,
    interactionCopies: doc.main.reduce(
      (sum, card) => sum + (card.taxonomy.roles.includes("interaction") ? card.quantity : 0),
      0,
    ),
    brickTolerance: tolerance,
    first,
    second,
    overall,
  };
}
