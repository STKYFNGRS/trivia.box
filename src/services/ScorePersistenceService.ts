import { prisma } from '@/lib/db/client';
import type { PlayerResponse } from '@/types/game';
import type { ScoreResult } from '@/types/scoring';
import { ActivityLogType } from '@prisma/client';
import { RateLimitService } from './RateLimitService';

export class ScorePersistenceService {
  private static instance: ScorePersistenceService | null = null;

  private constructor() {}

  public static getInstance(): ScorePersistenceService {
    if (!this.instance) {
      this.instance = new ScorePersistenceService();
    }
    return this.instance;
  }

  public async saveScore(score: ScoreResult, response: PlayerResponse): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // Update player response
      await tx.trivia_player_responses.update({
        where: { id: response.id },
        data: {
          points_earned: score.points,
          potential_points: score.maxPoints,
          streak_count: score.streak
        }
      });

      // Update user total score and stats
      await tx.trivia_users.update({
        where: { id: response.user_id },
        data: {
          total_points: {
            increment: score.points
          },
          last_played_at: new Date()
        }
      });

      // Track streak history if there's an active streak
      if (score.streak > 0) {
        await tx.trivia_streak_history.create({
          data: {
            user_id: response.user_id,
            game_session_id: response.game_session_id,
            streak_count: score.streak,
            points_earned: score.points,
            recorded_at: new Date()
          }
        });
      }

      // Update weekly leaderboard
      const currentWeek = this.getCurrentWeek();
      await tx.trivia_weekly_scores.upsert({
        where: {
          user_id_week_year: {
            user_id: response.user_id,
            week: currentWeek.week,
            year: currentWeek.year
          }
        },
        update: {
          score: {
            increment: score.points
          }
        },
        create: {
          user_id: response.user_id,
          week: currentWeek.week,
          year: currentWeek.year,
          score: score.points
        }
      });
    });

    // Log the score persistence for monitoring
    const rateLimitService = RateLimitService.getInstance();
    await rateLimitService.logAttempt(ActivityLogType.SCORE_PERSISTENCE, response.game_session_id, {
      type: 'score_persistence',
      timestamp: new Date().toISOString(),
      response_id: response.id,
      points: score.points,
      streak: score.streak
    });
  }

  private getCurrentWeek(): { week: number; year: number } {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const week = Math.ceil(((now.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
    
    return {
      week,
      year: now.getFullYear()
    };
  }

  public async getPlayerStats(userId: number): Promise<{
    totalPoints: number;
    highestStreak: number;
    gamesPlayed: number;
    weeklyScore: number;
  }> {
    const [userData, streakData, weeklyScore] = await Promise.all([
      prisma.trivia_users.findUnique({
        where: { id: userId },
        select: {
          total_points: true,
          games_played: true
        }
      }),
      prisma.trivia_streak_history.findFirst({
        where: { user_id: userId },
        orderBy: { streak_count: 'desc' },
        select: { streak_count: true }
      }),
      this.getCurrentWeekScore(userId)
    ]);

    return {
      totalPoints: Number(userData?.total_points || 0),
      highestStreak: streakData?.streak_count || 0,
      gamesPlayed: userData?.games_played || 0,
      weeklyScore: weeklyScore
    };
  }

  private async getCurrentWeekScore(userId: number): Promise<number> {
    const currentWeek = this.getCurrentWeek();
    
    const weeklyScore = await prisma.trivia_weekly_scores.findUnique({
      where: {
        user_id_week_year: {
          user_id: userId,
          week: currentWeek.week,
          year: currentWeek.year
        }
      }
    });

    return weeklyScore?.score || 0;
  }
}