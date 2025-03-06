'use server';

import { AchievementService, type GameStats } from '@/services/achievements/AchievementService';
import { type trivia_category } from '@prisma/client';

/**
 * Record a game's completion and process achievements
 */
export async function processGameAchievements(stats: GameStats) {
  try {
    // Get the achievement service instance
    const achievementService = AchievementService.getInstance();
    
    // Process achievements using the service
    return await achievementService.processGameEnd(stats);
  } catch (error) {
    console.error('Error processing game achievements:', error);
    return [];
  }
}

/**
 * Verify user achievements
 */
export async function verifyUserAchievements(userId: number) {
  try {
    const achievementService = AchievementService.getInstance();
    return await achievementService.verifyUserAchievements(userId);
  } catch (error) {
    console.error('Error verifying user achievements:', error);
    return { error: 'Failed to verify achievements' };
  }
}

/**
 * Get achievements for a user
 */
export async function getUserAchievements(userId: number) {
  try {
    const achievementService = AchievementService.getInstance();
    return await achievementService.getUserAchievements(userId);
  } catch (error) {
    console.error('Error getting user achievements:', error);
    return { error: 'Failed to get achievements' };
  }
}