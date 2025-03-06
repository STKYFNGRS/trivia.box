import { ACHIEVEMENT_DISPLAY } from '@/types/achievements';
import type { PlayerResponse } from '@/types/scoring';
import { prisma } from '@/lib/db/client';
import { EventEmitter } from 'events';

export class AchievementService extends EventEmitter {
  private static instance: AchievementService;

  private constructor() {
    super();
  }

  public static getInstance(): AchievementService {
    if (!AchievementService.instance) {
      AchievementService.instance = new AchievementService();
    }
    return AchievementService.instance;
  }

  async queueAchievementCheck(response: PlayerResponse) {
    try {
      const achievementTypes = await this.checkForAchievements(response);
      if (achievementTypes.length > 0) {
        await this.recordAchievements(achievementTypes, response);
        this.emit('achievements', achievementTypes);
      }
    } catch (error) {
      console.error('Achievement check failed:', error);
    }
  }

  private async checkForAchievements(response: PlayerResponse): Promise<string[]> {
    const achievements: string[] = [];

    // Check for streak achievements
    if (response.streak_count >= 5) {
      achievements.push('STREAK_5');
    } else if (response.streak_count >= 3) {
      achievements.push('STREAK_3');
    }

    // Check for speed achievements (under 2 seconds)
    if (response.response_time_ms < 2000 && response.is_correct) {
      achievements.push('SPEED_DEMON');
    }

    // Get the question's category first
    const questionData = await prisma.trivia_questions.findUnique({
      where: { id: response.question_id },
      select: { category: true }
    });

    // Check for category mastery using the category from the question
    if (questionData?.category) {
      const categoryResponses = await prisma.trivia_player_responses.count({
        where: {
          user_id: response.user_id,
          is_correct: true,
          trivia_questions: {
            category: questionData.category
          }
        }
      });

      if (categoryResponses >= 50) {
        achievements.push('CATEGORY_MASTER');
      }
    }

    // Check for perfect round
    const gameResponses = await prisma.trivia_player_responses.findMany({
      where: {
        game_session_id: response.game_session_id,
        user_id: response.user_id
      }
    });

    if (gameResponses.length >= 10 && gameResponses.every(r => r.is_correct)) {
      achievements.push('PERFECT_ROUND');
    }

    // Get unique categories using a raw query
    const uniqueCategoriesResult = await prisma.$queryRaw<{ category: string }[]>`
      SELECT DISTINCT q.category
      FROM trivia_player_responses r
      JOIN trivia_questions q ON r.question_id = q.id
      WHERE r.user_id = ${response.user_id}
      AND r.is_correct = true
    `;

    const uniqueCategories = new Set(
      uniqueCategoriesResult.map(r => r.category).filter(Boolean)
    );

    if (uniqueCategories.size >= 11) {
      achievements.push('CATEGORY_COLLECTOR');
    }

    // Check daily streak
    const today = new Date();
    const dailyActivity = await prisma.trivia_streak_history.findMany({
      where: {
        user_id: response.user_id,
        recorded_at: {
          gte: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
        }
      },
      orderBy: {
        recorded_at: 'desc'
      }
    });

    if (this.hasConsecutiveDays(dailyActivity, 7)) {
      achievements.push('DAILY_STREAK_7');
    }

    return achievements;
  }

  private async recordAchievements(achievementTypes: string[], response: PlayerResponse) {
    if (!achievementTypes.length) return;
    
    const { week_number, year } = this.getCurrentWeek();
    
    for (const achievementType of achievementTypes) {
      // Check if achievement already exists
      const existing = await prisma.trivia_achievements.findFirst({
        where: {
          user_id: response.user_id,
          achievement_type: achievementType
        }
      });

      if (!existing) {
        await prisma.trivia_achievements.create({
          data: {
            user_id: response.user_id,
            achievement_type: achievementType,
            week_number,
            year,
            score: response.points_earned,
            streak_milestone: response.streak_count,
            fastest_response: response.response_time_ms
          }
        });

        // Emit achievement unlocked event with display data
        this.emit('achievement_unlocked', {
          type: achievementType,
          display: ACHIEVEMENT_DISPLAY[achievementType],
          userId: response.user_id
        });
      }
    }
  }

  private getCurrentWeek(): { week_number: number; year: number } {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const week = Math.ceil((((now.getTime() - start.getTime()) / 86400000) + start.getDay() + 1) / 7);
    
    return {
      week_number: week,
      year: now.getFullYear()
    };
  }

  private hasConsecutiveDays(activities: { recorded_at: Date }[], requiredDays: number): boolean {
    if (activities.length < requiredDays) return false;

    let consecutiveDays = 1;
    let lastDate = activities[0].recorded_at;

    for (let i = 1; i < activities.length; i++) {
      const dayDifference = Math.floor((lastDate.getTime() - activities[i].recorded_at.getTime()) / (24 * 60 * 60 * 1000));
      
      if (dayDifference === 1) {
        consecutiveDays++;
        if (consecutiveDays >= requiredDays) return true;
      } else if (dayDifference > 1) {
        consecutiveDays = 1;
      }
      
      lastDate = activities[i].recorded_at;
    }

    return consecutiveDays >= requiredDays;
  }
}