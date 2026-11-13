import { normalizeAnalysisContext, observedCards, type AnalysisContext, type TurnOrder } from "./analysisContext";
import { sectionSize, type MappingDocument } from "./document";
import { groupsToMembership, type HandCondition, type HandConditionSet } from "./handCondition";
import { analyzeHandConditions } from "./handExplorer";
import { analyzeVersus, scenariosFor } from "./handtrapVersus";
import type { Handtrap } from "./handtrap";
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
 * - Lingering: how often a hand holds enough disruption points. A one-shot Interaction card is
 *   worth 1 point and a lingering handtrap that works in this turn order is worth `lingeringWorth`,
 *   because it keeps taxing the opponent all turn. The hand needs `disruptionNeeded` points.
 *   Counted only when you give it a weight.
 *
 * Everything is exact. The combined numbers are weighted means, so they only
 * mean what the weights you choose make them mean.
 */
export interface ScorecardWeights {
  opens: number;
  clean: number;
  resilient: number;
  interaction: number;
  /** Off by default: the headline stays the same until you choose to count it. */
  lingering: number;
  /** How much going first and going second each count toward the overall number. */
  first: number;
  second: number;
}

export const DEFAULT_WEIGHTS: ScorecardWeights = {
  opens: 1,
  clean: 1,
  resilient: 1,
  interaction: 1,
  lingering: 0,
  first: 1,
  second: 1,
};

export interface ScorecardSettings extends ScorecardWeights {
  /** Bricks a hand may hold and still count as clean (0 to BRICK_CURVE_MAX). */
  brickTolerance: number;
  /** Points one lingering handtrap is worth; a one-shot Interaction card is worth 1. */
  lingeringWorth: number;
  /** Points a hand needs to count as disrupting. */
  disruptionNeeded: number;
}

export const DEFAULT_SETTINGS: ScorecardSettings = {
  ...DEFAULT_WEIGHTS,
  brickTolerance: 1,
  lingeringWorth: 2,
  disruptionNeeded: 2,
};

/** The most points a lingering handtrap can be worth, and a hand can be asked for. */
export const MAX_DISRUPTION_POINTS = 6;

/** The brick curve is measured for 0 up to this many bricks. */
export const BRICK_CURVE_MAX = 3;

/** The interruption curve is measured for 0 up to this many interruptions. */
export const INTERRUPTION_CURVE_MAX = 3;

/**
 * The average of a curve over a range of interruptions, each count weighted equally: the
 * survival to expect when the opponent holds anywhere from `from` to `to` handtraps.
 * null when the curve does not reach that far.
 */
export function rangeMean(curve: readonly number[], from: number, to: number): number | null {
  if (from < 0 || to < from || to >= curve.length) return null;
  const values = curve.slice(from, to + 1);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

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
  /**
   * P(the goal still holds) after 0, 1, 2 .. INTERRUPTION_CURVE_MAX interruptions, each
   * stopping any one card in hand, worst case. Index 0 is Opens. Empty if it could not be computed.
   */
  interruptions: number[];
  /**
   * The same curve when the opponent goes for the cards on the document's `hit_priority`
   * list first. Empty when there is no list. Not part of the combined number.
   */
  interruptionsPriority: number[];
  /** Resilient when the opponent follows the list; null without a list or a handtrap. */
  resilientPriority: number | null;
  /** P(at least one Interaction card); null when no card has the role. */
  interaction: number | null;
  /** P(disruption points >= the number needed); null when no lingering handtrap is usable this turn order. */
  lingering: number | null;
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
  lingering: "Disruption",
} as const;

export type ComponentKey = keyof typeof COMPONENT_LABELS;

/** Extra measures: shown, but not the weakest part and not reported as missing. */
const OPTIONAL_KEYS: readonly ComponentKey[] = ["lingering"];
const CORE_KEYS = (Object.keys(COMPONENT_LABELS) as ComponentKey[]).filter((key) => !OPTIONAL_KEYS.includes(key));

/** The measured number that is lowest for a turn order: the place to look first. */
export function weakest(turn: TurnScore): { key: ComponentKey; value: number } | null {
  let low: { key: ComponentKey; value: number } | null = null;
  for (const key of CORE_KEYS) {
    const value = turn[key];
    if (value !== null && (low === null || value < low.value)) low = { key, value };
  }
  return low;
}

/** The numbers that could not be measured for a turn order. */
export function unmeasured(turn: TurnScore): ComponentKey[] {
  return CORE_KEYS.filter((key) => turn[key] === null);
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

const NUMBER_KEYS = ["opens", "clean", "resilient", "interaction", "lingering"] as const;

/**
 * The disruption cards that work in a turn order: lingering handtraps (the "both" ones, plus the
 * "going second only" ones going second) and one-shot Interaction cards, which exclude any card
 * that is already counted as lingering.
 */
export function disruptionCards(doc: MappingDocument, turnOrder: TurnOrder): { oneShot: number; lingering: number } {
  let oneShot = 0;
  let lingering = 0;
  for (const card of doc.main) {
    const roles = card.taxonomy.roles;
    if (roles.includes("lingering") || (turnOrder === "going_second" && roles.includes("lingering_second"))) {
      lingering += card.quantity;
    } else if (roles.includes("interaction")) {
      oneShot += card.quantity;
    }
  }
  return { oneShot, lingering };
}

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 0; i < Math.min(k, n - k); i += 1) result = (result * (n - i)) / (i + 1);
  return result;
}

/**
 * P(a hand of `sample` cards holds at least `needed` disruption points), exact: each of the
 * `oneShot` cards is worth 1 point and each of the `lingering` cards `worth` points.
 */
export function disruptionAtLeast(
  deck: number,
  oneShot: number,
  lingering: number,
  sample: number,
  worth: number,
  needed: number,
): number {
  const rest = deck - oneShot - lingering;
  const total = choose(deck, sample);
  if (total === 0) return 0;
  let hits = 0;
  for (let l = 0; l <= Math.min(lingering, sample); l += 1) {
    for (let o = 0; o <= Math.min(oneShot, sample - l); o += 1) {
      const others = sample - l - o;
      if (others > rest || o + worth * l < needed) continue;
      hits += choose(lingering, l) * choose(oneShot, o) * choose(rest, others);
    }
  }
  return hits / total;
}

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

  // How many interruptions the goal can take, with no handtrap defined: each one
  // stops any one card in your hand, and the opponent picks the card that hurts most.
  // A hand with one route ends its turn on the first; two independent routes take one.
  const everyCard: Handtrap = {
    id: "__interruption",
    name: "Any interruption",
    hits: doc.main.map((card) => card.card_id),
  };
  const curveFor = (opponent: "worst_case" | "priority"): number[] => {
    const curve = analyzeVersus(
      { ...scoped, handtraps: [...scoped.handtraps, everyCard] },
      Array.from({ length: INTERRUPTION_CURVE_MAX }, (_, index) => ({
        id: `__interruptions-${index + 1}`,
        label: `${index + 1} ${index === 0 ? "interruption" : "interruptions"}`,
        handtrapIds: Array<string>(index + 1).fill(everyCard.id),
      })),
      { opponent },
    );
    if ("error" in curve) return [];
    return [
      opens,
      ...curve.scenarios.map((result) => result.goals.find((item) => item.setId === goal.id)?.probability ?? 0),
    ];
  };
  const interruptions = curveFor("worst_case");

  // The same, for an opponent who goes for the cards on your priority list first.
  let interruptionsPriority: number[] = [];
  let resilientPriority: number | null = null;
  if (doc.hit_priority.length > 0) {
    interruptionsPriority = curveFor("priority");
    if (scenarioList.length > 0) {
      const followed = analyzeVersus(scoped, scenarioList, { opponent: "priority" });
      if (!("error" in followed)) {
        const lows = followed.scenarios
          .map((result) => result.goals.find((item) => item.setId === goal.id)?.probability)
          .filter((value): value is number => value !== undefined);
        resilientPriority = lows.length > 0 ? Math.min(...lows) : null;
      }
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
  const disruption = disruptionCards(doc, turnOrder);
  const lingering =
    disruption.lingering === 0
      ? null
      : disruptionAtLeast(
          mainSize,
          disruption.oneShot,
          disruption.lingering,
          sample,
          settings.lingeringWorth,
          settings.disruptionNeeded,
        );

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
    interruptions,
    interruptionsPriority,
    resilientPriority,
    interaction,
    lingering,
    combined: combine({ opens, clean, resilient, interaction, lingering }, settings),
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
