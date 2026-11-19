import { addRole, removeRole, type Role } from "./taxonomy";

/** A role that works in both turn orders, or only going second: Lingering handtrap and Board breaker. */
export type TurnVariantRole = "lingering" | "breaker";

const SECOND_ONLY: Record<TurnVariantRole, Role> = {
  lingering: "lingering_second",
  breaker: "breaker_second",
};

/**
 * How a card carries the role: not at all, in both turn orders, or going second only. The saved
 * tags are unchanged (the base role, or its going-second role). A card that somehow holds both
 * counts as both turn orders, since that already covers going second.
 */
export type RoleVariant = "off" | "both" | "second";

export function roleVariant(roles: readonly Role[], base: TurnVariantRole): RoleVariant {
  if (roles.includes(base)) return "both";
  return roles.includes(SECOND_ONLY[base]) ? "second" : "off";
}

/** The roles with the base role set to a variant, every other role left alone. */
export function setRoleVariant(roles: readonly Role[], base: TurnVariantRole, variant: RoleVariant): Role[] {
  const cleared = removeRole(removeRole(roles, base), SECOND_ONLY[base]);
  if (variant === "off") return cleared;
  return addRole(cleared, variant === "both" ? base : SECOND_ONLY[base]);
}
