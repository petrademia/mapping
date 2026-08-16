/** Turn-order / observation-point context for opening-hand statistics. */

export const TURN_ORDERS = ["going_first", "going_second"] as const;
export type TurnOrder = (typeof TURN_ORDERS)[number];

export const OBSERVATION_POINTS = ["opening_hand", "first_turn"] as const;
export type ObservationPoint = (typeof OBSERVATION_POINTS)[number];

/**
 * Scenario under which MAPPING evaluates composition probabilities.
 * Not a card taxonomy label and not an Access Condition.
 */
export interface AnalysisContext {
  turn_order: TurnOrder;
  observation_point: ObservationPoint;
}

export const DEFAULT_ANALYSIS_CONTEXT: AnalysisContext = {
  turn_order: "going_first",
  observation_point: "opening_hand",
};

/** Preset used by the compact segmented control. */
export type AnalysisContextPreset =
  | "going_first_opening"
  | "going_second_opening"
  | "going_second_first_turn";

export function normalizeAnalysisContext(
  raw: Partial<AnalysisContext> | null | undefined,
): AnalysisContext {
  const turn_order: TurnOrder =
    raw?.turn_order === "going_second" ? "going_second" : "going_first";
  let observation_point: ObservationPoint =
    raw?.observation_point === "first_turn" ? "first_turn" : "opening_hand";
  // Going first has no distinct "first turn" sample in v0.
  if (turn_order === "going_first" && observation_point === "first_turn") {
    observation_point = "opening_hand";
  }
  return { turn_order, observation_point };
}

export function analysisContextFromPreset(
  preset: AnalysisContextPreset,
): AnalysisContext {
  switch (preset) {
    case "going_first_opening":
      return { turn_order: "going_first", observation_point: "opening_hand" };
    case "going_second_opening":
      return { turn_order: "going_second", observation_point: "opening_hand" };
    case "going_second_first_turn":
      return { turn_order: "going_second", observation_point: "first_turn" };
  }
}

export function analysisContextPreset(
  context: AnalysisContext,
): AnalysisContextPreset {
  const normalized = normalizeAnalysisContext(context);
  if (
    normalized.turn_order === "going_second" &&
    normalized.observation_point === "first_turn"
  ) {
    return "going_second_first_turn";
  }
  if (normalized.turn_order === "going_second") {
    return "going_second_opening";
  }
  return "going_first_opening";
}

/**
 * Effective cards-seen sample size for combinatorial analysis.
 * Opening hand remains `openingHandSize` for both turn orders.
 * Going second + by first turn adds the normal draw (+1).
 */
export function observedCards(
  context: AnalysisContext,
  openingHandSize: number = 5,
): number {
  if (!Number.isInteger(openingHandSize) || openingHandSize < 0) {
    throw new Error("opening_hand_size must be a non-negative integer");
  }
  const normalized = normalizeAnalysisContext(context);
  if (
    normalized.turn_order === "going_second" &&
    normalized.observation_point === "first_turn"
  ) {
    return openingHandSize + 1;
  }
  return openingHandSize;
}

export function isOpeningHandObservation(context: AnalysisContext): boolean {
  return (
    normalizeAnalysisContext(context).observation_point === "opening_hand"
  );
}

export function analysisContextLabel(
  context: AnalysisContext,
  openingHandSize: number = 5,
): string {
  const sample = observedCards(context, openingHandSize);
  const normalized = normalizeAnalysisContext(context);
  if (normalized.turn_order === "going_first") {
    return `Going First — Opening ${openingHandSize}`;
  }
  if (normalized.observation_point === "opening_hand") {
    return `Going Second — Opening ${openingHandSize}`;
  }
  return `Going Second — First ${sample} Cards Seen`;
}

export function sampleSizeDescription(
  context: AnalysisContext,
  openingHandSize: number = 5,
): string {
  const sample = observedCards(context, openingHandSize);
  if (isOpeningHandObservation(context)) {
    return `opening hand (${sample} cards)`;
  }
  return `first ${sample} cards seen (opening ${openingHandSize} + normal draw)`;
}
