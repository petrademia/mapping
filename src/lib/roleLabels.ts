import type { Role } from "./taxonomy";

/** The words for each role, in every place the app shows one. Never print the saved id. */
export const ROLE_LABELS: Record<Role, string> = {
  starter: "Starter",
  extender: "Extender",
  interaction: "Interaction",
  lingering: "Lingering handtrap",
  lingering_second: "Lingering handtrap, going second",
  breaker: "Board breaker",
  breaker_second: "Board breaker, going second",
  brick: "Brick",
};
