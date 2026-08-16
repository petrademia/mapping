import { describe, expect, it } from "vitest";
import { sortCheckedFirst } from "./sortCheckedFirst";

describe("sortCheckedFirst", () => {
  it("puts checked items first and keeps order within each bucket", () => {
    const items = ["a", "b", "c", "d", "e"];
    const checked = new Set(["c", "e"]);

    expect(sortCheckedFirst(items, (item) => checked.has(item))).toEqual([
      "c",
      "e",
      "a",
      "b",
      "d",
    ]);
  });

  it("leaves an already-partitioned list unchanged", () => {
    const items = ["c", "e", "a", "b"];
    const checked = new Set(["c", "e"]);

    expect(sortCheckedFirst(items, (item) => checked.has(item))).toEqual(items);
  });

  it("does not mutate the input list", () => {
    const items = ["a", "b", "c"];
    const original = [...items];

    sortCheckedFirst(items, (item) => item === "b");

    expect(items).toEqual(original);
  });

  it("returns a new array when every item is unchecked", () => {
    const items = ["a", "b"];

    expect(sortCheckedFirst(items, () => false)).toEqual(["a", "b"]);
    expect(sortCheckedFirst(items, () => false)).not.toBe(items);
  });
});
