import { EventEmitter } from 'events';
import { prisma } from '@/lib/db/client';
import { type trivia_category } from '@prisma/client';
import { ACHIEVEMENT_DISPLAY, Achievement } from '@/types/achievements';

export interface GameStats {
  userId: number;
  sessionId: number;
  category: trivia_category;
  correctAnswers: number;
  totalQuestions: number;
  bestStreak: number;
  averageResponseTime: number;
  startTime: Date;
  endTime: Date;
  categories?: Record<string, number>;
}

export class AchievementService extends EventEmitter {
  // Increase max listeners to prevent warnings
  constructor() {
    super();
    // Set maximum number of listeners to avoid warnings
    this.setMaxListeners(20);
  }

  private static instance: AchievementService | null = null;
  
  private readonly CATEGORY_MAP: Record<string, string> = {
    'pop_culture': 'popculture',
    'general_knowledge': 'general',
    'general': 'general',
    'technology': 'technology',
    'science': 'science',
    'history': 'history',
    'geography': 'geography',
    'sports': 'sports',
    'gaming': 'gaming',
    'literature': 'literature',
    'internet': 'internet',
    'movies': 'movies',
    'music': 'music',
    'art': 'art',
    'random': 'random'
  };

  // Private constructor handled above

  public static getInstance(): AchievementService {
    if (!this.instance) this.instance = new AchievementService();
    return this.instance;
  }
  
  // Helpers
  private normalizeCategory(category: string): string {
    const normalized = category.toLowerCase().replace(/\s+/g, '_');
    return this.CATEGORY_MAP[normalized] || normalized;
  }
  
  private async findAchievementId(userId: number, type: string): Promise<number> {
    // Converting to lowercase for case-insensitive matching
    const lowercaseType = type.toLowerCase();
    
    const achievements = await prisma.trivia_achievements.findMany({
      where: {
        user_id: userId
      },
      select: { id: true, achievement_type: true }
    });
    
    // Manual filtering for case-insensitive matching
    const match = achievements.find(a => a.achievement_type.toLowerCase() === lowercaseType);
    return match?.id ?? -1;
  }

  // Achievement checks
  async checkPerfectGames(userId: number): Promise<number> {
    try {
      // First check if user has any perfect games (10/10 questions correct)
      const perfectGames = await prisma.$queryRaw<{count: bigint}[]>`
        SELECT COUNT(*) as count FROM trivia_game_sessions tgs
        WHERE tgs.id IN (
          SELECT tpr.game_session_id
          FROM trivia_player_responses tpr
          WHERE tpr.user_id = ${userId}
          GROUP BY tpr.game_session_id
          HAVING COUNT(*) = 10 AND COUNT(CASE WHEN tpr.is_correct THEN 1 END) = 10
        )
      `;
      
      const perfectGameCount = Number(perfectGames[0].count);
      
      // If no perfect games found directly, check if user has a streak of 10+
      // which would imply they've had a perfect game
      if (perfectGameCount === 0) {
        const topStreak = await prisma.trivia_streak_history.findFirst({
          where: { user_id: userId },
          orderBy: { streak_count: 'desc' }
        });
        
        if (topStreak && Number(topStreak.streak_count) >= 10) {
          return 1; // They've had at least one perfect game based on streak
        }
      }
      
      return perfectGameCount;
    } catch (error) {
      console.error('Error checking perfect games:', error);
      return 0;
    }
  }
  
  async checkDifficultyMaster(userId: number): Promise<number> {
    try {
      const difficulties = await prisma.$queryRaw<{count: bigint}[]>`
        SELECT COUNT(DISTINCT tq.difficulty) as count 
        FROM trivia_player_responses tpr
        JOIN trivia_questions tq ON tpr.question_id = tq.id
        WHERE tpr.user_id = ${userId} AND tpr.is_correct = true
      `;
      return Number(difficulties[0].count);
    } catch (error) {
      console.error('Error checking difficulty master:', error);
      return 0;
    }
  }
  
  async checkQuickThinker(userId: number): Promise<number> {
    try {
      return await prisma.trivia_player_responses.count({
        where: {
          user_id: userId,
          is_correct: true,
          response_time_ms: { lt: 5000 }
        }
      });
    } catch (error) {
      console.error('Error checking quick thinker:', error);
      return 0;
    }
  }
  
  async checkCategoryMaster(userId: number): Promise<number> {
    try {
      const result = await prisma.trivia_player_responses.count({
        where: { user_id: userId, is_correct: true }
      });
      return Number(result);
    } catch (error) {
      console.error('Error checking category master:', error);
      return 0;
    }
  }
  
  async checkCategoryAchievement(userId: number, category: string): Promise<number> {
    try {
      // Special mapping for pop culture which might be stored differently
      if (category.toLowerCase() === 'popculture' || category.toLowerCase() === 'pop_culture') {
        const result = await prisma.$queryRaw<{count: number}[]>`
          SELECT COUNT(*) as count
          FROM trivia_player_responses tpr
          JOIN trivia_questions tq ON tpr.question_id = tq.id
          WHERE tpr.user_id = ${userId} AND tpr.is_correct = true
          AND (LOWER(tq.category::text) LIKE '%pop%' OR LOWER(tq.category::text) LIKE '%culture%')
        `;
        return result[0].count;
      }
      
      if (category.toLowerCase() === 'general' || category.toLowerCase() === 'general_knowledge') {
        const result = await prisma.$queryRaw<{count: number}[]>`
          SELECT COUNT(*) as count
          FROM trivia_player_responses tpr
          JOIN trivia_questions tq ON tpr.question_id = tq.id
          WHERE tpr.user_id = ${userId} AND tpr.is_correct = true
          AND (LOWER(tq.category::text) = 'general' OR LOWER(tq.category::text) = 'general_knowledge')
        `;
        return result[0].count;
      }
      
      // Use a cast to text for case-insensitive comparison
      const result = await prisma.$queryRaw<{count: number}[]>`
        SELECT COUNT(*) as count
        FROM trivia_player_responses tpr
        JOIN trivia_questions tq ON tpr.question_id = tq.id
        WHERE tpr.user_id = ${userId} AND tpr.is_correct = true
        AND LOWER(tq.category::text) = LOWER(${category})
      `;
      return Number(result[0].count); // Convert BigInt to Number
    } catch (error) {
      console.error(`Error checking category achievement for ${category}:`, error);
      return 0;
    }
  }
  
  // Main methods
  async getUserAchievements(userId: number): Promise<Achievement[] | { error: string }> {
    try {
      // Get base achievements
      const achievements = Object.entries(ACHIEVEMENT_DISPLAY).map(([code, def]) => ({
        code,
        name: def.name,
        description: def.description,
        icon: def.icon,
        category: def.category,
        achieved: false,
        progress: 0, total: def.total,
        unlockedAt: null as Date | null
      }));
      
      // Get stored achievements and user data
      const userAchievements = await prisma.trivia_achievements.findMany({
        where: { user_id: userId }
      });
      
      const userData = await prisma.trivia_users.findUnique({
        where: { id: userId },
        select: { games_played: true }
      });
      
      if (!userData) return { error: 'User not found' };
      
      // Get metrics
      const topStreak = await prisma.trivia_streak_history.findFirst({
        where: { user_id: userId },
        orderBy: { streak_count: 'desc' }
      });
      
      const perfectGamesCount = await this.checkPerfectGames(userId);
      const perfectGames = perfectGamesCount > 0;
      const categoryMasterCount = await this.checkCategoryMaster(userId);
      const difficultyCount = await this.checkDifficultyMaster(userId);
      const quickAnswers = await this.checkQuickThinker(userId);
      const maxStreakValue = topStreak ? Number(topStreak.streak_count) || 0 : 0;
      
      // Map to store final achievements
      const processedAchievements = new Map();
      
      // Process all achievements
      for (const achievement of achievements) {
        const normalizedCode = achievement.code.toLowerCase();
        const storedAchievements = userAchievements.filter(a => 
          a.achievement_type.toLowerCase() === normalizedCode
        );
        
        // If found in database
        if (storedAchievements.length > 0) {
          const highestScore = Math.max(...storedAchievements.map(a => Number(a.score) || 0));
          achievement.progress = highestScore;
          achievement.achieved = achievement.progress >= achievement.total;
          
          const unlockDates = storedAchievements
            .map(a => a.minted_at)
            .filter(date => date !== null) as Date[];
            
          if (unlockDates.length > 0) {
            achievement.unlockedAt = new Date(Math.min(...unlockDates.map(d => d.getTime())));
          }
        } else {
          // Calculate from metrics
          switch (normalizedCode) {
            case 'streak_3':
            case 'streak_5':
            case 'streak_master':
              achievement.progress = maxStreakValue;
              break;
              
            case 'blockchain_pioneer':
              achievement.progress = 1;
              break;
              
            case 'first_win':
              achievement.progress = userData.games_played ? 1 : 0;
              break;
              
            case 'perfect_game':
              achievement.progress = await this.checkPerfectGames(userId);
              break;
              
            case 'perfect_round':
              achievement.progress = await this.checkPerfectGames(userId);
              break;
              
            case 'marathon_player':
              achievement.progress = Number(userData.games_played) || 0;
              break;
            
            case 'difficulty_master':
              achievement.progress = difficultyCount;
              break;
              
            case 'quick_thinker':
              achievement.progress = quickAnswers;
              break;
              
            default:
              if (normalizedCode.endsWith('_master')) {
                const category = normalizedCode.replace('_master', '');
                achievement.progress = await this.checkCategoryAchievement(userId, category);
              }
          }
          
          achievement.achieved = achievement.progress >= achievement.total;
        }
        
        processedAchievements.set(normalizedCode, achievement);
      }
      
      return Array.from(processedAchievements.values());
    } catch (error) {
      console.error('Error getting user achievements:', error);
      return { error: 'Failed to get achievements' };
    }
  }
  
  async verifyUserAchievements(userId: number) {
    try {
      console.log(`Verifying achievements for user ID: ${userId}`);
      
      // Get current achievements
      const achievements = await this.getUserAchievements(userId);
      if ('error' in achievements) {
        return { error: achievements.error };
      }
      
      // Simply return the verified achievements
      // We've already recalculated everything in getUserAchievements
      return { 
        verified: achievements, 
        repaired: [], 
        userId 
      };
    } catch (error) {
      console.error('Error verifying user achievements:', error);
      return { error: 'Failed to verify achievements', userId };
    }
  }
  
  async processGameEnd(stats: GameStats): Promise<Achievement[]> {
    try {
      const achievementsList: Achievement[] = [];
      const userId = stats.userId;
      
      // Update BLOCKCHAIN_PIONEER
      await prisma.trivia_achievements.upsert({
        where: { id: await this.findAchievementId(userId, 'BLOCKCHAIN_PIONEER') },
        update: { score: 1 },
        create: {
          user_id: userId,
          achievement_type: 'BLOCKCHAIN_PIONEER',
          score: 1,
          week_number: Math.ceil((new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 604800000),
          year: new Date().getFullYear(),
          streak_milestone: 0
        }
      });
      
      achievementsList.push({
        code: 'BLOCKCHAIN_PIONEER',
        ...ACHIEVEMENT_DISPLAY['BLOCKCHAIN_PIONEER'],
        achieved: true,
        progress: 1,
        total: 1,
        unlockedAt: new Date()
      });
      
      // Check for PERFECT_GAME
      if (stats.correctAnswers === stats.totalQuestions && stats.totalQuestions === 10) {
        // Count existing perfect games
        const existingPerfectGames = await this.checkPerfectGames(userId);
        
        await prisma.trivia_achievements.upsert({
          where: { id: await this.findAchievementId(userId, 'PERFECT_GAME') },
          update: { score: existingPerfectGames + 1 },
          create: {
            user_id: userId,
            achievement_type: 'PERFECT_GAME',
            score: 1,
            week_number: Math.ceil((new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 604800000),
            year: new Date().getFullYear(),
            streak_milestone: 0
          }
        });
        
        achievementsList.push({
          code: 'PERFECT_GAME',
          ...ACHIEVEMENT_DISPLAY['PERFECT_GAME'],
          achieved: true,
          progress: existingPerfectGames + 1,
          total: 1,
          unlockedAt: new Date()
        });
      }
      
      // Update game counts
      const userData = await prisma.trivia_users.findUnique({
        where: { id: userId },
        select: { games_played: true }
      });
      
      if (userData) {
        await prisma.trivia_achievements.upsert({
          where: { id: await this.findAchievementId(userId, 'MARATHON_PLAYER') },
          update: { score: Number(userData.games_played) },
          create: {
            user_id: userId,
            achievement_type: 'MARATHON_PLAYER',
            score: Number(userData.games_played),
            week_number: Math.ceil((new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 604800000),
            year: new Date().getFullYear(),
            streak_milestone: 0
          }
        });
        
        achievementsList.push({
          code: 'MARATHON_PLAYER',
          ...ACHIEVEMENT_DISPLAY['MARATHON_PLAYER'],
          achieved: userData.games_played >= 50,
          progress: userData.games_played,
          total: 50,
          unlockedAt: userData.games_played >= 50 ? new Date() : null
        });
      }
      
      // Update difficulty
      const difficultyCount = await this.checkDifficultyMaster(userId);
      
      await prisma.trivia_achievements.upsert({
        where: { id: await this.findAchievementId(userId, 'DIFFICULTY_MASTER') },
        update: { score: difficultyCount },
        create: {
          user_id: userId,
          achievement_type: 'DIFFICULTY_MASTER',
          score: difficultyCount,
          week_number: Math.ceil((new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 604800000),
          year: new Date().getFullYear(),
          streak_milestone: 0
        }
      });

      achievementsList.push({
        code: 'DIFFICULTY_MASTER',
        ...ACHIEVEMENT_DISPLAY['DIFFICULTY_MASTER'],
        achieved: difficultyCount >= 3,
        progress: difficultyCount,
        total: 3,
        unlockedAt: difficultyCount >= 3 ? new Date() : null
      });
      
      // Update category achievements based on the stats from this game
      if (stats.categories) {
        for (const [category, count] of Object.entries(stats.categories)) {
          if (count > 0) {
            const normalizedCategory = this.normalizeCategory(category);
            const achievementType = `${normalizedCategory}_master`;
            
            // Get current total for this category
            const currentCount = await this.checkCategoryAchievement(userId, normalizedCategory);
            
            // Update the achievement
            await prisma.trivia_achievements.upsert({
              where: { id: await this.findAchievementId(userId, achievementType) },
              update: { score: currentCount },
              create: {
                user_id: userId,
                achievement_type: achievementType,
                score: currentCount,
                week_number: Math.ceil((new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 604800000),
                year: new Date().getFullYear(),
                streak_milestone: 0
              }
            });
          }
        }
      }
      
      return achievementsList;
    } catch (error) {
      console.error('Error processing achievements:', error);
      return [];
    }
  }
}
