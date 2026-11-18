import { describe, expect, it } from "vitest";
import { createDocument } from "./document";
import { HISTORY_LIMIT, record, redo, startHistory, undo } from "./docHistory";

const named = (name: string) => ({ ...createDocument("x"), name });

describe("document history", () => {
  it("undoes and redoes an edit", () => {
    const a = createDocument("a");
    const b = { ...a, main: [...a.main] };
    let h = record(startHistory(a), b);
    expect(h.present).toBe(b);
    h = undo(h);
    expect(h.present).toBe(a);
    expect(h.future).toEqual([b]);
    h = redo(h);
    expect(h.present).toBe(b);
  });

  it("drops the redo stack on a new edit", () => {
    const a = createDocument("a");
    const b = { ...a, main: [] };
    const c = { ...a, side: [] };
    let h = undo(record(startHistory(a), b));
    h = record(h, c);
    expect(h.future).toEqual([]);
    expect(h.past).toEqual([a]);
  });

  it("ignores an edit that changed nothing and an empty undo or redo", () => {
    const a = createDocument("a");
    const h = startHistory(a);
    expect(record(h, a)).toBe(h);
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });

  it("keeps typing a name as one step", () => {
    const base = { ...createDocument("a"), main: [] };
    let h = record(startHistory(base), { ...base, main: [] as typeof base.main, name: "p" });
    // After a non-name edit, the first name change is its own step; the rest join it.
    const start = h.present;
    h = record(h, { ...start, name: "po" });
    h = record(h, { ...start, name: "pow" });
    expect(h.past.length).toBeLessThanOrEqual(2);
    expect(undo(undo(h)).present).toBe(base);
  });

  it("keeps at most the limit", () => {
    let h = startHistory(named("0"));
    for (let i = 1; i <= HISTORY_LIMIT + 20; i++) h = record(h, { ...h.present, main: [] });
    expect(h.past.length).toBe(HISTORY_LIMIT);
  });
});
