import type { MappingCard } from "./document";
import type {
  GroupMembership,
  HandConditionLike,
  HandConditionSetLike,
} from "./handExplorer";
import {
  drawRandomHand,
  evaluateHandTest,
  type HandTestResult,
  type TestedHand,
} from "./handTest";

/** Upper bound for one batch; keeps the UI responsive and the list readable. */
export const MAX_BATCH_HANDS = 1000;

export interface BatchHand {
  /** 1-based position in the generated batch. */
  index: number;
  hand: TestedHand;
  result: HandTestResult;
}

export interface BatchPassRate {
  id: string;
  name: string;
  passed: number;
  /** passed / batch size, 0 for an empty batch. */
  rate: number;
}

export interface BatchSummary {
  count: number;
  sets: BatchPassRate[];
  conditions: BatchPassRate[];
}

export function validateBatchCount(count: number): void {
  if (!Number.isInteger(count) || count < 1 || count > MAX_BATCH_HANDS) {
    throw new Error(`hand count must be an integer from 1 to ${MAX_BATCH_HANDS}`);
  }
}

/**
 * Draw `count` independent random hands and evaluate each against every Hand
 * Condition and Condition Set. Each hand samples physical cards uniformly, the
 * same way a single Draw Random Hand does. `rng` is injectable for tests.
 */
export function generateHandBatch(
  deck: readonly MappingCard[],
  observed_cards: number,
  count: number,
  conditions: readonly HandConditionLike[],
  sets: readonly HandConditionSetLike[],
  groups: GroupMembership = new Map(),
  rng: () => number = Math.random,
): BatchHand[] {
  validateBatchCount(count);
  const batch: BatchHand[] = [];
  for (let index = 1; index <= count; index += 1) {
    const hand = drawRandomHand(deck, observed_cards, rng);
    batch.push({
      index,
      hand,
      result: evaluateHandTest(deck, hand.card_counts, conditions, sets, groups),
    });
  }
  return batch;
}

/** How many hands in the batch satisfied each Condition Set and Condition. */
export function summarizeBatch(batch: readonly BatchHand[]): BatchSummary {
  const count = batch.length;
  const sets = new Map<string, BatchPassRate>();
  const conditions = new Map<string, BatchPassRate>();
  for (const { result } of batch) {
    for (const set of result.sets) {
      const entry = sets.get(set.setId) ?? { id: set.setId, name: set.name, passed: 0, rate: 0 };
      if (set.passed) entry.passed += 1;
      sets.set(set.setId, entry);
    }
    for (const condition of result.conditions) {
      const entry = conditions.get(condition.conditionId) ?? {
        id: condition.conditionId,
        name: condition.name,
        passed: 0,
        rate: 0,
      };
      if (condition.passed) entry.passed += 1;
      conditions.set(condition.conditionId, entry);
    }
  }
  const finish = (entries: Map<string, BatchPassRate>): BatchPassRate[] =>
    [...entries.values()].map((entry) => ({
      ...entry,
      rate: count === 0 ? 0 : entry.passed / count,
    }));
  return { count, sets: finish(sets), conditions: finish(conditions) };
}
