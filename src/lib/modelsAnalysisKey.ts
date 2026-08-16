import type { Group, HandCondition, HandConditionSet } from "./handCondition";
import type { MappingCard } from "./document";
import type { ConditionRequirement } from "./handExplorer";

function requirementKey(requirement: ConditionRequirement): string {
  if (requirement.kind === "card") {
    return `card:${requirement.card_id}:${requirement.op}:${requirement.count}`;
  }
  if (requirement.kind === "role") {
    return `role:${requirement.role}:${requirement.op}:${requirement.count}`;
  }
  return `group:${requirement.group_id}:${requirement.op}:${requirement.count}`;
}

function cardKey(card: MappingCard): string {
  const oq = card.taxonomy.opening_quality;
  return [
    card.card_id,
    card.quantity,
    card.taxonomy.roles.join(","),
    oq.going_first ?? "",
    oq.going_second ?? "",
  ].join(":");
}

/**
 * Structural fingerprint for Models probability analysis.
 * Ignores display fields (name / notes) so typing labels does not recompute.
 */
export function modelsAnalysisKey(input: {
  main: readonly MappingCard[];
  groups: readonly Group[];
  hand_conditions: readonly HandCondition[];
  hand_condition_sets: readonly HandConditionSet[];
  sample: number;
  turn_order: "going_first" | "going_second";
}): string {
  const groups = input.groups
    .map((group) => `${group.id}|${group.card_ids.join(",")}`)
    .join(";");
  const conditions = input.hand_conditions
    .map((condition) => {
      const requires = condition.requirements.map(requirementKey).join("&");
      const excludes = condition.excludes.map(requirementKey).join("&");
      return `${condition.id}|${requires}|${excludes}`;
    })
    .join(";");
  const sets = input.hand_condition_sets
    .map(
      (set) =>
        `${set.id}|${set.aggregation}|${set.condition_ids.join(",")}`,
    )
    .join(";");
  const main = input.main.map(cardKey).join(";");
  return [
    input.turn_order,
    String(input.sample),
    main,
    groups,
    conditions,
    sets,
  ].join("\n");
}
