export const DEFAULT_ROLES = [
  "starter",
  "extender",
  "interaction",
  "recovery",
  "brick",
  "engine_requirement",
] as const;

export function uniqueRoles(roles: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const role of roles) {
    const trimmed = role.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

export function addRole(roles: readonly string[], role: string): string[] {
  return uniqueRoles([...roles, role]);
}

export function removeRole(roles: readonly string[], role: string): string[] {
  const trimmed = role.trim();
  return uniqueRoles(roles.filter((item) => item !== trimmed));
}

export function roleDensity(
  cards: readonly { quantity: number; roles: readonly string[] }[],
): Record<string, number> {
  const density: Record<string, number> = {};
  for (const card of cards) {
    for (const role of uniqueRoles(card.roles)) {
      density[role] = (density[role] ?? 0) + card.quantity;
    }
  }
  return density;
}
