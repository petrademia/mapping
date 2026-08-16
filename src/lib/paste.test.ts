import { describe, expect, it } from "vitest";
import { parseDeckText } from "./ydk";

describe("pasted id/quantity lists", () => {
  it("collapses quantities and honors section headers", () => {
    const parsed = parseDeckText(`62962630 3
44362883 x 1
#extra
44146295 1
#side
10045474 2
`);
    expect(parsed.main).toEqual([
      { card_id: 62962630, quantity: 3 },
      { card_id: 44362883, quantity: 1 },
    ]);
    expect(parsed.extra).toEqual([{ card_id: 44146295, quantity: 1 }]);
    expect(parsed.side).toEqual([{ card_id: 10045474, quantity: 2 }]);
  });
});
