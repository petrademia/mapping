import { observedCards } from "./analysisContext";
import { computeCardImpact } from "./cardImpact";
import { isRanked, normalizeOrder, rankFor, type RankContext } from "./cardRank";
import { sectionSize, type MappingDocument } from "./document";
import { groupsToMembership } from "./handCondition";

export interface EffectiveRank {
  /** Every Main Deck card, best first. */
  order: number[];
  /**
   * "rank" is the order you set in the Rank tab; "impact" is the Card Impact
   * order of your Hand Goal, used until you rank your cards so scores appear
   * straight away.
   */
  source: "rank" | "impact";
}

/** The Hand Goal Card Impact is read from: the engine access goal, else the first with conditions. */
export function impactGoal(doc: MappingDocument) {
  return (
    doc.hand_condition_sets.find(
      (set) => set.id === doc.engine_access_set_id && set.condition_ids.length > 0,
    ) ??
    doc.hand_condition_sets.find((set) => set.condition_ids.length > 0) ??
    null
  );
}

/**
 * The order hands are scored by: your own ranking when you have set one,
 * otherwise the Card Impact order of your Hand Goal, otherwise none.
 */
export function effectiveRank(doc: MappingDocument, context: RankContext): EffectiveRank | null {
  if (isRanked(doc, context)) return { order: rankFor(doc, context), source: "rank" };
  const goal = impactGoal(doc);
  if (!goal) return null;
  const sample = observedCards(
    context === "going_first"
      ? { turn_order: "going_first", observation_point: "opening_hand" }
      : { turn_order: "going_second", observation_point: "first_turn" },
    doc.analysis.opening_hand_size,
  );
  if (sectionSize(doc.main) < sample) return null;
  try {
    const impact = computeCardImpact(
      doc.main,
      sample,
      doc.hand_conditions,
      goal,
      groupsToMembership(doc.groups),
    );
    return {
      order: normalizeOrder(
        impact.rows.map((row) => row.card_id),
        doc.main,
      ),
      source: "impact",
    };
  } catch {
    return null;
  }
}
