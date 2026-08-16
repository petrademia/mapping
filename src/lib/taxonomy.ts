/** Taxonomy v0: two independent dimensions on deck cards (human hypotheses). */

export const ROLES = ["starter", "extender", "interaction"] as const;
export type Role = (typeof ROLES)[number];

export const OPENING_QUALITIES = [
  "desirable",
  "neutral",
  "undesirable",
] as const;
export type OpeningQuality = (typeof OPENING_QUALITIES)[number];

/** Explicit evaluation. `null` means unclassified (distinct from `"neutral"`). */
export type OpeningQualityValue = OpeningQuality | null;

/** Per-turn-order judgment. Each side is `null` (= unclassified) by default. */
export interface ContextualOpeningQuality {
  going_first: OpeningQualityValue;
  going_second: OpeningQualityValue;
}

export const EMPTY_CONTEXTUAL_QUALITY: ContextualOpeningQuality = {
  going_first: null,
  going_second: null,
};

export interface CardTaxonomy {
  roles: Role[];
  opening_quality: ContextualOpeningQuality;
}

export const EMPTY_TAXONOMY: CardTaxonomy = {
  roles: [],
  opening_quality: { ...EMPTY_CONTEXTUAL_QUALITY },
};

const ROLE_SET = new Set<string>(ROLES);
const QUALITY_SET = new Set<string>(OPENING_QUALITIES);

/** Legacy flat-role labels dropped from Taxonomy v0 (not remapped to Role). */
export const DROPPED_LEGACY_ROLES = [
  "recovery",
  "engine_requirement",
] as const;

export function isRole(value: string): value is Role {
  return ROLE_SET.has(value);
}

export function isOpeningQuality(value: string): value is OpeningQuality {
  return QUALITY_SET.has(value);
}

export function uniqueRoles(roles: readonly string[]): Role[] {
  const seen = new Set<Role>();
  const result: Role[] = [];
  for (const role of roles) {
    const trimmed = role.trim();
    if (!isRole(trimmed) || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

export function addRole(roles: readonly Role[], role: Role): Role[] {
  return uniqueRoles([...roles, role]);
}

export function removeRole(roles: readonly Role[], role: Role): Role[] {
  return roles.filter((item) => item !== role);
}

export function toggleRole(roles: readonly Role[], role: Role): Role[] {
  return roles.includes(role) ? removeRole(roles, role) : addRole(roles, role);
}

export function openingQualityForTurn(
  quality: ContextualOpeningQuality,
  turnOrder: "going_first" | "going_second",
): OpeningQualityValue {
  return turnOrder === "going_second" ? quality.going_second : quality.going_first;
}

function parseQualityValue(value: unknown): OpeningQualityValue {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new Error(`invalid opening_quality: ${String(value)}`);
  }
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "null") return null;
  if (isOpeningQuality(trimmed)) return trimmed;
  throw new Error(`invalid opening_quality: ${value}`);
}

/**
 * Normalize opening quality from either:
 * - the legacy scalar form (`"desirable"`, `null`) which migrates to both
 *   contexts, or
 * - the contextual object form `{ going_first, going_second }`.
 */
function normalizeOpeningQuality(unknown: unknown): ContextualOpeningQuality {
  if (unknown === null || unknown === undefined) {
    return { ...EMPTY_CONTEXTUAL_QUALITY };
  }
  if (typeof unknown === "object" && !Array.isArray(unknown)) {
    const record = unknown as Record<string, unknown>;
    return {
      going_first: parseQualityValue(record.going_first),
      going_second: parseQualityValue(record.going_second),
    };
  }
  const legacy = parseQualityValue(unknown);
  return { going_first: legacy, going_second: legacy };
}

export function normalizeTaxonomy(raw: {
  roles?: readonly string[];
  opening_quality?: unknown;
}): CardTaxonomy {
  return {
    roles: uniqueRoles(raw.roles ?? []),
    opening_quality: normalizeOpeningQuality(raw.opening_quality),
  };
}

export function mergeTaxonomies(
  a: CardTaxonomy,
  b: CardTaxonomy,
): CardTaxonomy {
  const pick = (x: OpeningQualityValue, y: OpeningQualityValue) =>
    x !== null ? x : y;
  return {
    roles: uniqueRoles([...a.roles, ...b.roles]),
    opening_quality: {
      going_first: pick(
        a.opening_quality.going_first,
        b.opening_quality.going_first,
      ),
      going_second: pick(
        a.opening_quality.going_second,
        b.opening_quality.going_second,
      ),
    },
  };
}

/**
 * Migrate schema v1 flat `roles: string[]` into Taxonomy v0.
 * `brick` → opening_quality `undesirable` in both contexts.
 * `recovery` / `engine_requirement` are dropped (not remapped).
 * Unknown strings are dropped.
 */
export function migrateLegacyRoles(
  legacyRoles: readonly string[],
): CardTaxonomy {
  const roles: Role[] = [];
  let opening_quality: OpeningQualityValue = null;
  const seen = new Set<Role>();
  for (const raw of legacyRoles) {
    const role = raw.trim();
    if (!role) continue;
    if (role === "brick") {
      opening_quality = "undesirable";
      continue;
    }
    if (
      (DROPPED_LEGACY_ROLES as readonly string[]).includes(role) ||
      !isRole(role)
    ) {
      continue;
    }
    if (!seen.has(role)) {
      seen.add(role);
      roles.push(role);
    }
  }
  return {
    roles,
    opening_quality: { going_first: opening_quality, going_second: opening_quality },
  };
}

export function roleDensity(
  cards: readonly { quantity: number; taxonomy: CardTaxonomy }[],
): Record<Role, number> {
  const density: Record<Role, number> = {
    starter: 0,
    extender: 0,
    interaction: 0,
  };
  for (const card of cards) {
    for (const role of uniqueRoles(card.taxonomy.roles)) {
      density[role] += card.quantity;
    }
  }
  return density;
}

export type OpeningQualityBucket = OpeningQuality | "unclassified";

/**
 * Count physical copies per opening-quality bucket for one turn order.
 * The four buckets are mutually exclusive and sum to deck size.
 */
export function openingQualityDensity(
  cards: readonly { quantity: number; taxonomy: CardTaxonomy }[],
  turnOrder: "going_first" | "going_second",
): Record<OpeningQualityBucket, number> {
  const density: Record<OpeningQualityBucket, number> = {
    desirable: 0,
    neutral: 0,
    undesirable: 0,
    unclassified: 0,
  };
  for (const card of cards) {
    const value = openingQualityForTurn(card.taxonomy.opening_quality, turnOrder);
    const key: OpeningQualityBucket = value === null ? "unclassified" : value;
    density[key] += card.quantity;
  }
  return density;
}

/** Copies matching a role (for hypergeometric composition probs). */
export function copiesForRole(
  cards: readonly { quantity: number; taxonomy: CardTaxonomy }[],
  role: Role,
): number {
  return cards.reduce(
    (sum, card) =>
      card.taxonomy.roles.includes(role) ? sum + card.quantity : sum,
    0,
  );
}

/** Copies with a specific opening quality in the given turn order (null = unclassified). */
export function copiesForOpeningQuality(
  cards: readonly { quantity: number; taxonomy: CardTaxonomy }[],
  turnOrder: "going_first" | "going_second",
  quality: OpeningQualityValue,
): number {
  return cards.reduce(
    (sum, card) =>
      openingQualityForTurn(card.taxonomy.opening_quality, turnOrder) === quality
        ? sum + card.quantity
        : sum,
    0,
  );
}