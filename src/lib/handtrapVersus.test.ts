import { describe, expect, it } from "vitest";
import {
  addCard,
  createDocument,
  upsertHandCondition,
  upsertHandConditionSet,
  type MappingCard,
  type MappingDocument,
} from "./document";
import type { HandCondition } from "./handCondition";
import { handConditionHolds } from "./handExplorer";
import {
  addHandtrap,
  addHandtrapPair,
  newHandtrap,
  parseHandtraps,
  parsePairs,
  removeHandtrap,
  setHandtrapHits,
} from "./handtrap";
import { parseMappingJson, serializeMapping } from "./document";
import { analyzeVersus, scenariosFor } from "./handtrapVersus";

const card = (card_id: number, quantity: number): MappingCard => ({
  card_id,
  quantity,
  taxonomy: { roles: [], opening_quality: { going_first: null, going_second: null } },
});

function condition(id: string, requires: [number, number][], excludes: [number, number][] = []): HandCondition {
  return {
    id,
    name: id,
    requirements: requires.map(([card_id, count]) => ({ kind: "card" as const, card_id, op: "gte" as const, count })),
    excludes: excludes.map(([card_id, count]) => ({ kind: "card" as const, card_id, op: "gte" as const, count })),
    distinct_constraints: [],
  };
}

/** A small deck (9 cards) so every physical hand can be listed. */
function build(
  conditions: HandCondition[],
  traps: { name: string; hits: number[] }[],
  pairs: [number, number][] = [],
): MappingDocument {
  let doc = createDocument("t");
  doc = addCard(doc, "main", card(1, 2));
  doc = addCard(doc, "main", card(2, 2));
  doc = addCard(doc, "main", card(3, 1));
  doc = addCard(doc, "main", card(4, 2));
  doc = addCard(doc, "main", card(5, 2));
  doc = { ...doc, analysis: { ...doc.analysis, opening_hand_size: 3 } };
  for (const c of conditions) doc = upsertHandCondition(doc, c);
  doc = upsertHandConditionSet(doc, {
    id: "goal",
    name: "Goal",
    condition_ids: conditions.map((c) => c.id),
    aggregation: "any",
  });
  for (const t of traps) {
    const handtrap = newHandtrap(t.name);
    doc = addHandtrap(doc, handtrap);
    doc = setHandtrapHits(doc, handtrap.id, t.hits);
  }
  for (const [a, b] of pairs) {
    doc = addHandtrapPair(doc, doc.handtraps[a]!.id, doc.handtraps[b]!.id);
  }
  return doc;
}

/** Brute force over every set of physical cards, with no merging of cards. */
function brute(doc: MappingDocument, scenarioTraps: string[]): { base: number; survive: number; total: number } {
  const physical: number[] = [];
  for (const c of doc.main) for (let i = 0; i < c.quantity; i += 1) physical.push(c.card_id);
  const ids = doc.main.map((c) => c.card_id);
  const set = doc.hand_condition_sets.find((s) => s.id === "goal")!;
  const members = set.condition_ids.map((id) => doc.hand_conditions.find((c) => c.id === id)!);
  const hits = scenarioTraps.map((id) => new Set(doc.handtraps.find((h) => h.id === id)!.hits));
  const holds = (counts: number[]) => members.some((m) => handConditionHolds(counts, doc.main, m, new Map()));
  const survives = (counts: number[], at: number): boolean => {
    if (at === hits.length) return holds(counts);
    if (!survives(counts, at + 1)) return false;
    for (let i = 0; i < ids.length; i += 1) {
      if (counts[i]! > 0 && hits[at]!.has(ids[i]!)) {
        counts[i]! -= 1;
        const ok = survives(counts, at + 1);
        counts[i]! += 1;
        if (!ok) return false;
      }
    }
    return true;
  };
  let base = 0;
  let survive = 0;
  let total = 0;
  const n = physical.length;
  const pick = (start: number, chosen: number[]): void => {
    if (chosen.length === 3) {
      total += 1;
      const counts = ids.map((id) => chosen.filter((x) => x === id).length);
      if (holds(counts)) {
        base += 1;
        if (survives(counts, 0)) survive += 1;
      }
      return;
    }
    for (let i = start; i < n; i += 1) pick(i + 1, [...chosen, physical[i]!]);
  };
  pick(0, []);
  return { base, survive, total };
}

describe("analyzeVersus", () => {
  const cases: { name: string; conditions: HandCondition[]; traps: { name: string; hits: number[] }[]; pairs?: [number, number][] }[] = [
    {
      name: "a two-card requirement against a handtrap that hits one of them",
      conditions: [condition("a", [[1, 1], [2, 1]])],
      traps: [{ name: "T1", hits: [1] }],
    },
    {
      name: "alternative conditions give the goal a backup",
      conditions: [condition("a", [[1, 1]]), condition("b", [[2, 1]])],
      traps: [{ name: "T1", hits: [1, 2] }],
    },
    {
      name: "an exclude that a removal could lift",
      conditions: [condition("a", [[1, 1]], [[5, 1]])],
      traps: [{ name: "T1", hits: [5] }],
    },
    {
      name: "a pair of handtraps removes two cards",
      conditions: [condition("a", [[1, 1]]), condition("b", [[2, 1]]), condition("c", [[3, 1]])],
      traps: [
        { name: "T1", hits: [1, 2] },
        { name: "T2", hits: [2, 3] },
      ],
      pairs: [[0, 1]],
    },
    {
      name: "the same handtrap twice",
      conditions: [condition("a", [[1, 2]])],
      traps: [{ name: "T1", hits: [1] }],
      pairs: [[0, 0]],
    },
  ];

  for (const testCase of cases) {
    it(`matches a brute-force count: ${testCase.name}`, () => {
      const doc = build(testCase.conditions, testCase.traps, testCase.pairs);
      const result = analyzeVersus(doc);
      if ("error" in result) throw new Error(result.error);
      const scenarios = scenariosFor(doc);
      expect(result.scenarios).toHaveLength(scenarios.length);
      for (const outcome of result.scenarios) {
        const expected = brute(doc, outcome.scenario.handtrapIds);
        expect(result.total).toBe(BigInt(expected.total));
        expect(result.baseline[0]!.weight).toBe(BigInt(expected.base));
        expect(outcome.goals[0]!.weight).toBe(BigInt(expected.survive));
      }
    });
  }

  it("never lets a handtrap raise the odds and a pair is no better than either alone", () => {
    const doc = build(
      [condition("a", [[1, 1]]), condition("b", [[2, 1]]), condition("c", [[3, 1]])],
      [
        { name: "T1", hits: [1, 2] },
        { name: "T2", hits: [2, 3] },
      ],
      [[0, 1]],
    );
    const result = analyzeVersus(doc);
    if ("error" in result) throw new Error(result.error);
    const [one, two, pair] = result.scenarios;
    const base = result.baseline[0]!.weight;
    expect(one!.goals[0]!.weight).toBeLessThanOrEqual(base);
    expect(two!.goals[0]!.weight).toBeLessThanOrEqual(base);
    expect(pair!.goals[0]!.weight).toBeLessThanOrEqual(one!.goals[0]!.weight);
    expect(pair!.goals[0]!.weight).toBeLessThanOrEqual(two!.goals[0]!.weight);
  });

  it("a handtrap with nothing to hit changes nothing", () => {
    const doc = build([condition("a", [[1, 1]])], [{ name: "T1", hits: [] }]);
    const result = analyzeVersus(doc);
    if ("error" in result) throw new Error(result.error);
    expect(result.scenarios[0]!.goals[0]!.weight).toBe(result.baseline[0]!.weight);
  });

  it("asks for a Hand Goal when there is none", () => {
    expect("error" in analyzeVersus(createDocument("empty"))).toBe(true);
  });
});

describe("handtrap data", () => {
  it("round-trips through a saved file and drops pairs whose handtrap is gone", () => {
    let doc = build([condition("a", [[1, 1]])], [{ name: "A", hits: [1, 2] }, { name: "B", hits: [3] }], [[0, 1]]);
    const restored = parseMappingJson(serializeMapping(doc));
    expect(restored.handtraps.map((h) => [h.name, h.hits])).toEqual([["A", [1, 2]], ["B", [3]]]);
    expect(restored.handtrap_pairs).toHaveLength(1);
    doc = removeHandtrap(doc, doc.handtraps[0]!.id);
    expect(doc.handtrap_pairs).toHaveLength(0);
  });

  it("keeps a pair only once, in either order, and tolerates bad saved data", () => {
    const doc = build([condition("a", [[1, 1]])], [{ name: "A", hits: [] }, { name: "B", hits: [] }]);
    const [a, b] = doc.handtraps;
    const once = addHandtrapPair(addHandtrapPair(doc, a!.id, b!.id), b!.id, a!.id);
    expect(once.handtrap_pairs).toHaveLength(1);
    expect(parseHandtraps("nope")).toEqual([]);
    expect(parsePairs([{ id: "p", handtrap_ids: ["x", "y"] }], doc.handtraps)).toEqual([]);
  });
});
