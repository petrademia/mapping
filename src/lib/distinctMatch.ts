import type { MappingCard } from "./document";
import {
  predicateContributors,
  type ConditionRequirement,
  type GroupMembership,
} from "./handExplorer";

export const DISTINCT_BY = ["card_name"] as const;
export type DistinctBy = (typeof DISTINCT_BY)[number];

/**
 * Requires selected presence-style (`>= 1`) requirements to be satisfied by
 * pairwise-different card identities (Konami/MyCard card_id = card name).
 */
export interface DistinctMatchConstraint {
  id: string;
  requirement_ids: string[];
  distinct_by: DistinctBy;
}

export interface DistinctMatchEvaluation {
  constraintId: string;
  requirement_ids: string[];
  distinct_by: DistinctBy;
  passed: boolean;
  /** Eligible card ids in the hand per requirement id. */
  eligible: Record<string, number[]>;
  /** Injective assignment requirement_id -> card_id when passed. */
  assignment: Record<string, number> | null;
  /** Human-readable reason when the constraint is invalid or fails. */
  detail: string | null;
}

/** v0: only presence predicates are eligible for distinct matching. */
export function isPresenceRequirement(
  requirement: ConditionRequirement,
): boolean {
  return requirement.op === "gte" && requirement.count === 1;
}

/**
 * Card identities in the hand that can satisfy a presence requirement.
 * Uses the same contributor rules as Hand Test traces (card / role / group).
 */
export function eligibleCardNames(
  hand: readonly number[],
  deck: readonly MappingCard[],
  requirement: ConditionRequirement,
  groups: GroupMembership = new Map(),
): number[] {
  if (!isPresenceRequirement(requirement)) return [];
  return predicateContributors(hand, deck, requirement, groups);
}

/**
 * Whether an injective assignment exists from each requirement id to a
 * distinct card_id drawn from that requirement's eligible set.
 */
export function findDistinctAssignment(
  eligibleByRequirement: ReadonlyMap<string, readonly number[]>,
  requirementIds: readonly string[],
): Record<string, number> | null {
  const assignment: Record<string, number> = {};
  const used = new Set<number>();

  function dfs(index: number): boolean {
    if (index === requirementIds.length) return true;
    const requirementId = requirementIds[index]!;
    const options = eligibleByRequirement.get(requirementId) ?? [];
    for (const cardId of options) {
      if (used.has(cardId)) continue;
      used.add(cardId);
      assignment[requirementId] = cardId;
      if (dfs(index + 1)) return true;
      used.delete(cardId);
      delete assignment[requirementId];
    }
    return false;
  }

  return dfs(0) ? { ...assignment } : null;
}

export function evaluateDistinctMatch(
  hand: readonly number[],
  deck: readonly MappingCard[],
  requirements: readonly ConditionRequirement[],
  constraint: DistinctMatchConstraint,
  groups: GroupMembership = new Map(),
): DistinctMatchEvaluation {
  const byId = new Map(
    requirements
      .filter(
        (requirement): requirement is ConditionRequirement & { id: string } =>
          Boolean(requirement.id),
      )
      .map((requirement) => [requirement.id, requirement]),
  );
  const requirementIds = [...new Set(constraint.requirement_ids.map((id) => id.trim()).filter(Boolean))];
  const eligible: Record<string, number[]> = {};

  if (constraint.distinct_by !== "card_name") {
    return {
      constraintId: constraint.id,
      requirement_ids: requirementIds,
      distinct_by: constraint.distinct_by,
      passed: false,
      eligible,
      assignment: null,
      detail: `unsupported distinct_by: ${constraint.distinct_by}`,
    };
  }

  if (requirementIds.length < 2) {
    return {
      constraintId: constraint.id,
      requirement_ids: requirementIds,
      distinct_by: constraint.distinct_by,
      passed: false,
      eligible,
      assignment: null,
      detail: "distinct match needs at least two requirements",
    };
  }

  const eligibleMap = new Map<string, number[]>();
  for (const requirementId of requirementIds) {
    const requirement = byId.get(requirementId);
    if (!requirement) {
      return {
        constraintId: constraint.id,
        requirement_ids: requirementIds,
        distinct_by: constraint.distinct_by,
        passed: false,
        eligible,
        assignment: null,
        detail: `missing requirement ${requirementId}`,
      };
    }
    if (!isPresenceRequirement(requirement)) {
      return {
        constraintId: constraint.id,
        requirement_ids: requirementIds,
        distinct_by: constraint.distinct_by,
        passed: false,
        eligible,
        assignment: null,
        detail: "distinct match only supports requirements of the form ≥ 1",
      };
    }
    const names = eligibleCardNames(hand, deck, requirement, groups);
    eligible[requirementId] = names;
    eligibleMap.set(requirementId, names);
  }

  const assignment = findDistinctAssignment(eligibleMap, requirementIds);
  return {
    constraintId: constraint.id,
    requirement_ids: requirementIds,
    distinct_by: constraint.distinct_by,
    passed: assignment !== null,
    eligible,
    assignment,
    detail:
      assignment === null
        ? "no distinct card-name assignment exists"
        : null,
  };
}

export function allDistinctMatchesHold(
  hand: readonly number[],
  deck: readonly MappingCard[],
  requirements: readonly ConditionRequirement[],
  constraints: readonly DistinctMatchConstraint[],
  groups: GroupMembership = new Map(),
): boolean {
  if (constraints.length === 0) return true;
  return constraints.every(
    (constraint) =>
      evaluateDistinctMatch(hand, deck, requirements, constraint, groups).passed,
  );
}
