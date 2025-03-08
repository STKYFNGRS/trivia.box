import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { prisma } from '@/lib/db/client';
import { AchievementService } from '@/services/achievements/AchievementService';
import { ACHIEVEMENT_DISPLAY } from '@/types/achievements';

// Force dynamic to prevent caching
export const dynamic = 'force-dynamic';

// Interface for fixed achievement objects
interface FixedAchievement {
  type: string;
  score: number;
  threshold?: number;
  oldType?: string;
  category?: string;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const walletAddress = searchParams.get('wallet');
    const forceUpdate = searchParams.get('force') === 'true';
    
    if (!walletAddress) {
      return NextResponse.json({ 
        error: 'Wallet address is required' 
      }, { status: 400 });
    }
    
    // Get user by wallet address
    const user = await prisma.trivia_users.findFirst({
      where: {
        wallet_address: {
          equals: walletAddress.toLowerCase(),
          mode: 'insensitive'
        }
      }
    });
    
    if (!user) {
      return NextResponse.json({ 
        error: 'User not found' 
      }, { status: 404 });
    }
    
    // Use the AchievementService to verify and fix user achievements
    const achievementService = AchievementService.getInstance();
    const verificationResult = await achievementService.verifyUserAchievements(user.id);
    
    // Check for categories with significant progress and ensure they have achievements
    const categoryResponses = await prisma.trivia_player_responses.findMany({
      where: {
        user_id: user.id,
        is_correct: true
      },
      include: {
        trivia_questions: {
          select: {
            category: true
          }
        }
      }
    });
    
    // Count responses by category
    const categoryCounts: Record<string, number> = {};
    categoryResponses.forEach(response => {
      if (response.trivia_questions?.category) {
        const category = response.trivia_questions.category.toLowerCase().replace(/\s+/g, '_');
        categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      }
    });
    
    console.log('Category counts from user responses:', categoryCounts);
    
    // Category name mappings
    const categoryMappings: Record<string, string> = {
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
    
    const categoryAchievements: FixedAchievement[] = [];
    
    // Fix category achievements
    for (const [category, count] of Object.entries(categoryCounts)) {
      if (count > 0) {
        // Normalize category
        const normalizedCategory = categoryMappings[category] || category;
        
        // Generate achievement type
        const achievementType = `${normalizedCategory}_master`;
        
        // Find if we have a matching definition
        const matchingType = Object.keys(ACHIEVEMENT_DISPLAY).find(key =>
          key.toLowerCase() === achievementType.toLowerCase()
        );
        
        if (matchingType || ACHIEVEMENT_DISPLAY[achievementType]) {
          const finalType = matchingType || achievementType;
          const achievementId = await findAchievementId(user.id, finalType);
          
          if (achievementId === -1) {
            // Achievement doesn't exist, create it
            if (forceUpdate) {
              await prisma.trivia_achievements.create({
                data: {
                  user_id: user.id,
                  achievement_type: finalType,
                  score: count,
                  week_number: Math.ceil((new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 604800000),
                  year: new Date().getFullYear(),
                  streak_milestone: 0,
                  minted_at: new Date()
                }
              });
            }
            
            categoryAchievements.push({
              type: finalType, 
              score: count,
              category
            });
          } else {
            // Achievement exists, update if count is higher
            const existing = await prisma.trivia_achievements.findUnique({
              where: { id: achievementId }
            });
            
            if (existing && existing.score < count) {
              if (forceUpdate) {
                await prisma.trivia_achievements.update({
                  where: { id: achievementId },
                  data: { score: count }
                });
              }
              
              categoryAchievements.push({
                type: finalType,
                score: count,
                oldType: existing.achievement_type,
                category
              });
            }
          }
        }
      }
    }
    
    // Check for duplicate achievements with different case 
    // (e.g. SCIENCE_MASTER and science_master)
    const existingAchievements = await prisma.trivia_achievements.findMany({
      where: { user_id: user.id }
    });
    
    // Group by normalized type
    const achievementsByNormalizedType: Record<string, any[]> = {};
    existingAchievements.forEach(achievement => {
      const normalizedType = achievement.achievement_type.toLowerCase();
      if (!achievementsByNormalizedType[normalizedType]) {
        achievementsByNormalizedType[normalizedType] = [];
      }
      achievementsByNormalizedType[normalizedType].push(achievement);
    });
    
    // Fix duplicates
    // Define interfaces for our achievement objects
    interface MergedAchievement {
      id: number;
      type: string;
      score: number;
    }
    
    interface DeletedAchievement {
      id: number;
      type: string;
    }
    
    const mergedAchievements: MergedAchievement[] = [];
    const deletedAchievements: DeletedAchievement[] = [];
    
    for (const [normalizedType, achievements] of Object.entries(achievementsByNormalizedType)) {
      if (achievements.length > 1) {
        // Multiple achievements with same normalized type
        console.log(`Found ${achievements.length} achievements for type ${normalizedType}:`);
        console.log(achievements.map(a => `${a.achievement_type}: ${a.score}`).join(', '));
        
        // Keep the one with highest score
        achievements.sort((a, b) => b.score - a.score);
        const primaryAchievement = achievements[0];
        
        // For the canonical type, prefer the one that matches a definition in ACHIEVEMENT_DISPLAY
        let canonicalType = primaryAchievement.achievement_type;
        
        for (const achievement of achievements) {
          if (ACHIEVEMENT_DISPLAY[achievement.achievement_type]) {
            canonicalType = achievement.achievement_type;
            break;
          }
        }
        
        // Update primary achievement with the canonical type and highest score
        if (forceUpdate) {
          await prisma.trivia_achievements.update({
            where: { id: primaryAchievement.id },
            data: {
              achievement_type: canonicalType
            }
          });
        }
        
        mergedAchievements.push({
          id: primaryAchievement.id,
          type: canonicalType,
          score: primaryAchievement.score
        });
        
        // Delete duplicates
        if (forceUpdate) {
          for (let i = 1; i < achievements.length; i++) {
            await prisma.trivia_achievements.delete({
              where: { id: achievements[i].id }
            });
            
            deletedAchievements.push({
              id: achievements[i].id,
              type: achievements[i].achievement_type
            });
          }
        }
      }
    }
    
    // Get updated achievements
    const updatedAchievements = await achievementService.getUserAchievements(user.id);
    
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        wallet: user.wallet_address
      },
      verificationResult,
      categoryAchievements,
      mergedAchievements,
      deletedAchievements,
      achievements: updatedAchievements,
      appliedChanges: forceUpdate
    });
  } catch (error) {
    console.error('Error fixing achievements:', error);
    return NextResponse.json({ 
      error: 'Failed to fix achievements' 
    }, { status: 500 });
  }
}

// Helper to find achievement ID with case-insensitive search
async function findAchievementId(userId: number, achievementType: string): Promise<number> {
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
  
  return existingAchievement?.id ?? -1;
}