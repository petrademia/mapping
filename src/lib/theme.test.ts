import { describe, expect, it } from "vitest";
import { parseThemeChoice, resolveTheme } from "./theme";

describe("theme", () => {
  it("accepts only light or dark as a saved choice", () => {
    expect(parseThemeChoice("dark")).toBe("dark");
    expect(parseThemeChoice("light")).toBe("light");
    expect(parseThemeChoice("sepia")).toBe("system");
    expect(parseThemeChoice(null)).toBe("system");
  });
  it("follows the device only when the choice is system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});
