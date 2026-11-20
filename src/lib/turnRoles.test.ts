import { describe, expect, it } from "vitest";
import type { MappingCard } from "./document";
import { rolesForTurn } from "./turnRoles";

const card = (card_id: number, roles: string[]): MappingCard =>
  ({ card_id, quantity: 1, taxonomy: { roles, opening_quality: { going_first: null, going_second: null } } }) as MappingCard;

describe("roles in a turn order", () => {
  const main = [
    card(1, ["lingering_second"]),
    card(2, ["breaker_second", "interaction"]),
    card(3, ["lingering", "lingering_second"]),
    card(4, ["starter"]),
  ];

  it("leaves the deck as it is going first", () => {
    expect(rolesForTurn(main, "going_first").map((c) => c.taxonomy.roles)).toEqual(main.map((c) => c.taxonomy.roles));
  });

  it("counts a going-second-only role as the plain role going second", () => {
    const second = rolesForTurn(main, "going_second");
    expect(second[0]!.taxonomy.roles).toEqual(["lingering_second", "lingering"]);
    expect(second[1]!.taxonomy.roles).toEqual(["breaker_second", "interaction", "breaker"]);
  });

  it("does not add a role twice, and leaves other cards the same object", () => {
    const second = rolesForTurn(main, "going_second");
    expect(second[2]!.taxonomy.roles).toEqual(["lingering", "lingering_second"]);
    expect(second[3]).toBe(main[3]);
  });

  it("does not change the deck it was given", () => {
    rolesForTurn(main, "going_second");
    expect(main[0]!.taxonomy.roles).toEqual(["lingering_second"]);
  });
});
