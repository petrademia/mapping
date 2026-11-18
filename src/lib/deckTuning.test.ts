import { expect, it } from "vitest";
import { applyTuning, MAX_ADDITIONS, tuneDeck, type TuningRequest } from "./deckTuning";
import { createDocument, setQuantity, upsertHandCondition, upsertHandConditionSet } from "./document";
import { combinations, ratioToNumber } from "./probability";

function request(size: number): TuningRequest {
  let doc = createDocument("Test deck");
  doc = setQuantity(doc, "main", 1, 2);
  for (let slot = 2; slot < size; slot += 1) doc = setQuantity(doc, "main", slot, 1);
  doc = upsertHandCondition(doc, {
    id: "access", name: "Access", requirements: [{ kind: "card", card_id: 1, op: "gte", count: 1 }],
    excludes: [], distinct_constraints: [],
  });
  doc = upsertHandConditionSet(doc, {
    id: "goal", name: "Goal", condition_ids: ["access"], aggregation: "any",
  });
  doc = { ...doc, handtraps: [{ id: "ash", name: "Ash", hits: [1] }] };
  return {
    doc, goalId: "goal", scenarios: [{ id: "ash", label: "Ash", handtrapIds: ["ash"] }],
    cuts: [2], additions: [1], banlist: {}, format: "none",
  };
}

it("ranks legal cuts, additions and swaps by exact worst-case survival", () => {
  const input = request(41);
  const result = tuneDeck(input);
  if ("error" in result) throw new Error(result.error);
  expect(result.candidates.map(({ change, size }) => [change.kind, size])).toEqual([
    ["swap", 41], ["add", 42], ["cut", 40],
  ]);
  expect(result.baseline.survival[0]).toBeCloseTo(
    ratioToNumber(combinations(39, 3), combinations(41, 5)), 12,
  );
  expect(result.candidates[0]?.odds.survival[0]).toBeCloseTo(
    ratioToNumber(3n * combinations(38, 3) + combinations(38, 2), combinations(41, 5)), 12,
  );
  expect(applyTuning(input.doc, { kind: "swap", cut: 2, add: 1 }).main[0]?.quantity).toBe(3);
  expect(input.doc.main[0]?.quantity).toBe(2);
});

it("enforces deck size and copy limits across sections", () => {
  const input = request(40);
  const result = tuneDeck(input);
  if ("error" in result) throw new Error(result.error);
  expect(result.candidates.map(({ change }) => change.kind)).toEqual(["swap", "add"]);
  const restricted = tuneDeck({ ...input, doc: setQuantity(input.doc, "side", 1, 1) });
  if ("error" in restricted) throw new Error(restricted.error);
  expect(restricted.candidates).toEqual([]);

  const full = tuneDeck(request(60));
  if ("error" in full) throw new Error(full.error);
  expect(full.candidates.map(({ change }) => change.kind)).toEqual(["swap", "cut"]);
});

it("still ranks changes when the deck already exceeds a limit, but not ones that worsen it", () => {
  const input = request(41);
  const over = { ...input, banlist: { tcg: { name: "test", limits: { "3": 0 } } }, format: "tcg" as const };
  const result = tuneDeck(over);
  if ("error" in result) throw new Error(result.error);
  expect(result.candidates.map(({ change }) => change.kind)).toEqual(["swap", "add", "cut"]);
  const worse = tuneDeck({ ...over, additions: [3], cuts: [2] });
  if ("error" in worse) throw new Error(worse.error);
  expect(worse.candidates.map(({ change }) => change)).toEqual([{ kind: "cut", cut: 2 }]);
});

it("rejects a shortlist larger than the cap", () => {
  const input = request(41);
  const result = tuneDeck({ ...input, additions: Array.from({ length: MAX_ADDITIONS + 1 }, (_, i) => 100 + i) });
  expect(result).toEqual({ error: `Shortlist at most ${MAX_ADDITIONS} additions.` });
});
