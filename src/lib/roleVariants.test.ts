import { describe, expect, it } from "vitest";
import { roleVariant, setRoleVariant } from "./roleVariants";
import type { Role } from "./taxonomy";

describe("role variants", () => {
  it("reads off, both turn orders, and going second only", () => {
    expect(roleVariant([], "lingering")).toBe("off");
    expect(roleVariant(["lingering"], "lingering")).toBe("both");
    expect(roleVariant(["lingering_second"], "lingering")).toBe("second");
    expect(roleVariant(["breaker_second"], "breaker")).toBe("second");
  });

  it("counts a card holding both as both turn orders", () => {
    expect(roleVariant(["lingering", "lingering_second"], "lingering")).toBe("both");
  });

  it("sets a variant by swapping the saved role, and leaves the other roles alone", () => {
    const roles: Role[] = ["interaction", "breaker"];
    expect(setRoleVariant(roles, "breaker", "second")).toEqual(["interaction", "breaker_second"]);
    expect(setRoleVariant(["interaction", "breaker_second"], "breaker", "both")).toEqual(["interaction", "breaker"]);
    expect(setRoleVariant(["interaction", "breaker_second"], "breaker", "off")).toEqual(["interaction"]);
    expect(setRoleVariant(["interaction"], "lingering", "both")).toEqual(["interaction", "lingering"]);
  });

  it("turns a card holding both into going second only when asked", () => {
    expect(setRoleVariant(["lingering", "lingering_second"], "lingering", "second")).toEqual(["lingering_second"]);
  });
});
