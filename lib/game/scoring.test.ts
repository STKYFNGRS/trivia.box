import { describe, expect, it } from "vitest";
import { BASE_POINTS, STREAK_BONUSES, computeAnswerPoints } from "./scoring";

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

  it("instant correct answer → full base points", () => {
    const result = computeAnswerPoints({
      isCorrect: true,
      timeToAnswerMs: 0,
      timerSeconds: 20,
      previousStreak: 0,
    });
    expect(result.basePoints).toBe(BASE_POINTS);
    expect(result.points).toBe(BASE_POINTS);
    expect(result.newStreak).toBe(1);
  });

  it("buzzer-beater correct answer → half base points", () => {
    const result = computeAnswerPoints({
      isCorrect: true,
      timeToAnswerMs: 20_000,
      timerSeconds: 20,
      previousStreak: 0,
    });
    expect(result.basePoints).toBe(Math.round(BASE_POINTS * 0.5));
    expect(result.fraction).toBe(0);
  });

  it("half-time correct answer → 750 points (0.5 + 0.5 * 0.5)", () => {
    const result = computeAnswerPoints({
      isCorrect: true,
      timeToAnswerMs: 10_000,
      timerSeconds: 20,
      previousStreak: 0,
    });
    expect(result.basePoints).toBe(750);
    expect(result.points).toBe(750);
  });

  it("answering past the timer clamps to 0-fraction (never negative)", () => {
    const result = computeAnswerPoints({
      isCorrect: true,
      timeToAnswerMs: 999_999,
      timerSeconds: 20,
      previousStreak: 0,
    });
    expect(result.basePoints).toBe(Math.round(BASE_POINTS * 0.5));
    expect(result.points).toBeGreaterThanOrEqual(0);
  });

  it("streak bonus adds on top of time-weighted base", () => {
    // previousStreak 2 → newStreak 3 → +100 bonus
    const result = computeAnswerPoints({
      isCorrect: true,
      timeToAnswerMs: 0,
      timerSeconds: 20,
      previousStreak: 2,
    });
    expect(result.newStreak).toBe(3);
    expect(result.streakBonus).toBe(STREAK_BONUSES[3]);
    expect(result.points).toBe(BASE_POINTS + STREAK_BONUSES[3]);
  });

  it("streak bonus at 5 is larger than at 3", () => {
    const at5 = computeAnswerPoints({
      isCorrect: true,
      timeToAnswerMs: 0,
      timerSeconds: 20,
      previousStreak: 4,
    });
    const at3 = computeAnswerPoints({
      isCorrect: true,
      timeToAnswerMs: 0,
      timerSeconds: 20,
      previousStreak: 2,
    });
    expect(at5.streakBonus).toBeGreaterThan(at3.streakBonus);
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
    expect(result.points).toBe(BASE_POINTS);
  });

  it("degenerate timer (null/0) falls back to flat 750 points", () => {
    const nullResult = computeAnswerPoints({
      isCorrect: true,
      timeToAnswerMs: 1234,
      timerSeconds: null,
      previousStreak: 0,
    });
    expect(nullResult.points).toBe(750);
    const zeroResult = computeAnswerPoints({
      isCorrect: true,
      timeToAnswerMs: 1234,
      timerSeconds: 0,
      previousStreak: 0,
    });
    expect(zeroResult.points).toBe(750);
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
});
