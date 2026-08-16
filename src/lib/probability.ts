export class ProbabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProbabilityError";
  }
}

/** Exact binomial coefficient C(n, k) as bigint. */
export function combinations(n: number, k: number): bigint {
  if (k < 0 || k > n) return 0n;
  const limited = Math.min(k, n - k);
  let result = 1n;
  for (let i = 1; i <= limited; i += 1) {
    result = (result * BigInt(n - limited + i)) / BigInt(i);
  }
  return result;
}

/** Convert exact bigint ratio to Number without rounding intermediates. */
export function ratioToNumber(numerator: bigint, denominator: bigint): number {
  if (denominator === 0n) {
    throw new ProbabilityError("division by zero");
  }
  if (numerator === 0n) return 0;
  const scale = 10n ** 24n;
  return Number((numerator * scale) / denominator) / 1e24;
}

function assertDraw(deckSize: number, copies: number, handSize: number): void {
  if (
    !Number.isInteger(deckSize) ||
    !Number.isInteger(copies) ||
    !Number.isInteger(handSize) ||
    deckSize < 0 ||
    copies < 0 ||
    handSize < 0 ||
    copies > deckSize ||
    handSize > deckSize
  ) {
    throw new ProbabilityError("copies and hand_size must fit inside deck_size");
  }
}

export function openingCountProbability(
  deckSize: number,
  copies: number,
  handSize: number,
  count: number,
): number {
  assertDraw(deckSize, copies, handSize);
  if (!Number.isInteger(count) || count < 0 || count > handSize || count > copies) {
    return 0;
  }
  const failures = deckSize - copies;
  const drawnFailures = handSize - count;
  if (drawnFailures < 0 || drawnFailures > failures) return 0;
  const denominator = combinations(deckSize, handSize);
  if (denominator === 0n) return 0;
  const numerator =
    combinations(copies, count) * combinations(failures, drawnFailures);
  return ratioToNumber(numerator, denominator);
}

export function openingAtLeastProbability(
  deckSize: number,
  copies: number,
  handSize: number,
  minimum: number,
): number {
  if (minimum <= 0) return 1;
  assertDraw(deckSize, copies, handSize);
  if (minimum > handSize || minimum > copies) return 0;
  const upper = Math.min(handSize, copies);
  let total = 0;
  for (let count = minimum; count <= upper; count += 1) {
    total += openingCountProbability(deckSize, copies, handSize, count);
  }
  return total;
}

export function openingCountDistribution(
  deckSize: number,
  copies: number,
  handSize: number,
): { exact: Record<number, number>; atLeast3: number } {
  return {
    exact: {
      0: openingCountProbability(deckSize, copies, handSize, 0),
      1: openingCountProbability(deckSize, copies, handSize, 1),
      2: openingCountProbability(deckSize, copies, handSize, 2),
    },
    atLeast3: openingAtLeastProbability(deckSize, copies, handSize, 3),
  };
}
