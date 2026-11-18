import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, matchPush, type ScorecardSettings, type TurnScore } from "./scorecard";

// Curves: index 0 is Opens, then the survival after 1, 2 and 3 interruptions.
const turn = (curve: number[]) => ({ interruptions: curve }) as unknown as TurnScore;
const first = turn([0.9, 0.5, 0.3, 0.1]);
const second = turn([0.95, 0.6, 0.4, 0.2]);

const settings = (patch: Partial<ScorecardSettings> = {}): ScorecardSettings => ({ ...DEFAULT_SETTINGS, ...patch });

describe("match-weighted push", () => {
  it("weights each kind of game by how often it happens (a 50% deck)", () => {
    // Game 1: first and second, half each. Game 2: first (lost game 1) 0.5, second (won game 1) 0.5.
    // Game 3 is played when the match is split, 2 * 0.5 * 0.5 = 0.5 of the time, first half of those.
    // Games played: 1 + 1 + 0.5 = 2.5.
    // First, 1 to 2 handtraps (game 1): (0.5 + 0.3) / 2 = 0.4. First, 1 to 3 after a loss: (0.5 + 0.3 + 0.1) / 3 = 0.3.
    // Second, 1 to 2 handtraps: (0.6 + 0.4) / 2 = 0.5.
    // 0.5*0.4 + 0.5*0.5 + 0.5*0.3 + 0.5*0.5 + 0.25*0.3 + 0.25*0.5 = 1.05, over 2.5 games.
    const result = matchPush(first, second, settings());
    expect(result.value).toBeCloseTo(1.05 / 2.5, 12);
    expect(result.goingFirstShare).toBeCloseTo(0.5, 12);
    expect(result.situations.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1, 12);
  });

  it("goes first less often with a better deck and more often with a worse one", () => {
    // 60%: game 2 first 0.4, game 3 played 0.48. First = 0.5 + 0.4 + 0.24 = 1.14 of 2.48 games.
    expect(matchPush(first, second, settings({ winRate: 60 })).goingFirstShare).toBeCloseTo(1.14 / 2.48, 12);
    // 40%: game 2 first 0.6. First = 0.5 + 0.6 + 0.24 = 1.34 of 2.48.
    expect(matchPush(first, second, settings({ winRate: 40 })).goingFirstShare).toBeCloseTo(1.34 / 2.48, 12);
    // 60% value: 0.5*0.4 + 0.5*0.5 + 0.4*0.3 + 0.6*0.5 + 0.24*0.3 + 0.24*0.5 = 1.062, over 2.48.
    expect(matchPush(first, second, settings({ winRate: 60 })).value).toBeCloseTo(1.062 / 2.48, 12);
  });

  it("uses the handtrap counts you set", () => {
    // Only one handtrap ever: every situation is the survival after 1: first 0.5, second 0.6.
    const one = matchPush(first, second, settings({ handtrapsAfterLoss: 1, handtrapsOtherwise: 1 }));
    // First shares sum to 0.5 of games, second 0.5 (p = 0.5): 0.5*0.5 + 0.5*0.6 = 0.55.
    expect(one.value).toBeCloseTo(0.55, 12);
    expect(one.situations.every((s) => s.upTo === 1)).toBe(true);
  });

  it("leaves out what the curves do not reach and says nothing when they are empty", () => {
    expect(matchPush(turn([]), turn([]), settings()).value).toBeNull();
    // A curve that stops after 2 cannot measure 1 to 3: those situations drop out of the mean.
    const short = matchPush(turn([0.9, 0.5, 0.3]), second, settings());
    const dropped = short.situations.filter((s) => s.push === null);
    expect(dropped.map((s) => s.label)).toEqual(["Game 2, going first (you lost game 1)", "Game 3, going first"]);
    expect(short.value).not.toBeNull();
  });
});
