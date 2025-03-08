/**
 * Quick script to repair any corrupted content in AchievementService.ts
 */
const fs = require('fs');
const path = require('path');

// Path to the achievements service
const SERVICE_PATH = path.join(__dirname, 'AchievementService.ts');

// Read the current file
const content = fs.readFileSync(SERVICE_PATH, 'utf8');

// Create a clean version of the file with proper closing
const fixedContent = `import { EventEmitter } from 'events';
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
  categories?: Record<string, number>; // Optional category-specific correct counts
}

export class AchievementService extends EventEmitter {
  private static instance: AchievementService | null = null;

  // Category name mapping table to standardize categories
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
  
  // Add the current values for Category to Achievement mapping
  private readonly CATEGORY_TO_ACHIEVEMENT: Record<string, string> = {
    'pop_culture': 'popculture_master',
    'general_knowledge': 'general_master',
    'general': 'general_master',
    'technology': 'technology_master',
    'science': 'science_master',
    'history': 'history_master',
    'geography': 'geography_master',
    'sports': 'sports_master',
    'gaming': 'gaming_master',
    'literature': 'literature_master',
    'internet': 'internet_master',
    'movies': 'movies_master',
    'music': 'music_master',
    'art': 'art_master',
    'random': 'random_master'
  };

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
   * Check if the user has completed any perfect games
   * (all questions answered correctly in a game with 10 questions)
   */
  async checkPerfectGames(userId: number): Promise<boolean> {
    try {
      // Get user's game sessions
      const gameSessions = await prisma.trivia_game_sessions.findMany({
        where: {
          trivia_player_responses: {
            some: {
              user_id: userId
            }
          },
          status: 'completed'
        },
        select: {
          id: true
        }
      });
      
      // For each session, check if all responses were correct
      for (const session of gameSessions) {
        const responses = await prisma.trivia_player_responses.findMany({
          where: {
            user_id: userId,
            game_session_id: session.id
          }
        });
        
        // Check for perfect game (10/10 correct answers)
        if (responses.length === 10 && responses.every(r => r.is_correct)) {
          console.log(\`Found perfect game (10/10) for user \${userId} in session \${session.id}\`);
          return true;
        }
        
        // We specifically need a perfect 10/10 game for the achievement
        // Other games are not counted for this specific achievement
      }
      
      return false;
    } catch (error) {
      console.error('Error checking perfect games:', error);
      return false;
    }
  }
  
  /**
   * Check for perfect streak achievement 
   * (maintaining a streak for an entire game of 10 questions)
   */
  async checkPerfectStreak(userId: number): Promise<boolean> {
    try {
      // Get user's game sessions
      const gameSessions = await prisma.trivia_game_sessions.findMany({
        where: {
          trivia_player_responses: {
            some: {
              user_id: userId
            }
          },
          status: 'completed'
        },
        select: {
          id: true,
          question_count: true
        },
        orderBy: {
          created_at: 'desc'
        },
        take: 50 // Check the most recent 50 games
      });
      
      for (const session of gameSessions) {
        // Check if this game has a perfect streak (all answers correct in sequence)
        const responses = await prisma.trivia_player_responses.findMany({
          where: {
            user_id: userId,
            game_session_id: session.id
          },
          orderBy: {
            answered_at: 'asc'
          }
        });
        
        // Game must have exactly 10 questions for Perfect Streak achievement
        if (responses.length !== 10) continue;
        
        // Check if all responses in sequence are correct
        let allCorrect = true;
        
        for (const response of responses) {
          if (!response.is_correct) {
            allCorrect = false;
            break;
          }
        }
        
        if (allCorrect) {
          console.log(\`Found perfect streak in session \${session.id} with \${responses.length} correct answers in sequence\`);
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.error('Error checking perfect streak:', error);
      return false;
    }
  }
  
  /**
   * Check how many difficulty levels the user has won on
   */
  async checkDifficultyMaster(userId: number): Promise<number> {
    try {
      // Find all distinct difficulty levels that the user has answered correctly
      const correctAnswersByDifficulty = await prisma.$queryRaw<{difficulty: string}[]>\`
        SELECT DISTINCT tq.difficulty 
        FROM trivia_player_responses tpr
        JOIN trivia_questions tq ON tpr.question_id = tq.id
        WHERE tpr.user_id = \${userId}
        AND tpr.is_correct = true
      \`;
      
      const completedDifficulties = correctAnswersByDifficulty;
      
      console.log(\`Found \${completedDifficulties.length} completed difficulty levels for user \${userId}:\`, completedDifficulties);
      
      return completedDifficulties.length;
    } catch (error) {
      console.error('Error checking difficulty master:', error);
      return 0;
    }
  }
  
  /**
   * Check how many quick answers (under 5 seconds) the user has
   */
  async checkQuickThinker(userId: number): Promise<number> {
    try {
      const quickAnswers = await prisma.trivia_player_responses.count({
        where: {
          user_id: userId,
          is_correct: true,
          response_time_ms: {
            lt: 5000 // less than 5 seconds
          }
        }
      });
      
      return quickAnswers;
    } catch (error) {
      console.error('Error checking quick thinker:', error);
      return 0;
    }
  }
  
  /**
   * Get total number of correct answers across all categories
   * This is used for the Category Master achievement
   */
  async checkCategoryMaster(userId: number): Promise<number> {
    try {
      // Count total correct answers across all categories
      const totalCorrect = await prisma.trivia_player_responses.count({
        where: {
          user_id: userId,
          is_correct: true
        }
      });
      
      console.log(\`Total correct answers for user \${userId}: \${totalCorrect}\`);
      
      return totalCorrect;
    } catch (error) {
      console.error('Error checking category master:', error);
      return 0;
    }
  }
  
  /**
   * Check specific category achievement progress
   * Works for both exact categories and normalized categories
   */
  async checkCategoryAchievement(userId: number, categoryName: string): Promise<number> {
    try {
      // Handle special cases for 'general' and 'random' categories
      if (categoryName.toLowerCase() === 'general' || categoryName.toLowerCase() === 'general_knowledge') {
        // For general knowledge, look for both 'general' and 'general_knowledge'
        const correctCount = await prisma.$queryRaw<{count: number}[]>\`
          SELECT COUNT(*) as count
          FROM trivia_player_responses tpr
          JOIN trivia_questions tq ON tpr.question_id = tq.id
          WHERE tpr.user_id = \${userId}
          AND tpr.is_correct = true
          AND (LOWER(tq.category) = 'general' OR LOWER(tq.category) = 'general_knowledge')
        \`;
        
        return correctCount.length > 0 ? Number(correctCount[0].count) : 0;
      }
      
      // For other categories, do a direct match
      const correctCount = await prisma.trivia_player_responses.count({
        where: {
          user_id: userId,
          is_correct: true,
          trivia_questions: {
            category: {
              equals: categoryName as trivia_category,
              mode: 'insensitive'
            }
          }
        }
      });
      
      console.log(\`Found \${correctCount} correct answers for category '\${categoryName}' for user \${userId}\`);
      
      return correctCount;
    } catch (error) {
      console.error(\`Error checking category achievement for \${categoryName}:\`, error);
      return 0;
    }
  }
  
  /**
   * Find an achievement ID by user and type
   */
  private async findAchievementId(userId: number, achievementType: string): Promise<number> {
    // Find existing achievement by user_id and achievement_type (case insensitive)
    const existingAchievement = await prisma.trivia_achievements.findFirst({
      where: {
        user_id: userId,
        achievement_type: {
          equals: achievementType,
          mode: 'insensitive'
        }
      },
      select: { id: true }
    });
    
    // Return the ID if found, or a placeholder ID that won't match any record
    return existingAchievement?.id ?? -1;
  }

  /**
   * Normalize category name to match achievement types
   * This handles the mismatch between category names in responses and achievement types
   */
  private normalizeCategory(category: string): string {
    const normalized = category.toLowerCase().replace(/\\s+/g, '_');
    return this.CATEGORY_MAP[normalized] || normalized;
  }
  
  /**
   * Get achievements for a specific user
   */
  async getUserAchievements(userId: number): Promise<Achievement[] | { error: string }> {
    try {
      console.log(\`Getting achievements for user ID: \${userId}\`);
      
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
      
      console.log(\`Found \${userAchievements.length} achievements for user \${userId}:\`, 
        userAchievements.map(a => ({ type: a.achievement_type, score: a.score })));
      
      // Get user data for any missing achievements
      const userData = await prisma.trivia_users.findUnique({
        where: { id: userId },
        include: {
          trivia_player_responses: {
            include: {
              trivia_questions: true
            },
            where: {
              is_correct: true
            },
            take: 1000,
            orderBy: {
              answered_at: 'desc'
            }
          }
        }
      });
      
      if (!userData) {
        return { error: 'User not found' };
      }
      
      // Count correct answers by category
      const categoryCounts: Record<string, number> = {};
      
      userData.trivia_player_responses.forEach(response => {
        if (response.is_correct && response.trivia_questions?.category) {
          const category = response.trivia_questions.category.toLowerCase();
          
          // Create a normalized version for achievement lookups
          const normalizedCategory = this.normalizeCategory(category);
          
          // Store both original and normalized for debugging
          categoryCounts[category] = (categoryCounts[category] || 0) + 1;
          
          // Also store a normalized version for achievement lookups
          if (category !== normalizedCategory) {
            categoryCounts[normalizedCategory] = (categoryCounts[normalizedCategory] || 0) + 1;
          }
        }
      });
      
      console.log('Category counts from user responses:', categoryCounts);
      
      // Get top streak from streak history
      const topStreak = await prisma.trivia_streak_history.findFirst({
        where: { user_id: userId },
        orderBy: { streak_count: 'desc' }
      });
      
      const maxStreakValue = topStreak ? topStreak.streak_count : 0;
      
      // Get various achievement metrics
      const perfectGames = await this.checkPerfectGames(userId);
      const perfectStreak = await this.checkPerfectStreak(userId);
      const categoryMasterCount = await this.checkCategoryMaster(userId);
      const difficultyCount = await this.checkDifficultyMaster(userId);
      const quickAnswers = await this.checkQuickThinker(userId);
      
      // Create a map to track processed achievement codes (normalized to lowercase)
      const processedAchievements = new Map();
      
      // Process all achievements
      for (const achievement of achievements) {
        const normalizedCode = achievement.code.toLowerCase();
        
        // Find matching achievements in the database (case-insensitive)
        const matchingAchievements = userAchievements.filter(a => 
          a.achievement_type.toLowerCase() === normalizedCode
        );
        
        // If we found matching achievements, use the highest score
        if (matchingAchievements.length > 0) {
          // Use the highest score from any matching achievement
          const highestScore = Math.max(...matchingAchievements.map(a => a.score || 0));
          achievement.progress = highestScore;
          achievement.achieved = achievement.progress >= achievement.total;
          
          // Use the earliest unlock date if available
          const unlockDates = matchingAchievements
            .map(a => a.minted_at)
            .filter(date => date !== null) as Date[];
            
          if (unlockDates.length > 0) {
            achievement.unlockedAt = new Date(Math.min(...unlockDates.map(d => d.getTime())));
          }
          
          console.log(\`Found achievement in DB: \${achievement.code}, progress: \${achievement.progress}/\${achievement.total}\`);
          
          // Store this achievement in our processed map
          processedAchievements.set(normalizedCode, achievement);
        } else {
          // No matching achievement in database, calculate progress based on user data
          switch (normalizedCode) {
            case 'streak_3':
            case 'streak_5':
            case 'streak_master':
              achievement.progress = maxStreakValue;
              achievement.achieved = achievement.progress >= achievement.total;
              break;
              
            case 'blockchain_pioneer':
              achievement.progress = 1;  // Connected wallet = completed
              achievement.achieved = true;
              break;
              
            case 'first_win':
              achievement.progress = userData.games_played ? 1 : 0;
              achievement.achieved = achievement.progress >= 1;
              break;
              
            case 'perfect_game':
              achievement.progress = perfectGames ? 1 : 0;
              achievement.achieved = achievement.progress >= 1;
              break;
              
            case 'perfect_streak':
              achievement.progress = perfectStreak ? 1 : 0;
              achievement.achieved = achievement.progress >= 1;
              break;
              
            case 'marathon_player':
              achievement.progress = userData.games_played || 0;
              achievement.achieved = achievement.progress >= achievement.total;
              break;
            
            case 'category_master':
              achievement.progress = categoryMasterCount;
              achievement.achieved = achievement.progress >= achievement.total;
              break;
            
            case 'difficulty_master':
              achievement.progress = difficultyCount;
              achievement.achieved = achievement.progress >= achievement.total;
              break;
              
            case 'quick_thinker':
              achievement.progress = quickAnswers;
              achievement.achieved = achievement.progress >= achievement.total;
              break;
              
            case 'random_master':
              // Use direct category achievement check instead of counts from responses
              const randomCount = await this.checkCategoryAchievement(userId, 'random'); 
              achievement.progress = randomCount;
              achievement.achieved = achievement.progress >= achievement.total;
              break;
              
            case 'general_master':
              // Use direct category achievement check instead of counts from responses
              const generalCount = await this.checkCategoryAchievement(userId, 'general');
              achievement.progress = generalCount;
              achievement.achieved = achievement.progress >= achievement.total;
              break;
              
            // Check for category achievements
            default:
              if (normalizedCode.endsWith('_master')) {
                const category = normalizedCode.replace('_master', '');
                const categoryAchievementCount = await this.checkCategoryAchievement(userId, category);
                achievement.progress = categoryAchievementCount;
                achievement.achieved = achievement.progress >= achievement.total;
                console.log(\`Calculated category achievement progress for \${achievement.code}: \${achievement.progress}/\${achievement.total}\`);
              }
          }
          
          // Only store this achievement if we haven't processed a matching one yet
          if (!processedAchievements.has(normalizedCode)) {
            processedAchievements.set(normalizedCode, achievement);
          } else {
            // If we already have this achievement but with lower progress, replace it
            const existing = processedAchievements.get(normalizedCode);
            if ((achievement.progress / achievement.total) > (existing.progress / existing.total)) {
              processedAchievements.set(normalizedCode, achievement);
            }
          }
        }
      }
      
      // Convert the map to an array
      const finalAchievements = Array.from(processedAchievements.values());
      
      // Log the final count
      console.log(\`Returning \${finalAchievements.length} achievements, with \${finalAchievements.filter(a => a.achieved).length} achieved\`);
      
      return finalAchievements;
    } catch (error) {
      console.error('Error getting user achievements:', error);
      return { error: 'Failed to get achievements' };
    }
  }
  
  /**
   * Process all achievements for a game
   */
  async processGameEnd(stats: GameStats): Promise<Achievement[]> {
    try {
      console.log(\`Processing achievements for user \${stats.userId}, session \${stats.sessionId}\`);
      const achievementsList: Achievement[] = [];
      
      // Always ensure BLOCKCHAIN_PIONEER is present
      const blockchainPioneer = await prisma.trivia_achievements.upsert({
        where: {
          id: await this.findAchievementId(stats.userId, 'BLOCKCHAIN_PIONEER')
        },
        update: {
          score: 1
        },
        create: {
          user_id: stats.userId,
          achievement_type: 'BLOCKCHAIN_PIONEER',
          score: 1,
          week_number: Math.ceil((new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 604800000),
          year: new Date().getFullYear(),
          streak_milestone: 0
        }
      });
      
      if (blockchainPioneer) {
        achievementsList.push({
          code: 'BLOCKCHAIN_PIONEER',
          ...ACHIEVEMENT_DISPLAY['BLOCKCHAIN_PIONEER'],
          achieved: true,
          progress: 1,
          total: 1,
          unlockedAt: new Date()
        });
      }
      
      // Update MARATHON_PLAYER achievement
      const userData = await prisma.trivia_users.findUnique({
        where: { id: stats.userId },
        select: { games_played: true }
      });
      
      if (userData) {
        const marathonPlayer = await prisma.trivia_achievements.upsert({
          where: {
            id: await this.findAchievementId(stats.userId, 'MARATHON_PLAYER')
          },
          update: {
            score: userData.games_played
          },
          create: {
            user_id: stats.userId,
            achievement_type: 'MARATHON_PLAYER',
            score: userData.games_played,
            week_number: Math.ceil((new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 604800000),
            year: new Date().getFullYear(),
            streak_milestone: 0
          }
        });
        
        if (marathonPlayer && ACHIEVEMENT_DISPLAY['MARATHON_PLAYER']) {
          achievementsList.push({
            code: 'MARATHON_PLAYER',
            ...ACHIEVEMENT_DISPLAY['MARATHON_PLAYER'],
            achieved: userData.games_played >= 50,
            progress: userData.games_played,
            total: 50,
            unlockedAt: userData.games_played >= 50 ? new Date() : null
          });
        }
      }
      
      // Check for PERFECT_GAME achievement if the current game was a perfect game
      if (stats.correctAnswers === stats.totalQuestions && stats.totalQuestions === 10) {
        const perfectGame = await prisma.trivia_achievements.upsert({
          where: {
            id: await this.findAchievementId(stats.userId, 'PERFECT_GAME')
          },
          update: {
            score: 1
          },
          create: {
            user_id: stats.userId,
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
          progress: 1,
          total: 1,
          unlockedAt: new Date()
        });
        
        // Also award PERFECT_STREAK for a perfect game
        const perfectStreak = await prisma.trivia_achievements.upsert({
          where: {
            id: await this.findAchievementId(stats.userId, 'PERFECT_STREAK')
          },
          update: {
            score: 1
          },
          create: {
            user_id: stats.userId,
            achievement_type: 'PERFECT_STREAK',
            score: 1,
            week_number: Math.ceil((new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 604800000),
            year: new Date().getFullYear(),
            streak_milestone: 0
          }
        });
        
        achievementsList.push({
          code: 'PERFECT_STREAK',
          ...ACHIEVEMENT_DISPLAY['PERFECT_STREAK'],
          achieved: true,
          progress: 1,
          total: 1,
          unlockedAt: new Date()
        });
      }
      
      // Update CATEGORY_MASTER achievement
      const categoryMasterCount = await this.checkCategoryMaster(stats.userId);
      if (categoryMasterCount > 0) {
        await prisma.trivia_achievements.upsert({
          where: {
            id: await this.findAchievementId(stats.userId, 'CATEGORY_MASTER')
          },
          update: {
            score: categoryMasterCount
          },
          create: {
            user_id: stats.userId,
            achievement_type: 'CATEGORY_MASTER',
            score: categoryMasterCount,
            week_number: Math.ceil((new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 604800000),
            year: new Date().getFullYear(),
            streak_milestone: 0
          }
        });
        
        achievementsList.push({
          code: 'CATEGORY_MASTER',
          ...ACHIEVEMENT_DISPLAY['CATEGORY_MASTER'],
          achieved: categoryMasterCount >= 50,
          progress: categoryMasterCount,
          total: 50,
          unlockedAt: categoryMasterCount >= 50 ? new Date() : null
        });
      }
      
      // Update DIFFICULTY_MASTER achievement
      const difficultyCount = await this.checkDifficultyMaster(stats.userId);
      if (difficultyCount > 0) {
        await prisma.trivia_achievements.upsert({
          where: {
            id: await this.findAchievementId(stats.userId, 'DIFFICULTY_MASTER')
          },
          update: {
            score: difficultyCount
          },
          create: {
            user_id: stats.userId,
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
      }
      
      // Check category-specific achievements based on the current game
      if (stats.category) {
        const normalizedCategory = this.normalizeCategory(stats.category);
        const achievementType = this.CATEGORY_TO_ACHIEVEMENT[normalizedCategory] || \`\${normalizedCategory}_master\`;
        
        if (ACHIEVEMENT_DISPLAY[achievementType]) {
          const categoryCount = await this.checkCategoryAchievement(stats.userId, stats.category);
          
          if (categoryCount > 0) {
            await prisma.trivia_achievements.upsert({
              where: {
                id: await this.findAchievementId(stats.userId, achievementType)
              },
              update: {
                score: categoryCount
              },
              create: {
                user_id: stats.userId,
                achievement_type: achievementType,
                score: categoryCount,
                week_number: Math.ceil((new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 604800000),
                year: new Date().getFullYear(),
                streak_milestone: 0
              }
            });
            
            achievementsList.push({
              code: achievementType,
              ...ACHIEVEMENT_DISPLAY[achievementType],
              achieved: categoryCount >= ACHIEVEMENT_DISPLAY[achievementType].total,
              progress: categoryCount,
              total: ACHIEVEMENT_DISPLAY[achievementType].total,
              unlockedAt: categoryCount >= ACHIEVEMENT_DISPLAY[achievementType].total ? new Date() : null
            });
          }
        }
      }
      
      // Update QUICK_THINKER achievement
      const quickAnswers = await this.checkQuickThinker(stats.userId);
      if (quickAnswers > 0) {
        await prisma.trivia_achievements.upsert({
          where: {
            id: await this.findAchievementId(stats.userId, 'QUICK_THINKER')
          },
          update: {
            score: quickAnswers
          },
          create: {
            user_id: stats.userId,
            achievement_type: 'QUICK_THINKER',
            score: quickAnswers,
            week_number: Math.ceil((new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 604800000),
            year: new Date().getFullYear(),
            streak_milestone: 0
          }
        });
        
        achievementsList.push({
          code: 'QUICK_THINKER',
          ...ACHIEVEMENT_DISPLAY['QUICK_THINKER'],
          achieved: quickAnswers >= 25,
          progress: quickAnswers,
          total: 25,
          unlockedAt: quickAnswers >= 25 ? new Date() : null
        });
      }
      
      return achievementsList.filter(Boolean);
    } catch (error) {
      console.error('Error in processGameEnd:', error);
      return [];
    }
  }
}`;

// Write the fixed file
fs.writeFileSync(SERVICE_PATH, fixedContent, 'utf8');
console.log('Fixed AchievementService.ts with a clean implementation!');
