import type { MappingCard } from "./document";
import type { Role } from "./taxonomy";

type TurnOrder = "going_first" | "going_second";

/** A role you tag for going second only, and the role it counts as when going second. */
const SECOND_ONLY: readonly (readonly [Role, Role])[] = [
  ["lingering_second", "lingering"],
  ["breaker_second", "breaker"],
];

/**
 * The Main Deck as it reads in a turn order. A card tagged "going second only" counts as the plain
 * role going second and not at all going first, so a Hand Condition that asks for a Lingering
 * handtrap or a Board breaker counts the right cards in each turn order. Going first the cards are
 * unchanged. A card that already has the plain role is left alone.
 */
export function rolesForTurn(main: readonly MappingCard[], turnOrder: TurnOrder): MappingCard[] {
  if (turnOrder !== "going_second") return [...main];
  return main.map((card) => {
    const roles = card.taxonomy.roles;
    const added = SECOND_ONLY.filter(([second, plain]) => roles.includes(second) && !roles.includes(plain)).map(
      ([, plain]) => plain,
    );
    return added.length === 0 ? card : { ...card, taxonomy: { ...card.taxonomy, roles: [...roles, ...added] } };
  });
}
