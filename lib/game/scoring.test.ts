import { describe, expect, it } from "vitest";
import {
  DIFFICULTY_POINT_WEIGHTS,
  NO_TIMER_FALLBACK_POINTS,
  STREAK_BONUSES,
  computeAnswerPoints,
  normalizeDifficulty,
} from "./scoring";

describe("computeAnswerPoints", () => {
  it("wrong answer → 0 points and streak reset, regardless of speed", () => {
    const result = computeAnswerPoints({
      isCorrect: false,
      timeToAnswerMs: 0,
      timerSeconds: 20,
      previousStreak: 4,
      difficulty: 3,
    });
    expect(result.points).toBe(0);
    expect(result.basePoints).toBe(0);
    expect(result.streakBonus).toBe(0);
    expect(result.newStreak).toBe(0);
  });

  it("instant correct hard → full timer-second points", () => {
    const result = computeAnswerPoints({
      isCorrect: true,
      timeToAnswerMs: 0,
      timerSeconds: 20,
      previousStreak: 0,
      difficulty: 3,
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
      difficulty: 3,
    });
    expect(result.basePoints).toBe(0);
    expect(result.points).toBe(0);
    expect(result.fraction).toBe(0);
  });

  it("hard mid-answer on a 15s timer → timer minus elapsed seconds", () => {
    // 15s timer, 2s elapsed, hard → 13 base (original spec example).
    const result = computeAnswerPoints({
      isCorrect: true,
      timeToAnswerMs: 2_000,
      timerSeconds: 15,
      previousStreak: 0,
      difficulty: 3,
    });
    expect(result.basePoints).toBe(13);
    expect(result.points).toBe(13);
  });

  it("hard half-time correct answer → half the timer", () => {
    const result = computeAnswerPoints({
      isCorrect: true,
      timeToAnswerMs: 10_000,
      timerSeconds: 20,
      previousStreak: 0,
      difficulty: 3,
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
      difficulty: 3,
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
      difficulty: 3,
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
      difficulty: 3,
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
      difficulty: 3,
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
      difficulty: 3,
    });
    expect(result.newStreak).toBe(2);
    expect(result.streakBonus).toBe(0);
    expect(result.points).toBe(20);
  });

  it("degenerate timer (null/0) falls back to flat NO_TIMER_FALLBACK_POINTS (scaled)", () => {
    // Hard weight = 1.0 so the fallback is unchanged at NO_TIMER_FALLBACK_POINTS.
    const nullResult = computeAnswerPoints({
      isCorrect: true,
      timeToAnswerMs: 1234,
      timerSeconds: null,
      previousStreak: 0,
      difficulty: 3,
    });
    expect(nullResult.points).toBe(NO_TIMER_FALLBACK_POINTS);
    const zeroResult = computeAnswerPoints({
      isCorrect: true,
      timeToAnswerMs: 1234,
      timerSeconds: 0,
      previousStreak: 0,
      difficulty: 3,
    });
    expect(zeroResult.points).toBe(NO_TIMER_FALLBACK_POINTS);
  });

  it("negative previousStreak is clamped to 0", () => {
    const result = computeAnswerPoints({
      isCorrect: true,
      timeToAnswerMs: 0,
      timerSeconds: 20,
      previousStreak: -5,
      difficulty: 3,
    });
    expect(result.newStreak).toBe(1);
  });

  it("is monotone: faster answers score at least as much as slower ones", () => {
    const fast = computeAnswerPoints({
      isCorrect: true,
      timeToAnswerMs: 2_000,
      timerSeconds: 20,
      previousStreak: 0,
      difficulty: 3,
    });
    const slow = computeAnswerPoints({
      isCorrect: true,
      timeToAnswerMs: 18_000,
      timerSeconds: 20,
      previousStreak: 0,
      difficulty: 3,
    });
    expect(fast.points).toBeGreaterThan(slow.points);
  });

  it("realistic 10-question perfect run on 15s timer stays within the new economy", () => {
    // Worst-case "instant correct hard, streak all the way to 10" run.
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

describe("computeAnswerPoints — difficulty scaling", () => {
  // User spec: 10s timer, "answered with 6s remaining" (i.e., 4s elapsed).
  // hard = 6, medium = 4, easy = 2. Medium and easy are exact (round(6*2/3)
  // = 4, round(6*1/3) = 2). This is the canonical acceptance case.
  it("hard 10s timer, 4s elapsed → 6 base points", () => {
    const result = computeAnswerPoints({
      isCorrect: true,
      timeToAnswerMs: 4_000,
      timerSeconds: 10,
      previousStreak: 0,
      difficulty: 3,
    });
    expect(result.basePoints).toBe(6);
    expect(result.difficultyWeight).toBe(1);
  });

  it("medium 10s timer, 4s elapsed → 4 base points (6 × 2/3 rounded)", () => {
    const result = computeAnswerPoints({
      isCorrect: true,
      timeToAnswerMs: 4_000,
      timerSeconds: 10,
      previousStreak: 0,
      difficulty: 2,
    });
    expect(result.basePoints).toBe(4);
    expect(result.difficultyWeight).toBeCloseTo(2 / 3, 5);
  });

  it("easy 10s timer, 4s elapsed → 2 base points (6 × 1/3 rounded)", () => {
    const result = computeAnswerPoints({
      isCorrect: true,
      timeToAnswerMs: 4_000,
      timerSeconds: 10,
      previousStreak: 0,
      difficulty: 1,
    });
    expect(result.basePoints).toBe(2);
    expect(result.difficultyWeight).toBeCloseTo(1 / 3, 5);
  });

  it("easy 30s, 10s elapsed → 7 base points (20 × 1/3 rounded)", () => {
    const result = computeAnswerPoints({
      isCorrect: true,
      timeToAnswerMs: 10_000,
      timerSeconds: 30,
      previousStreak: 0,
      difficulty: 1,
    });
    // 20 * 1/3 = 6.67 → round → 7
    expect(result.basePoints).toBe(7);
  });

  it("30s easy does NOT out-score 10s hard answered equally fast", () => {
    // Same relative quickness (answered halfway through the timer). The
    // whole point of difficulty scaling is that the hard question still
    // beats the easy one, not the other way around.
    const easy30 = computeAnswerPoints({
      isCorrect: true,
      timeToAnswerMs: 15_000,
      timerSeconds: 30,
      previousStreak: 0,
      difficulty: 1,
    });
    const hard10 = computeAnswerPoints({
      isCorrect: true,
      timeToAnswerMs: 5_000,
      timerSeconds: 10,
      previousStreak: 0,
      difficulty: 3,
    });
    expect(hard10.basePoints).toBeGreaterThanOrEqual(easy30.basePoints);
  });

  it("streak bonus is NOT scaled by difficulty — flat on top of scaled base", () => {
    // medium 15s, instant → 10 base (15 × 2/3 rounded). Streak +3 @ newStreak=3.
    // Points should be 10 + 3, not (10 + 3) × weight nor (10 × w) + (3 × w).
    const result = computeAnswerPoints({
      isCorrect: true,
      timeToAnswerMs: 0,
      timerSeconds: 15,
      previousStreak: 2,
      difficulty: 2,
    });
    expect(result.basePoints).toBe(10);
    expect(result.streakBonus).toBe(3);
    expect(result.points).toBe(13);
  });

  it("weight table shape: easy 1/3 < medium 2/3 < hard 1", () => {
    expect(DIFFICULTY_POINT_WEIGHTS[1]).toBeCloseTo(1 / 3, 5);
    expect(DIFFICULTY_POINT_WEIGHTS[2]).toBeCloseTo(2 / 3, 5);
    expect(DIFFICULTY_POINT_WEIGHTS[3]).toBe(1);
    expect(DIFFICULTY_POINT_WEIGHTS[1]).toBeLessThan(DIFFICULTY_POINT_WEIGHTS[2]);
    expect(DIFFICULTY_POINT_WEIGHTS[2]).toBeLessThan(DIFFICULTY_POINT_WEIGHTS[3]);
  });
});

describe("normalizeDifficulty", () => {
  it("passes through valid 1/2/3", () => {
    expect(normalizeDifficulty(1)).toBe(1);
    expect(normalizeDifficulty(2)).toBe(2);
    expect(normalizeDifficulty(3)).toBe(3);
  });

  it("falls back to medium (2) for null / undefined / out-of-range", () => {
    expect(normalizeDifficulty(null)).toBe(2);
    expect(normalizeDifficulty(undefined)).toBe(2);
    expect(normalizeDifficulty(0)).toBe(2);
    expect(normalizeDifficulty(4)).toBe(2);
    expect(normalizeDifficulty(-1)).toBe(2);
  });
});
