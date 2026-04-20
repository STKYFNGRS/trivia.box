import { describe, expect, it } from "vitest";
import {
  NO_TIMER_FALLBACK_POINTS,
  STREAK_BONUSES,
  computeAnswerPoints,
} from "./scoring";

describe("computeAnswerPoints", () => {
  it("wrong answer → 0 points and streak reset, regardless of speed", () => {
    const result = computeAnswerPoints({
      isCorrect: false,
      timeToAnswerMs: 0,
      timerSeconds: 20,
      previousStreak: 4,
    });
    expect(result.points).toBe(0);
    expect(result.basePoints).toBe(0);
    expect(result.streakBonus).toBe(0);
    expect(result.newStreak).toBe(0);
  });

  it("instant correct answer → full timer-second points", () => {
    const result = computeAnswerPoints({
      isCorrect: true,
      timeToAnswerMs: 0,
      timerSeconds: 20,
      previousStreak: 0,
    });
    expect(result.basePoints).toBe(20);
    expect(result.points).toBe(20);
    expect(result.newStreak).toBe(1);
  });

  it("buzzer-beater correct answer → 0 base points", () => {
    const result = computeAnswerPoints({
      isCorrect: true,
      timeToAnswerMs: 20_000,
      timerSeconds: 20,
      previousStreak: 0,
    });
    expect(result.basePoints).toBe(0);
    expect(result.points).toBe(0);
    expect(result.fraction).toBe(0);
  });

  it("mid-answer on a 15s timer → timer minus elapsed seconds", () => {
    // 15s timer, 2s elapsed → 13 base (exactly the spec example).
    const result = computeAnswerPoints({
      isCorrect: true,
      timeToAnswerMs: 2_000,
      timerSeconds: 15,
      previousStreak: 0,
    });
    expect(result.basePoints).toBe(13);
    expect(result.points).toBe(13);
  });

  it("half-time correct answer → half the timer", () => {
    const result = computeAnswerPoints({
      isCorrect: true,
      timeToAnswerMs: 10_000,
      timerSeconds: 20,
      previousStreak: 0,
    });
    expect(result.basePoints).toBe(10);
    expect(result.points).toBe(10);
  });

  it("answering past the timer clamps to 0 (never negative)", () => {
    const result = computeAnswerPoints({
      isCorrect: true,
      timeToAnswerMs: 999_999,
      timerSeconds: 20,
      previousStreak: 0,
    });
    expect(result.basePoints).toBe(0);
    expect(result.points).toBeGreaterThanOrEqual(0);
  });

  it("sub-second elapsed floors to 0 (still full timer-second credit)", () => {
    const result = computeAnswerPoints({
      isCorrect: true,
      timeToAnswerMs: 999,
      timerSeconds: 15,
      previousStreak: 0,
    });
    expect(result.basePoints).toBe(15);
  });

  it("streak bonus adds on top of speed-based base (+3 at streak 3)", () => {
    // previousStreak 2 → newStreak 3 → +3 bonus.
    const result = computeAnswerPoints({
      isCorrect: true,
      timeToAnswerMs: 0,
      timerSeconds: 20,
      previousStreak: 2,
    });
    expect(result.newStreak).toBe(3);
    expect(result.streakBonus).toBe(STREAK_BONUSES[3]);
    expect(result.streakBonus).toBe(3);
    expect(result.points).toBe(20 + 3);
  });

  it("streak bonus at 10 is +15", () => {
    const result = computeAnswerPoints({
      isCorrect: true,
      timeToAnswerMs: 0,
      timerSeconds: 15,
      previousStreak: 9,
    });
    expect(result.newStreak).toBe(10);
    expect(result.streakBonus).toBe(15);
    expect(result.points).toBe(15 + 15);
  });

  it("streak bonus scales 3 < 5 < 7 < 10 in the expected order", () => {
    expect(STREAK_BONUSES[3]).toBe(3);
    expect(STREAK_BONUSES[5]).toBe(5);
    expect(STREAK_BONUSES[7]).toBe(10);
    expect(STREAK_BONUSES[10]).toBe(15);
    expect(STREAK_BONUSES[5]).toBeGreaterThan(STREAK_BONUSES[3]);
    expect(STREAK_BONUSES[7]).toBeGreaterThan(STREAK_BONUSES[5]);
    expect(STREAK_BONUSES[10]).toBeGreaterThan(STREAK_BONUSES[7]);
  });

  it("no streak bonus at non-threshold counts", () => {
    const result = computeAnswerPoints({
      isCorrect: true,
      timeToAnswerMs: 0,
      timerSeconds: 20,
      previousStreak: 1,
    });
    expect(result.newStreak).toBe(2);
    expect(result.streakBonus).toBe(0);
    expect(result.points).toBe(20);
  });

  it("degenerate timer (null/0) falls back to flat NO_TIMER_FALLBACK_POINTS", () => {
    const nullResult = computeAnswerPoints({
      isCorrect: true,
      timeToAnswerMs: 1234,
      timerSeconds: null,
      previousStreak: 0,
    });
    expect(nullResult.points).toBe(NO_TIMER_FALLBACK_POINTS);
    const zeroResult = computeAnswerPoints({
      isCorrect: true,
      timeToAnswerMs: 1234,
      timerSeconds: 0,
      previousStreak: 0,
    });
    expect(zeroResult.points).toBe(NO_TIMER_FALLBACK_POINTS);
  });

  it("negative previousStreak is clamped to 0", () => {
    const result = computeAnswerPoints({
      isCorrect: true,
      timeToAnswerMs: 0,
      timerSeconds: 20,
      previousStreak: -5,
    });
    expect(result.newStreak).toBe(1);
  });

  it("is monotone: faster answers score at least as much as slower ones", () => {
    const fast = computeAnswerPoints({
      isCorrect: true,
      timeToAnswerMs: 2_000,
      timerSeconds: 20,
      previousStreak: 0,
    });
    const slow = computeAnswerPoints({
      isCorrect: true,
      timeToAnswerMs: 18_000,
      timerSeconds: 20,
      previousStreak: 0,
    });
    expect(fast.points).toBeGreaterThan(slow.points);
  });

  it("realistic 10-question perfect run on 15s timer stays within the new economy", () => {
    // Worst-case "instant correct, streak all the way to 10" run.
    const perQuestion = 15;
    const base = perQuestion * 10;
    const streakBonusTotal =
      (STREAK_BONUSES[3] ?? 0) +
      (STREAK_BONUSES[5] ?? 0) +
      (STREAK_BONUSES[7] ?? 0) +
      (STREAK_BONUSES[10] ?? 0);
    expect(base + streakBonusTotal).toBeLessThanOrEqual(200);
  });
});
