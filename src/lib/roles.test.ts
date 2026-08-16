import { describe, expect, it } from "vitest";
import {
  addRole,
  removeRole,
  roleDensity,
  uniqueRoles,
} from "./roles";

describe("role model", () => {
  it("lets one card hold multiple roles", () => {
    const roles = uniqueRoles(["starter", "extender"]);
    expect(roles).toEqual(["starter", "extender"]);
  });

  it("adds and removes a role without dropping the others", () => {
    const withRecovery = addRole(["starter", "extender"], "recovery");
    expect(withRecovery).toEqual(["starter", "extender", "recovery"]);
    expect(removeRole(withRecovery, "extender")).toEqual(["starter", "recovery"]);
  });

  it("accepts custom vocabulary strings", () => {
    const roles = addRole(["starter"], "going_second");
    expect(roles).toContain("going_second");
    expect(uniqueRoles(["board_breaker", "board_breaker", "  garnet  "])).toEqual([
      "board_breaker",
      "garnet",
    ]);
  });

  it("counts overlapping role slots from quantities", () => {
    const density = roleDensity([
      { quantity: 3, roles: ["starter", "extender"] },
      { quantity: 2, roles: ["extender", "recovery"] },
      { quantity: 1, roles: [] },
    ]);
    expect(density).toEqual({
      starter: 3,
      extender: 5,
      recovery: 2,
    });
    expect(density.starter! + density.extender! + density.recovery!).toBeGreaterThan(6);
  });
});
