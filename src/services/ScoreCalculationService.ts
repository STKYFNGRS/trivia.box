import { RateLimitService } from './RateLimitService';
import { ActivityLogType } from '@prisma/client';

interface ScoreResult {
  points: number;
  maxPoints: number;
  streak: number;
}

interface AnswerValidation {
  isValid: boolean;
  remainingTime: number;
}

export class ScoreCalculationService {
  private static instance: ScoreCalculationService;
  private readonly DURATION = 15; // 15 seconds
  private readonly MAX_POINTS = 15; // 15 points maximum
  private readonly STREAK_BONUS_PER_LEVEL = 0.1; // 10% bonus per streak level
  private readonly MAX_STREAK_BONUS = 0.5; // Maximum 50% bonus
  private readonly TIME_TOLERANCE_MS = 500; // 500ms tolerance for network latency

  private constructor() {}

  public static getInstance(): ScoreCalculationService {
    if (!ScoreCalculationService.instance) {
      ScoreCalculationService.instance = new ScoreCalculationService();
    }
    return ScoreCalculationService.instance;
  }

  public async calculateScore({
    timeRemaining,
    isCorrect,
    streakCount
  }: {
    timeRemaining: number;
    isCorrect: boolean;
    streakCount: number;
  }): Promise<ScoreResult> {
    // Check rate limiting first
    const rateLimitService = RateLimitService.getInstance();
    const canSubmit = await rateLimitService.checkRateLimit('score-submit', ActivityLogType.ANSWER);
    
    if (!canSubmit) {
      throw new Error('Rate limit exceeded for score submissions');
    }

    // No points for incorrect answers
    if (!isCorrect) {
      return {
        points: 0,
        maxPoints: this.MAX_POINTS,
        streak: 0
      };
    }

    // Calculate base points (1 point per second remaining)
    const basePoints = Math.max(Math.min(Math.round(timeRemaining), this.MAX_POINTS), 0);
    
    // Calculate streak bonus
    const streakBonus = Math.min(streakCount * this.STREAK_BONUS_PER_LEVEL, this.MAX_STREAK_BONUS);
    
    // Apply streak bonus and round to nearest integer
    const totalPoints = Math.round(basePoints * (1 + streakBonus));

    return {
      points: totalPoints,
      maxPoints: this.MAX_POINTS,
      streak: streakCount + 1
    };
  }

  public validateTiming(startTime: string, endTime: string): AnswerValidation {
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    const elapsed = (end - start) / 1000; // Convert to seconds
    const adjustedElapsed = Math.max(0, elapsed - (this.TIME_TOLERANCE_MS / 1000));

    return {
      isValid: elapsed >= 0 && elapsed <= (this.DURATION + this.TIME_TOLERANCE_MS / 1000),
      remainingTime: Math.max(0, this.DURATION - adjustedElapsed)
    };
  }
}