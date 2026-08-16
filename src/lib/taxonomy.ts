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

export interface CardTaxonomy {
  roles: Role[];
  opening_quality: OpeningQualityValue;
}

export const EMPTY_TAXONOMY: CardTaxonomy = {
  roles: [],
  opening_quality: null,
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

export function normalizeTaxonomy(raw: {
  roles?: readonly string[];
  opening_quality?: unknown;
}): CardTaxonomy {
  const roles = uniqueRoles(raw.roles ?? []);
  let opening_quality: OpeningQualityValue = null;
  if (raw.opening_quality === null || raw.opening_quality === undefined) {
    opening_quality = null;
  } else if (typeof raw.opening_quality === "string") {
    const trimmed = raw.opening_quality.trim();
    if (trimmed === "" || trimmed === "null") {
      opening_quality = null;
    } else if (isOpeningQuality(trimmed)) {
      opening_quality = trimmed;
    } else {
      throw new Error(`invalid opening_quality: ${raw.opening_quality}`);
    }
  } else {
    throw new Error(`invalid opening_quality: ${String(raw.opening_quality)}`);
  }
  return { roles, opening_quality };
}

export function mergeTaxonomies(
  a: CardTaxonomy,
  b: CardTaxonomy,
): CardTaxonomy {
  const roles = uniqueRoles([...a.roles, ...b.roles]);
  // Prefer an explicit quality when merging duplicate card rows.
  const opening_quality =
    a.opening_quality !== null ? a.opening_quality : b.opening_quality;
  return { roles, opening_quality };
}

/**
 * Migrate schema v1 flat `roles: string[]` into Taxonomy v0.
 * `brick` → opening_quality `undesirable`.
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
  return { roles, opening_quality };
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

export function openingQualityDensity(
  cards: readonly { quantity: number; taxonomy: CardTaxonomy }[],
): Record<OpeningQualityBucket, number> {
  const density: Record<OpeningQualityBucket, number> = {
    desirable: 0,
    neutral: 0,
    undesirable: 0,
    unclassified: 0,
  };
  for (const card of cards) {
    const key: OpeningQualityBucket =
      card.taxonomy.opening_quality === null
        ? "unclassified"
        : card.taxonomy.opening_quality;
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

/** Copies with a specific opening quality (null = unclassified). */
export function copiesForOpeningQuality(
  cards: readonly { quantity: number; taxonomy: CardTaxonomy }[],
  quality: OpeningQualityValue,
): number {
  return cards.reduce(
    (sum, card) =>
      card.taxonomy.opening_quality === quality ? sum + card.quantity : sum,
    0,
  );
}
