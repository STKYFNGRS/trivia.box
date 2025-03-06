import { EventEmitter } from 'events';
import { prisma } from '@/lib/db/client';
import { type trivia_category } from '@prisma/client';
import { ACHIEVEMENT_DISPLAY } from '@/types/achievements';

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
  categories?: Record<string, number>; // Optional category-specific correct counts
}

export class AchievementService extends EventEmitter {
  private static instance: AchievementService | null = null;

  private constructor() {
    super();
  }

  public static getInstance(): AchievementService {
    if (!this.instance) {
      this.instance = new AchievementService();
    }
    return this.instance;
  }
  
  /**
   * Process all achievements for a game
   */
  async processGameEnd(stats: GameStats) {
    try {
      console.log(`Processing achievements for user ${stats.userId}, session ${stats.sessionId}`);
      
      // Run all achievement checks within a transaction for consistency
      const achievedAchievements: Array<{
        type: string;
        display: typeof ACHIEVEMENT_DISPLAY[keyof typeof ACHIEVEMENT_DISPLAY];
        userId: number;
        isNewAchievement?: boolean;
        progress?: number;
      } | null> = await prisma.$transaction(async (tx) => {
        // Always grant BLOCKCHAIN_PIONEER on first game completion
        const blockchainPioneerAchievement = await this.grantAchievement(
          stats.userId, 
          'BLOCKCHAIN_PIONEER', 
          { score: 1 },
          tx
        );
        
        // Run all achievement checks in parallel
        const results = await Promise.all([
          this.updateCategoryProgress(stats, tx),
          this.checkStreakAchievements(stats, tx),
          this.checkSpeedAchievements(stats, tx),
          this.checkTimeBasedAchievements(stats, tx),
          this.checkCompletionAchievements(stats, tx),
          this.checkPerfectGameAchievement(stats, tx),
          this.checkFirstWinAchievement(stats, tx)
        ]);
        
        // Combine and return all achievements that were granted
        const allAchievements = results.flat().filter(Boolean);
        if (blockchainPioneerAchievement) {
          allAchievements.push(blockchainPioneerAchievement);
        }
        
        return allAchievements;
      });
      
      // Emit events for any achievements that were earned
      for (const achievement of achievedAchievements) {
        // Skip null achievements
        if (!achievement) continue;
        
        // Emit event for server-side listeners
        this.emit('achievement_unlocked', {
          userId: achievement.userId,
          type: achievement.type,
          display: achievement.display
        });
        
        // Dispatch browser event for client-side notification
        if (typeof window !== 'undefined') {
          const achievementEvent = new CustomEvent('achievementUnlocked', {
            detail: {
              type: achievement.type,
              display: achievement.display,
              userId: achievement.userId
            }
          });
          window.dispatchEvent(achievementEvent);
        }
      }
      
      return achievedAchievements;
    } catch (error) {
      console.error('Error in processGameEnd:', error);
      return [];
    }
  }
  
  /**
   * Find an achievement ID by user and type
   */
  private async findAchievementId(userId: number, achievementType: string, tx: any): Promise<number> {
    // Find existing achievement by user_id and achievement_type
    const existingAchievement = await tx.trivia_achievements.findFirst({
      where: {
        user_id: userId,
        achievement_type: achievementType
      },
      select: { id: true }
    });
    
    // Return the ID if found, or a placeholder ID that won't match any record
    return existingAchievement?.id ?? -1;
  }
  
  /**
   * Update progress for category-based achievements
   */
  private async updateCategoryProgress(stats: GameStats, tx: any) {
    try {
      // If categories data is provided, use that instead of single category
      if (stats.categories) {
        const results: Array<{
          type: string;
          display: typeof ACHIEVEMENT_DISPLAY[keyof typeof ACHIEVEMENT_DISPLAY];
          userId: number;
          progress: number;
        } | null> = [];
        
        // Process each category
        for (const [category, correctCount] of Object.entries(stats.categories)) {
          if (correctCount <= 0) continue;
          
          const result = await this.updateSingleCategoryProgress(
            stats.userId,
            category as trivia_category,
            correctCount,
            tx
          );
          
          if (result) results.push(result);
        }
        
        return results;
      } else {
        // Fall back to single category if categories map not provided
        return await this.updateSingleCategoryProgress(
          stats.userId,
          stats.category,
          stats.correctAnswers,
          tx
        );
      }
    } catch (error) {
      console.error('Error updating category progress:', error);
      return null;
    }
  }
  
  /**
   * Update progress for a single category
   * @returns Achievement data or null if not earned
   */
  private async updateSingleCategoryProgress(
    userId: number, 
    category: trivia_category, 
    correctCount: number,
    tx: any
  ): Promise<{
    type: string;
    display: typeof ACHIEVEMENT_DISPLAY[keyof typeof ACHIEVEMENT_DISPLAY];
    userId: number;
    progress: number;
  } | null> {
    try {
      const achievementType = `${category.toLowerCase()}_master`;
      
      const result = await tx.trivia_achievements.upsert({
        where: {
          id: await this.findAchievementId(userId, achievementType, tx)
        },
        update: {
          score: { increment: correctCount },
          week_number: Math.ceil((new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 604800000),
          year: new Date().getFullYear()
        },
        create: {
          user_id: userId,
          achievement_type: achievementType,
          week_number: Math.ceil((new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 604800000),
          year: new Date().getFullYear(),
          score: correctCount,
          streak_milestone: 0
        }
      });
      
      // Return achievement data if applicable
      if (ACHIEVEMENT_DISPLAY[achievementType]) {
        const existingScore = result.score - correctCount;
        const newScore = result.score;
        const threshold = ACHIEVEMENT_DISPLAY[achievementType].total;
        
        // Only return the achievement if we've just crossed the threshold
        if (existingScore < threshold && newScore >= threshold) {
          return {
            type: achievementType,
            display: ACHIEVEMENT_DISPLAY[achievementType],
            userId,
            progress: newScore
          };
        }
      }
      return null;
    } catch (error) {
      console.error(`Error updating category progress for ${category}:`, error);
      return null;
    }
  }
  
  /**
   * Check and grant streak-based achievements
   * @returns Array of achievement data objects or empty array
   */
  private async checkStreakAchievements(stats: GameStats, tx: any): Promise<Array<{
    type: string;
    display: typeof ACHIEVEMENT_DISPLAY[keyof typeof ACHIEVEMENT_DISPLAY];
    userId: number;
    isNewAchievement?: boolean;
  } | null>> {
    const streakTiers = [
      ['STREAK_3', 3],
      ['STREAK_5', 5],
      ['STREAK_MASTER', 10]
    ] as const;

    const achievements: Array<{
      type: string;
      display: typeof ACHIEVEMENT_DISPLAY[keyof typeof ACHIEVEMENT_DISPLAY];
      userId: number;
      isNewAchievement?: boolean;
    } | null> = [];
    
    for (const [code, required] of streakTiers) {
      if (stats.bestStreak >= required) {
        const result = await this.grantAchievement(
          stats.userId, 
          code as keyof typeof ACHIEVEMENT_DISPLAY, 
          { streak: stats.bestStreak },
          tx
        );
        if (result) achievements.push(result);
      }
    }
    
    return achievements;
  }
  
  /**
   * Check and grant speed-based achievements
   * @returns Array of achievement data objects or empty array
   */
  private async checkSpeedAchievements(stats: GameStats, tx: any): Promise<Array<{
    type: string;
    display: typeof ACHIEVEMENT_DISPLAY[keyof typeof ACHIEVEMENT_DISPLAY];
    userId: number;
    isNewAchievement?: boolean;
  } | null>> {
    if (stats.averageResponseTime <= 3000 && stats.correctAnswers >= 5) {
      const result = await this.grantAchievement(
        stats.userId, 
        'SPEED_DEMON', 
        { time: stats.averageResponseTime },
        tx
      );
      return result ? [result] : [];
    }
    return [];
  }
  
  /**
   * Check and grant time-of-day based achievements
   * @returns Array of achievement data objects or empty array
   */
  private async checkTimeBasedAchievements(stats: GameStats, tx: any): Promise<Array<{
    type: string;
    display: typeof ACHIEVEMENT_DISPLAY[keyof typeof ACHIEVEMENT_DISPLAY];
    userId: number;
    isNewAchievement?: boolean;
  } | null>> {
    const hour = stats.startTime.getHours();
    const achievements: Array<{
      type: string;
      display: typeof ACHIEVEMENT_DISPLAY[keyof typeof ACHIEVEMENT_DISPLAY];
      userId: number;
      isNewAchievement?: boolean;
    } | null> = [];
    
    if (hour < 9) {
      const result = await this.grantAchievement(
        stats.userId, 
        'EARLY_BIRD', 
        { hour },
        tx
      );
      if (result) achievements.push(result);
    }
    
    if (hour >= 0 && hour < 4) {
      const result = await this.grantAchievement(
        stats.userId, 
        'NIGHT_OWL', 
        { hour },
        tx
      );
      if (result) achievements.push(result);
    }
    
    return achievements;
  }
  
  /**
   * Check and grant game completion count achievements
   * @returns Array of achievement data objects or empty array
   */
  private async checkCompletionAchievements(stats: GameStats, tx: any): Promise<Array<{
    type: string;
    display: typeof ACHIEVEMENT_DISPLAY[keyof typeof ACHIEVEMENT_DISPLAY];
    userId: number;
    isNewAchievement?: boolean;
  } | null>> {
    const user = await tx.trivia_users.findUnique({
      where: { id: stats.userId },
      select: { games_played: true }
    });

    if (!user) return [];

    const completionTiers = [
      ['GAME_STARTER', 1],
      ['GAME_ENTHUSIAST', 10],
      ['GAME_EXPERT', 50],
      ['GAME_MASTER', 100]
    ] as const;

    const achievements: Array<{
      type: string;
      display: typeof ACHIEVEMENT_DISPLAY[keyof typeof ACHIEVEMENT_DISPLAY];
      userId: number;
      isNewAchievement?: boolean;
    } | null> = [];
    
    for (const [code, required] of completionTiers) {
      if (user.games_played >= required) {
        const result = await this.grantAchievement(
          stats.userId, 
          code as keyof typeof ACHIEVEMENT_DISPLAY, 
          { games_played: user.games_played },
          tx
        );
        if (result) achievements.push(result);
      }
    }
    
    return achievements;
  }
  
  /**
   * Check and grant perfect game achievements
   * @returns Array of achievement data objects or empty array
   */
  private async checkPerfectGameAchievement(stats: GameStats, tx: any): Promise<Array<{
    type: string;
    display: typeof ACHIEVEMENT_DISPLAY[keyof typeof ACHIEVEMENT_DISPLAY];
    userId: number;
    isNewAchievement?: boolean;
  } | null>> {
    // Give both PERFECT_ROUND and PERFECT_GAME achievements if all questions are correct
    if (stats.correctAnswers === stats.totalQuestions && stats.totalQuestions >= 10) {
      console.log(`User ${stats.userId} got a perfect game! ${stats.correctAnswers}/${stats.totalQuestions} correct answers`);
      
      const achievements: Array<{
        type: string;
        display: typeof ACHIEVEMENT_DISPLAY[keyof typeof ACHIEVEMENT_DISPLAY];
        userId: number;
        isNewAchievement?: boolean;
      } | null> = [];

      // Grant the PERFECT_ROUND achievement
      const perfectRound = await this.grantAchievement(
        stats.userId, 
        'PERFECT_ROUND', 
        { questions: stats.totalQuestions },
        tx
      );
      
      if (perfectRound) achievements.push(perfectRound);
      
      // Also grant the PERFECT_GAME achievement 
      const perfectGame = await this.grantAchievement(
        stats.userId, 
        'PERFECT_GAME', 
        { questions: stats.totalQuestions },
        tx
      );
      
      if (perfectGame) achievements.push(perfectGame);
      
      return achievements;
    }
    return [];
  }
  
  /**
   * Check and grant first win achievement
   * @returns Array of achievement data objects or empty array
   */
  private async checkFirstWinAchievement(stats: GameStats, tx: any): Promise<Array<{
    type: string;
    display: typeof ACHIEVEMENT_DISPLAY[keyof typeof ACHIEVEMENT_DISPLAY];
    userId: number;
    isNewAchievement?: boolean;
  } | null>> {
    // If they answered any questions correctly, consider it a win
    if (stats.correctAnswers > 0) {
      const result = await this.grantAchievement(
        stats.userId, 
        'FIRST_WIN', 
        { score: 1 },
        tx
      );
      return result ? [result] : [];
    }
    return [];
  }
  
  /**
   * Grant an achievement and return its data
   * @returns Achievement data object or null if not granted
   */
  private async grantAchievement(
    userId: number, 
    type: keyof typeof ACHIEVEMENT_DISPLAY, 
    progress: Record<string, number>,
    tx: any
  ): Promise<{
    type: string;
    display: typeof ACHIEVEMENT_DISPLAY[keyof typeof ACHIEVEMENT_DISPLAY];
    userId: number;
    isNewAchievement?: boolean;
  } | null> {
    try {
      if (!ACHIEVEMENT_DISPLAY[type]) {
        console.warn(`Achievement type "${type}" not found in ACHIEVEMENT_DISPLAY`);
        return null;
      }
      
      const display = ACHIEVEMENT_DISPLAY[type];
      
      // Check if achievement already exists
      const existingId = await this.findAchievementId(userId, type, tx);
      const isNewAchievement = existingId === -1;
      const progressValue = progress.score || progress.streak || 0;
      const achievementThreshold = display.total;
      
      // Only update if this is a new achievement or we've made progress
      await tx.trivia_achievements.upsert({
        where: {
          id: existingId
        },
        update: {
          score: progress.score || { increment: 0 },
          streak_milestone: progress.streak || 0,
          fastest_response: progress.time || undefined,
          week_number: Math.ceil((new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 604800000),
          year: new Date().getFullYear()
        },
        create: {
          user_id: userId,
          achievement_type: type,
          score: progress.score || 0,
          streak_milestone: progress.streak || 0,
          fastest_response: progress.time,
          week_number: Math.ceil((new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 604800000),
          year: new Date().getFullYear(),
          minted_at: new Date()
        }
      });

      // Return achievement data if it's new or meets criteria
      if (isNewAchievement || progressValue >= achievementThreshold) {
        return {
          type,
          display,
          userId,
          isNewAchievement
        };
      }
      
      return null;
    } catch (error) {
      console.error(`Error granting achievement (${type}):`, error);
      return null;
    }
  }
  
  /**
   * Verify all achievements for a user
   */
  async verifyUserAchievements(userId: number) {
    try {
      console.log(`Verifying achievements for user ${userId}`);
      
      // Get user data with responses
      const user = await prisma.trivia_users.findUnique({
        where: { id: userId },
        include: {
          trivia_achievements: true,
          trivia_player_responses: {
            include: {
              trivia_questions: true
            },
            take: 100,
            orderBy: {
              answered_at: 'desc'
            }
          }
        }
      });
      
      if (!user) {
        console.error(`User ${userId} not found`);
        return { error: 'User not found' };
      }
      
      const results = {
        verified: [],
        repaired: [],
        userId
      };
      
      // Run verification checks
      await prisma.$transaction(async (tx) => {
        // Verify streak achievements
        await this.verifyStreakAchievements(userId, user.best_streak || 0, tx, results);
        
        // Verify category achievements
        await this.verifyCategoryAchievements(userId, user.trivia_player_responses, tx, results);
        
        // Verify special achievements
        await this.verifySpecialAchievements(userId, user, tx, results);
      });
      
      return results;
    } catch (error) {
      console.error('Error verifying user achievements:', error);
      return { error: 'Failed to verify achievements' };
    }
  }
  
  /**
   * Verify streak achievements
   */
  private async verifyStreakAchievements(
    userId: number,
    bestStreak: number,
    tx: any,
    results: any
  ) {
    const streakTiers = [
      { code: 'STREAK_3', threshold: 3 },
      { code: 'STREAK_5', threshold: 5 },
      { code: 'STREAK_MASTER', threshold: 10 }
    ];
    
    for (const { code, threshold } of streakTiers) {
      if (bestStreak >= threshold) {
        const hasAchievement = await tx.trivia_achievements.findFirst({
          where: {
            user_id: userId,
            achievement_type: code
          }
        });
        
        if (!hasAchievement) {
          // Create the missing achievement
          const now = new Date();
          const weekNumber = Math.ceil((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 604800000);
          
          await tx.trivia_achievements.create({
            data: {
              user_id: userId,
              achievement_type: code,
              score: bestStreak,
              streak_milestone: bestStreak,
              week_number: weekNumber,
              year: now.getFullYear(),
              minted_at: now
            }
          });
          
          results.repaired.push({
            code,
            status: 'created',
            threshold,
            bestStreak
          });
        } else {
          results.verified.push({
            code,
            status: 'verified',
            threshold,
            bestStreak
          });
        }
      }
    }
  }
  
  /**
   * Verify category achievements
   */
  private async verifyCategoryAchievements(
    userId: number,
    responses: any[],
    tx: any,
    results: any
  ) {
    // Count correct answers by category
    const categoryCounts: Record<string, number> = {};
    
    for (const response of responses) {
      if (response.is_correct) {
        const category = response.trivia_questions.category;
        categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      }
    }
    
    // Check each category against its achievement
    for (const [category, count] of Object.entries(categoryCounts)) {
      const achievementType = `${category.toLowerCase()}_master`;
      const display = ACHIEVEMENT_DISPLAY[achievementType];
      
      if (!display) continue;
      
      const hasAchievement = await tx.trivia_achievements.findFirst({
        where: {
          user_id: userId,
          achievement_type: achievementType
        }
      });
      
      if (!hasAchievement && count > 0) {
        // Create the missing achievement
        const now = new Date();
        const weekNumber = Math.ceil((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 604800000);
        
        await tx.trivia_achievements.create({
          data: {
            user_id: userId,
            achievement_type: achievementType,
            score: count,
            week_number: weekNumber,
            year: now.getFullYear(),
            minted_at: now
          }
        });
        
        results.repaired.push({
          code: achievementType,
          status: 'created',
          category,
          count
        });
      } else if (hasAchievement && hasAchievement.score !== count) {
        // Update incorrect count
        await tx.trivia_achievements.update({
          where: { id: hasAchievement.id },
          data: { score: count }
        });
        
        results.repaired.push({
          code: achievementType,
          status: 'updated',
          category,
          oldCount: hasAchievement.score,
          newCount: count
        });
      } else {
        results.verified.push({
          code: achievementType,
          status: 'verified',
          category,
          count
        });
      }
    }
  }
  
  /**
   * Verify special achievements like FIRST_WIN and BLOCKCHAIN_PIONEER
   */
  private async verifySpecialAchievements(
    userId: number,
    user: any,
    tx: any,
    results: any
  ) {
    // BLOCKCHAIN_PIONEER - Always granted for connected users
    const hasPioneerAchievement = user.trivia_achievements.some(
      (a:any) => a.achievement_type === 'BLOCKCHAIN_PIONEER'
    );
    
    if (!hasPioneerAchievement) {
      // Create the achievement
      const now = new Date();
      const weekNumber = Math.ceil((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 604800000);
      
      await tx.trivia_achievements.create({
        data: {
          user_id: userId,
          achievement_type: 'BLOCKCHAIN_PIONEER',
          score: 1,
          week_number: weekNumber,
          year: now.getFullYear(),
          minted_at: now
        }
      });
      
      results.repaired.push({
        code: 'BLOCKCHAIN_PIONEER',
        status: 'created'
      });
    } else {
      results.verified.push({
        code: 'BLOCKCHAIN_PIONEER',
        status: 'verified'
      });
    }
    
    // FIRST_WIN - Granted if they've played any games
    const hasFirstWinAchievement = user.trivia_achievements.some(
      (a:any) => a.achievement_type === 'FIRST_WIN'
    );
    
    if (!hasFirstWinAchievement && user.games_played > 0) {
      // Create the achievement
      const now = new Date();
      const weekNumber = Math.ceil((now.getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 604800000);
      
      await tx.trivia_achievements.create({
        data: {
          user_id: userId,
          achievement_type: 'FIRST_WIN',
          score: 1,
          week_number: weekNumber,
          year: now.getFullYear(),
          minted_at: now
        }
      });
      
      results.repaired.push({
        code: 'FIRST_WIN',
        status: 'created'
      });
    } else if (hasFirstWinAchievement) {
      results.verified.push({
        code: 'FIRST_WIN',
        status: 'verified'
      });
    }
  }
  
  /**
   * Get achievements for a specific user
   */
  async getUserAchievements(userId: number) {
    try {
      // Get all default achievements as a base
      const achievements = Object.entries(ACHIEVEMENT_DISPLAY).map(([code, definition]) => {
        return {
          code,
          name: definition.name,
          description: definition.description,
          icon: definition.icon,
          category: definition.category,
          achieved: false,
          progress: 0,
          total: definition.total,
          unlockedAt: null as Date | null
        };
      });
      
      // Get user's achievements from the database
      const userAchievements = await prisma.trivia_achievements.findMany({
        where: {
          user_id: userId
        }
      });
      
      // Get user data for any missing achievements
      const userData = await prisma.trivia_users.findUnique({
        where: { id: userId },
        include: {
          trivia_player_responses: {
            include: {
              trivia_questions: true
            },
            take: 100,
            orderBy: {
              answered_at: 'desc'
            }
          }
        }
      });
      
      if (!userData) {
        return { error: 'User not found' };
      }
      
      // Update achievement progress information
      achievements.forEach(achievement => {
        // Find matching user achievement if exists
        const userAchievement = userAchievements.find(
          a => a.achievement_type === achievement.code
        );
        
        if (userAchievement) {
          achievement.progress = userAchievement.score || 0;
          achievement.achieved = achievement.progress >= achievement.total;
          // Handle the Date assignment with proper type checking
          achievement.unlockedAt = userAchievement.minted_at || null;
        } else {
          // Calculate progress based on user data
          switch (achievement.code) {
            case 'STREAK_3':
            case 'STREAK_5':
            case 'STREAK_MASTER':
              achievement.progress = userData.best_streak || 0;
              achievement.achieved = achievement.progress >= achievement.total;
              break;
              
            case 'BLOCKCHAIN_PIONEER':
              achievement.progress = 1;  // Connected wallet = completed
              achievement.achieved = true;
              break;
              
            case 'FIRST_WIN':
              achievement.progress = userData.games_played ? 1 : 0;
              achievement.achieved = achievement.progress >= 1;
              break;
              
            // Check for category achievements
            default:
              if (achievement.code.endsWith('_master')) {
                const category = achievement.code.replace('_master', '');
                const correctCount = userData.trivia_player_responses.filter(r => 
                  r.is_correct && 
                  r.trivia_questions.category.toLowerCase() === category
                ).length;
                
                achievement.progress = correctCount;
                achievement.achieved = correctCount >= achievement.total;
              }
          }
        }
      });
      
      return achievements;
    } catch (error) {
      console.error('Error getting user achievements:', error);
      return { error: 'Failed to get achievements' };
    }
  }
}

export default AchievementService;