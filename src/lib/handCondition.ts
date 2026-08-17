import type { ConditionRequirement, CountOperator } from "./handExplorer";
import { COUNT_OPERATORS } from "./handExplorer";
import {
  isPresenceRequirement,
  type DistinctBy,
  type DistinctMatchConstraint,
  DISTINCT_BY,
} from "./distinctMatch";
import { isRole, type Role } from "./taxonomy";

const OP_SET = new Set<string>(COUNT_OPERATORS);

function parseOperator(value: unknown): CountOperator {
  const op = String(value ?? "gte");
  if (!OP_SET.has(op)) throw new Error(`invalid operator: ${op}`);
  return op as CountOperator;
}

/** Named deck-specific set of Main Deck cards. Not taxonomy. */
export interface Group {
  id: string;
  name: string;
  /** Optional human note (intent); omitted when blank. Not used by math. */
  notes?: string;
  card_ids: number[];
}

/**
 * A user-defined Boolean predicate over the observed hand.
 * A hand H satisfies the condition iff every `requirements` predicate holds
 * AND every `excludes` predicate is false
 * AND every distinct-match constraint admits an assignment.
 */
export interface HandCondition {
  id: string;
  name: string;
  /** Optional human note (intent); omitted when blank. Not used by math. */
  notes?: string;
  /** ALL OF these requirements. Empty means incomplete (never holds). */
  requirements: ConditionRequirement[];
  /** NONE OF these exclusion predicates may hold. Empty means no exclusions. */
  excludes: ConditionRequirement[];
  /** Optional distinct-by-card-name constraints over presence (`≥ 1`) requirements. */
  distinct_constraints?: DistinctMatchConstraint[];
}

export type ConditionRequirementDraft = ConditionRequirement;

export const SET_AGGREGATIONS = ["any"] as const;
export type SetAggregation = (typeof SET_AGGREGATIONS)[number];

/**
 * A named collection of Hand Conditions interpreted together.
 * v0 supports `aggregation: "any"` (OR). Future aggregations may follow.
 */
export interface HandConditionSet {
  id: string;
  name: string;
  /** Optional human note (intent); omitted when blank. Not used by math. */
  notes?: string;
  condition_ids: string[];
  aggregation: SetAggregation;
}

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function optionalNotes(raw: string | undefined): string | undefined {
  const notes = raw?.trim() ?? "";
  return notes.length > 0 ? notes : undefined;
}

export function normalizeGroup(raw: Group): Group {
  const id = raw.id.trim();
  if (!id) throw new Error("group id is required");
  // Keep the trimmed name; the UI shows a placeholder when it is empty.
  const name = raw.name.trim();
  const seen = new Set<number>();
  const card_ids: number[] = [];
  for (const cardId of raw.card_ids) {
    if (!Number.isInteger(cardId) || cardId <= 0) continue;
    if (seen.has(cardId)) continue;
    seen.add(cardId);
    card_ids.push(cardId);
  }
  const notes = optionalNotes(raw.notes);
  return notes === undefined
    ? { id, name, card_ids }
    : { id, name, notes, card_ids };
}

export function normalizeCondition(
  raw: ConditionRequirementDraft | ConditionRequirement,
): ConditionRequirement {
  if (!Number.isInteger(raw.count) || raw.count < 0) {
    throw new Error("condition count must be a non-negative integer");
  }
  const op = parseOperator(raw.op);
  const id = raw.id?.trim() || newId("req");
  if (raw.kind === "card") {
    if (!Number.isInteger(raw.card_id) || raw.card_id <= 0) {
      throw new Error("condition card_id must be a positive integer");
    }
    return {
      id,
      kind: "card",
      card_id: raw.card_id,
      op,
      count: raw.count,
    };
  }
  if (raw.kind === "role") {
    if (!isRole(raw.role)) {
      throw new Error(`invalid role: ${raw.role}`);
    }
    return {
      id,
      kind: "role",
      role: raw.role,
      op,
      count: raw.count,
    };
  }
  const group_id = raw.group_id.trim();
  if (!group_id) throw new Error("condition group_id is required");
  return {
    id,
    kind: "group",
    group_id,
    op,
    count: raw.count,
  };
}

export function normalizeDistinctMatchConstraint(
  raw: DistinctMatchConstraint,
  requirements: readonly ConditionRequirement[],
): DistinctMatchConstraint | null {
  const id = raw.id.trim() || newId("distinct");
  const byId = new Map(
    requirements
      .filter((requirement) => Boolean(requirement.id))
      .map((requirement) => [requirement.id!, requirement]),
  );
  const seen = new Set<string>();
  const requirement_ids: string[] = [];
  for (const requirementId of raw.requirement_ids) {
    const trimmed = requirementId.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    const requirement = byId.get(trimmed);
    if (!requirement || !isPresenceRequirement(requirement)) continue;
    seen.add(trimmed);
    requirement_ids.push(trimmed);
  }
  if (requirement_ids.length < 2) return null;
  const distinct_by: DistinctBy = DISTINCT_BY.includes(raw.distinct_by)
    ? raw.distinct_by
    : "card_name";
  return { id, requirement_ids, distinct_by };
}

export function normalizeHandCondition(raw: HandCondition): HandCondition {
  const id = raw.id.trim();
  if (!id) throw new Error("hand condition id is required");
  const requirements = Array.isArray(raw.requirements)
    ? raw.requirements.map(normalizeCondition)
    : [];
  const excludes = Array.isArray(raw.excludes)
    ? raw.excludes.map(normalizeCondition)
    : [];
  const distinct_constraints = Array.isArray(raw.distinct_constraints)
    ? raw.distinct_constraints
        .map((constraint) =>
          normalizeDistinctMatchConstraint(constraint, requirements),
        )
        .filter((constraint): constraint is DistinctMatchConstraint => constraint !== null)
    : [];
  const notes = optionalNotes(raw.notes);
  const base = {
    id,
    // Keep the trimmed name; the UI shows a placeholder when it is empty.
    name: raw.name.trim(),
    requirements,
    excludes,
    distinct_constraints,
  };
  return notes === undefined ? base : { ...base, notes };
}

export function normalizeHandConditionSet(raw: HandConditionSet): HandConditionSet {
  const id = raw.id.trim();
  if (!id) throw new Error("hand condition set id is required");
  const aggregation: SetAggregation = SET_AGGREGATIONS.includes(
    (raw.aggregation ?? "any") as SetAggregation,
  )
    ? (raw.aggregation as SetAggregation)
    : "any";
  const ids = new Set<string>();
  const condition_ids: string[] = [];
  for (const conditionId of raw.condition_ids) {
    const trimmed = conditionId.trim();
    if (!trimmed || ids.has(trimmed)) continue;
    ids.add(trimmed);
    condition_ids.push(trimmed);
  }
  const notes = optionalNotes(raw.notes);
  const base = {
    id,
    // Keep the trimmed name; the UI shows a placeholder when it is empty.
    name: raw.name.trim(),
    condition_ids,
    aggregation,
  };
  return notes === undefined ? base : { ...base, notes };
}

export function groupsToMembership(
  groups: readonly Group[],
): Map<string, ReadonlySet<number>> {
  const map = new Map<string, ReadonlySet<number>>();
  for (const group of groups) {
    map.set(group.id, new Set(group.card_ids));
  }
  return map;
}

export function defaultCondition(
  kind: "card" | "role" | "group",
  options: {
    card_id?: number;
    role?: Role;
    group_id?: string;
    op?: CountOperator;
    count?: number;
  } = {},
): ConditionRequirement {
  const op = options.op ?? "gte";
  const count = options.count ?? 1;
  if (kind === "card") {
    return normalizeCondition({
      kind: "card",
      card_id: options.card_id ?? 0,
      op,
      count,
    });
  }
  if (kind === "role") {
    return normalizeCondition({
      kind: "role",
      role: options.role ?? "starter",
      op,
      count,
    });
  }
  return normalizeCondition({
    kind: "group",
    group_id: options.group_id ?? "",
    op,
    count,
  });
}

export function parseGroup(raw: unknown): Group {
  if (raw === null || typeof raw !== "object") {
    throw new Error("group must be an object");
  }
  const record = raw as Record<string, unknown>;
  const card_ids = Array.isArray(record.card_ids)
    ? record.card_ids.map((id) => Number(id))
    : [];
  return normalizeGroup({
    id: String(record.id ?? ""),
    name: String(record.name ?? ""),
    notes: typeof record.notes === "string" ? record.notes : undefined,
    card_ids,
  });
}

export function parseHandCondition(raw: unknown): HandCondition {
  if (raw === null || typeof raw !== "object") {
    throw new Error("hand condition must be an object");
  }
  const record = raw as Record<string, unknown>;
  const requirements = Array.isArray(record.requirements)
    ? record.requirements.map(parseCondition)
    : [];
  const excludes = Array.isArray(record.excludes)
    ? record.excludes.map(parseCondition)
    : [];
  const distinct_constraints = Array.isArray(record.distinct_constraints)
    ? record.distinct_constraints.map(parseDistinctMatchConstraint)
    : [];
  return normalizeHandCondition({
    id: String(record.id ?? ""),
    name: String(record.name ?? ""),
    notes: typeof record.notes === "string" ? record.notes : undefined,
    requirements,
    excludes,
    distinct_constraints,
  });
}

function parseDistinctMatchConstraint(raw: unknown): DistinctMatchConstraint {
  if (raw === null || typeof raw !== "object") {
    throw new Error("distinct match constraint must be an object");
  }
  const record = raw as Record<string, unknown>;
  const requirement_ids = Array.isArray(record.requirement_ids)
    ? record.requirement_ids.map((id) => String(id))
    : [];
  return {
    id: String(record.id ?? ""),
    requirement_ids,
    distinct_by: "card_name",
  };
}

export function parseHandConditionSet(raw: unknown): HandConditionSet {
  if (raw === null || typeof raw !== "object") {
    throw new Error("hand condition set must be an object");
  }
  const record = raw as Record<string, unknown>;
  const condition_ids = Array.isArray(record.condition_ids)
    ? record.condition_ids.map((id) => String(id))
    : [];
  return normalizeHandConditionSet({
    id: String(record.id ?? ""),
    name: String(record.name ?? ""),
    notes: typeof record.notes === "string" ? record.notes : undefined,
    condition_ids,
    aggregation: (record.aggregation ?? "any") as SetAggregation,
  });
}

function parseCondition(raw: unknown): ConditionRequirement {
  if (raw === null || typeof raw !== "object") {
    throw new Error("condition must be an object");
  }
  const record = raw as Record<string, unknown>;
  // Support both flat ConditionRequirement shape and nested subject shape.
  const id =
    typeof record.id === "string" && record.id.trim()
      ? record.id.trim()
      : undefined;
  if (record.subject && typeof record.subject === "object") {
    const subject = record.subject as Record<string, unknown>;
    const op = parseOperator(record.operator ?? record.op ?? "gte");
    const count = Number(record.value ?? record.count ?? 1);
    const type = String(subject.type ?? subject.kind ?? "");
    if (type === "card") {
      return normalizeCondition({
        id,
        kind: "card",
        card_id: Number(subject.card_id),
        op,
        count,
      });
    }
    if (type === "role") {
      return normalizeCondition({
        id,
        kind: "role",
        role: String(subject.role) as Role,
        op,
        count,
      });
    }
    if (type === "group") {
      return normalizeCondition({
        id,
        kind: "group",
        group_id: String(subject.group_id),
        op,
        count,
      });
    }
    throw new Error(`unsupported condition subject type: ${type}`);
  }
  const kind = String(record.kind ?? record.type ?? "");
  const op = parseOperator(record.op ?? record.operator ?? "gte");
  const count = Number(record.count ?? record.value ?? 1);
  if (kind === "card") {
    return normalizeCondition({
      id,
      kind: "card",
      card_id: Number(record.card_id),
      op,
      count,
    });
  }
  if (kind === "role") {
    return normalizeCondition({
      id,
      kind: "role",
      role: String(record.role) as Role,
      op,
      count,
    });
  }
  if (kind === "group") {
    return normalizeCondition({
      id,
      kind: "group",
      group_id: String(record.group_id),
      op,
      count,
    });
  }
  throw new Error(`unsupported condition kind: ${kind}`);
}

export function serializeCondition(
  condition: ConditionRequirement,
): Record<string, unknown> {
  if (condition.kind === "card") {
    return {
      ...(condition.id ? { id: condition.id } : {}),
      kind: "card",
      card_id: condition.card_id,
      op: condition.op,
      count: condition.count,
    };
  }
  if (condition.kind === "role") {
    return {
      ...(condition.id ? { id: condition.id } : {}),
      kind: "role",
      role: condition.role,
      op: condition.op,
      count: condition.count,
    };
  }
  return {
    ...(condition.id ? { id: condition.id } : {}),
    kind: "group",
    group_id: condition.group_id,
    op: condition.op,
    count: condition.count,
  };
}