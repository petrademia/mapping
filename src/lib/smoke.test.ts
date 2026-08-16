import { describe, expect, it } from "vitest";
import { powerPatronArsMagnaDemo } from "../data/powerPatronArsMagnaDemo";
import { deckProfileFromAccessData } from "./deckProfile";
import { analysisContextOf } from "./document";
import { openingQualityForTurn } from "./taxonomy";

describe("smoke: contextual quality success criterion", () => {
  const doc = powerPatronArsMagnaDemo;

  it("annotates Fuwalos independently for GF and GS while keeping role", () => {
    const fuwalos = doc.main.find((c) => c.card_id === 42141493);
    expect(fuwalos?.taxonomy.roles).toContain("interaction");
    expect(openingQualityForTurn(fuwalos!.taxonomy.opening_quality, "going_first")).toBe("neutral");
    expect(openingQualityForTurn(fuwalos!.taxonomy.opening_quality, "going_second")).toBe("desirable");
  });

  it("produces different profiles under GF vs GS", () => {
    const context = analysisContextOf(doc);
    const profiles = {
      going_first: deckProfileFromAccessData(
        doc.main,
        5,
        "going_first",
        doc.access_conditions,
        doc.access_groups,
      ),
      going_second: deckProfileFromAccessData(
        doc.main,
        5,
        "going_second",
        doc.access_conditions,
        doc.access_groups,
      ),
    };
    expect(profiles.going_first.desirableGe1).not.toBeCloseTo(
      profiles.going_second.desirableGe1,
      9,
    );
    expect(profiles.going_first.anyAccess).toBeGreaterThan(0);
    expect(profiles.going_second.anyAccess).toBeGreaterThan(0);
    expect(profiles.going_first.accessNoUndesirable).toBeGreaterThan(0);
    expect(profiles.going_first.accessUndesirableGe1).toBeGreaterThanOrEqual(0);
    expect(context.turn_order).toBe("going_first");
  });

  it("reports exact metrics in 0..1", () => {
    const profile = deckProfileFromAccessData(
      doc.main,
      5,
      "going_first",
      doc.access_conditions,
      doc.access_groups,
    );
    for (const key of [
      "desirableGe1",
      "neutralGe1",
      "undesirableGe1",
      "undesirableGe2",
      "unclassifiedGe1",
      "anyAccess",
      "accessNoUndesirable",
      "interactionGe1",
    ] as const) {
      expect(profile[key]).toBeGreaterThanOrEqual(0);
      expect(profile[key]).toBeLessThanOrEqual(1.0000001);
    }
  });
});