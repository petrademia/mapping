import { describe, expect, it } from "vitest";
import {
  eligibleCardNames,
  evaluateDistinctMatch,
  findDistinctAssignment,
  type DistinctMatchConstraint,
} from "./distinctMatch";
import { groupsToMembership, type Group } from "./handCondition";
import type { MappingCard } from "./document";
import type { ConditionRequirement } from "./handExplorer";
import type { CardTaxonomy } from "./taxonomy";

function tax(roles: CardTaxonomy["roles"] = []): CardTaxonomy {
  return {
    roles,
    opening_quality: { going_first: null, going_second: null },
  };
}

function card(
  card_id: number,
  quantity: number,
  roles: CardTaxonomy["roles"] = [],
): MappingCard {
  return { card_id, quantity, taxonomy: tax(roles) };
}

const medius = 1;
const vidolium = 2;
const terminus = 3;
const ash = 4;
const extenderX = 5;

function deckFixture(): MappingCard[] {
  return [
    card(medius, 3, ["starter", "extender"]),
    card(vidolium, 3, ["starter", "extender"]),
    card(terminus, 2, ["starter"]),
    card(extenderX, 2, ["extender"]),
    card(ash, 3, ["interaction"]),
  ];
}

function handCounts(
  deck: readonly MappingCard[],
  counts: Record<number, number>,
): number[] {
  return deck.map((row) => counts[row.card_id] ?? 0);
}

const starterReq: ConditionRequirement = {
  id: "req-starter",
  kind: "group",
  group_id: "starters",
  op: "gte",
  count: 1,
};
const extenderReq: ConditionRequirement = {
  id: "req-extender",
  kind: "group",
  group_id: "extenders",
  op: "gte",
  count: 1,
};

const groups: Group[] = [
  { id: "starters", name: "Full Combo Starters", card_ids: [medius, vidolium, terminus] },
  { id: "extenders", name: "Independent Extenders", card_ids: [medius, vidolium, extenderX] },
];

const constraint: DistinctMatchConstraint = {
  id: "dc-1",
  requirement_ids: ["req-starter", "req-extender"],
  distinct_by: "card_name",
};

describe("distinctMatch", () => {
  const deck = deckFixture();
  const membership = groupsToMembership(groups);
  const requirements = [starterReq, extenderReq];

  it("fails when one card name satisfies both requirements", () => {
    const hand = handCounts(deck, { [medius]: 1, [ash]: 1 });
    const evaluation = evaluateDistinctMatch(
      hand,
      deck,
      requirements,
      constraint,
      membership,
    );
    expect(evaluation.passed).toBe(false);
    expect(evaluation.assignment).toBeNull();
  });

  it("fails for two physical copies of the same card name", () => {
    const hand = handCounts(deck, { [medius]: 2 });
    const evaluation = evaluateDistinctMatch(
      hand,
      deck,
      requirements,
      constraint,
      membership,
    );
    expect(evaluation.passed).toBe(false);
  });

  it("passes when two different qualifying card names are present", () => {
    const hand = handCounts(deck, { [medius]: 1, [vidolium]: 1 });
    const evaluation = evaluateDistinctMatch(
      hand,
      deck,
      requirements,
      constraint,
      membership,
    );
    expect(evaluation.passed).toBe(true);
    expect(evaluation.assignment).not.toBeNull();
    const values = Object.values(evaluation.assignment!);
    expect(new Set(values).size).toBe(2);
  });

  it("passes asymmetric overlap when a valid assignment exists", () => {
    const asymmetricGroups = groupsToMembership([
      { id: "starters", name: "S", card_ids: [medius] },
      { id: "extenders", name: "E", card_ids: [medius, vidolium] },
    ]);
    const hand = handCounts(deck, { [medius]: 1, [vidolium]: 1 });
    expect(
      evaluateDistinctMatch(hand, deck, requirements, constraint, asymmetricGroups)
        .passed,
    ).toBe(true);
  });

  it("passes when starter must take the non-overlapping name", () => {
    const asymmetricGroups = groupsToMembership([
      { id: "starters", name: "S", card_ids: [medius, vidolium] },
      { id: "extenders", name: "E", card_ids: [medius] },
    ]);
    const hand = handCounts(deck, { [medius]: 1, [vidolium]: 1 });
    const evaluation = evaluateDistinctMatch(
      hand,
      deck,
      requirements,
      constraint,
      asymmetricGroups,
    );
    expect(evaluation.passed).toBe(true);
    expect(evaluation.assignment?.["req-starter"]).toBe(vidolium);
    expect(evaluation.assignment?.["req-extender"]).toBe(medius);
  });

  it("fails when no assignment exists", () => {
    const asymmetricGroups = groupsToMembership([
      { id: "starters", name: "S", card_ids: [medius] },
      { id: "extenders", name: "E", card_ids: [medius] },
    ]);
    const hand = handCounts(deck, { [medius]: 1, [vidolium]: 1 });
    expect(
      evaluateDistinctMatch(hand, deck, requirements, constraint, asymmetricGroups)
        .passed,
    ).toBe(false);
  });

  it("supports three-way distinct assignment PASS and FAIL", () => {
    const interactionReq: ConditionRequirement = {
      id: "req-interaction",
      kind: "role",
      role: "interaction",
      op: "gte",
      count: 1,
    };
    const three: DistinctMatchConstraint = {
      id: "dc-3",
      requirement_ids: ["req-starter", "req-extender", "req-interaction"],
      distinct_by: "card_name",
    };
    const reqs = [...requirements, interactionReq];
    const passHand = handCounts(deck, {
      [medius]: 1,
      [vidolium]: 1,
      [ash]: 1,
    });
    expect(
      evaluateDistinctMatch(passHand, deck, reqs, three, membership).passed,
    ).toBe(true);

    const failHand = handCounts(deck, { [medius]: 1, [ash]: 1 });
    expect(
      evaluateDistinctMatch(failHand, deck, reqs, three, membership).passed,
    ).toBe(false);
  });

  it("supports Card + Group and Role + Group matching", () => {
    const cardReq: ConditionRequirement = {
      id: "req-card",
      kind: "card",
      card_id: ash,
      op: "gte",
      count: 1,
    };
    const roleReq: ConditionRequirement = {
      id: "req-role-starter",
      kind: "role",
      role: "starter",
      op: "gte",
      count: 1,
    };
    const cardGroupHand = handCounts(deck, { [medius]: 1, [ash]: 1 });
    expect(
      evaluateDistinctMatch(
        cardGroupHand,
        deck,
        [cardReq, starterReq],
        {
          id: "dc-cg",
          requirement_ids: ["req-card", "req-starter"],
          distinct_by: "card_name",
        },
        membership,
      ).passed,
    ).toBe(true);
    // Medius alone cannot cover starter-role + extender-group distinctly;
    // need a second qualifying name (extenderX).
    const roleGroupHand = handCounts(deck, { [medius]: 1, [extenderX]: 1 });
    expect(
      evaluateDistinctMatch(
        roleGroupHand,
        deck,
        [roleReq, extenderReq],
        {
          id: "dc-rg",
          requirement_ids: ["req-role-starter", "req-extender"],
          distinct_by: "card_name",
        },
        membership,
      ).passed,
    ).toBe(true);
  });

  it("supports Role + Role matching with multi-label cards", () => {
    const starterRole: ConditionRequirement = {
      id: "r-s",
      kind: "role",
      role: "starter",
      op: "gte",
      count: 1,
    };
    const extenderRole: ConditionRequirement = {
      id: "r-e",
      kind: "role",
      role: "extender",
      op: "gte",
      count: 1,
    };
    const same = handCounts(deck, { [medius]: 1 });
    expect(
      evaluateDistinctMatch(
        same,
        deck,
        [starterRole, extenderRole],
        { id: "dc-rr", requirement_ids: ["r-s", "r-e"], distinct_by: "card_name" },
        membership,
      ).passed,
    ).toBe(false);
    const different = handCounts(deck, { [medius]: 1, [extenderX]: 1 });
    expect(
      evaluateDistinctMatch(
        different,
        deck,
        [starterRole, extenderRole],
        { id: "dc-rr", requirement_ids: ["r-s", "r-e"], distinct_by: "card_name" },
        membership,
      ).passed,
    ).toBe(true);
  });

  it("findDistinctAssignment solves a small bipartite case", () => {
    const eligible = new Map([
      ["a", [1, 2]],
      ["b", [1, 2]],
    ]);
    expect(findDistinctAssignment(eligible, ["a", "b"])).not.toBeNull();
    expect(findDistinctAssignment(new Map([["a", [1]], ["b", [1]]]), ["a", "b"])).toBeNull();
  });

  it("eligibleCardNames is empty for non-presence predicates", () => {
    const hand = handCounts(deck, { [medius]: 2 });
    expect(
      eligibleCardNames(
        hand,
        deck,
        { id: "x", kind: "group", group_id: "starters", op: "gte", count: 2 },
        membership,
      ),
    ).toEqual([]);
  });
});
