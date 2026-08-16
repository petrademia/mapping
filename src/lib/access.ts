import type { CountOperator, HandCondition } from "./handExplorer";
import { COUNT_OPERATORS } from "./handExplorer";
import { isRole, type Role } from "./taxonomy";

const OP_SET = new Set<string>(COUNT_OPERATORS);

function parseOperator(value: unknown): CountOperator {
  const op = String(value ?? "gte");
  if (!OP_SET.has(op)) throw new Error(`invalid operator: ${op}`);
  return op as CountOperator;
}

export interface AccessGroup {
  id: string;
  name: string;
  card_ids: number[];
}

export interface AccessCondition {
  id: string;
  name: string;
  /** ALL OF these requirements. Empty means incomplete (never holds). */
  requirements: HandCondition[];
  /** NONE OF these exclusion predicates may hold. Empty means no exclusions. */
  excludes: HandCondition[];
}

export function newAccessId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function normalizeAccessGroup(raw: AccessGroup): AccessGroup {
  const id = raw.id.trim();
  if (!id) throw new Error("access group id is required");
  const name = raw.name.trim() || "Untitled group";
  const seen = new Set<number>();
  const card_ids: number[] = [];
  for (const cardId of raw.card_ids) {
    if (!Number.isInteger(cardId) || cardId <= 0) continue;
    if (seen.has(cardId)) continue;
    seen.add(cardId);
    card_ids.push(cardId);
  }
  return { id, name, card_ids };
}

export function normalizeRequirement(raw: HandCondition): HandCondition {
  if (!Number.isInteger(raw.count) || raw.count < 0) {
    throw new Error("requirement count must be a non-negative integer");
  }
  const op = parseOperator(raw.op);
  if (raw.kind === "card") {
    if (!Number.isInteger(raw.card_id) || raw.card_id <= 0) {
      throw new Error("requirement card_id must be a positive integer");
    }
    return {
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
      kind: "role",
      role: raw.role,
      op,
      count: raw.count,
    };
  }
  const group_id = raw.group_id.trim();
  if (!group_id) throw new Error("requirement group_id is required");
  return {
    kind: "group",
    group_id,
    op,
    count: raw.count,
  };
}

export function normalizeAccessCondition(
  raw: AccessCondition,
): AccessCondition {
  const id = raw.id.trim();
  if (!id) throw new Error("access condition id is required");
  const requirements = Array.isArray(raw.requirements)
    ? raw.requirements.map(normalizeRequirement)
    : [];
  const excludes = Array.isArray(raw.excludes)
    ? raw.excludes.map(normalizeRequirement)
    : [];
  return {
    id,
    name: raw.name.trim() || "Untitled access",
    requirements,
    excludes,
  };
}

export function groupsToMembership(
  groups: readonly AccessGroup[],
): Map<string, ReadonlySet<number>> {
  const map = new Map<string, ReadonlySet<number>>();
  for (const group of groups) {
    map.set(group.id, new Set(group.card_ids));
  }
  return map;
}

export function defaultRequirement(
  kind: "card" | "role" | "group",
  options: {
    card_id?: number;
    role?: Role;
    group_id?: string;
    op?: CountOperator;
    count?: number;
  } = {},
): HandCondition {
  const op = options.op ?? "gte";
  const count = options.count ?? 1;
  if (kind === "card") {
    return {
      kind: "card",
      card_id: options.card_id ?? 0,
      op,
      count,
    };
  }
  if (kind === "role") {
    return {
      kind: "role",
      role: options.role ?? "starter",
      op,
      count,
    };
  }
  return {
    kind: "group",
    group_id: options.group_id ?? "",
    op,
    count,
  };
}

export function parseAccessGroup(raw: unknown): AccessGroup {
  if (raw === null || typeof raw !== "object") {
    throw new Error("access group must be an object");
  }
  const record = raw as Record<string, unknown>;
  const card_ids = Array.isArray(record.card_ids)
    ? record.card_ids.map((id) => Number(id))
    : [];
  return normalizeAccessGroup({
    id: String(record.id ?? ""),
    name: String(record.name ?? ""),
    card_ids,
  });
}

export function parseAccessCondition(raw: unknown): AccessCondition {
  if (raw === null || typeof raw !== "object") {
    throw new Error("access condition must be an object");
  }
  const record = raw as Record<string, unknown>;
  const requirements = Array.isArray(record.requirements)
    ? record.requirements.map(parseRequirement)
    : [];
  const excludes = Array.isArray(record.excludes)
    ? record.excludes.map(parseRequirement)
    : [];
  return normalizeAccessCondition({
    id: String(record.id ?? ""),
    name: String(record.name ?? ""),
    requirements,
    excludes,
  });
}

function parseRequirement(raw: unknown): HandCondition {
  if (raw === null || typeof raw !== "object") {
    throw new Error("requirement must be an object");
  }
  const record = raw as Record<string, unknown>;
  // Support both flat HandCondition shape and nested subject shape from handoff.
  if (record.subject && typeof record.subject === "object") {
    const subject = record.subject as Record<string, unknown>;
    const op = parseOperator(record.operator ?? record.op ?? "gte");
    const count = Number(record.value ?? record.count ?? 1);
    const type = String(subject.type ?? subject.kind ?? "");
    if (type === "card") {
      return normalizeRequirement({
        kind: "card",
        card_id: Number(subject.card_id),
        op,
        count,
      });
    }
    if (type === "role") {
      return normalizeRequirement({
        kind: "role",
        role: String(subject.role) as Role,
        op,
        count,
      });
    }
    if (type === "group") {
      return normalizeRequirement({
        kind: "group",
        group_id: String(subject.group_id),
        op,
        count,
      });
    }
    throw new Error(`unsupported requirement subject type: ${type}`);
  }
  const kind = String(record.kind ?? record.type ?? "");
  const op = parseOperator(record.op ?? record.operator ?? "gte");
  const count = Number(record.count ?? record.value ?? 1);
  if (kind === "card") {
    return normalizeRequirement({
      kind: "card",
      card_id: Number(record.card_id),
      op,
      count,
    });
  }
  if (kind === "role") {
    return normalizeRequirement({
      kind: "role",
      role: String(record.role) as Role,
      op,
      count,
    });
  }
  if (kind === "group") {
    return normalizeRequirement({
      kind: "group",
      group_id: String(record.group_id),
      op,
      count,
    });
  }
  throw new Error(`unsupported requirement kind: ${kind}`);
}

export function serializeRequirement(
  requirement: HandCondition,
): Record<string, unknown> {
  if (requirement.kind === "card") {
    return {
      kind: "card",
      card_id: requirement.card_id,
      op: requirement.op,
      count: requirement.count,
    };
  }
  if (requirement.kind === "role") {
    return {
      kind: "role",
      role: requirement.role,
      op: requirement.op,
      count: requirement.count,
    };
  }
  return {
    kind: "group",
    group_id: requirement.group_id,
    op: requirement.op,
    count: requirement.count,
  };
}
