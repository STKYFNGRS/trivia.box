import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { prisma } from '@/lib/db/client';
import { AchievementService } from '@/services/achievements/AchievementService';
import { Achievement } from '@/types/achievements';

// Mark as dynamic route to avoid static generation errors
export const dynamic = 'force-dynamic';

// Helper function to safely stringify BigInt values
function convertBigIntToNumber(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'bigint') {
    return Number(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(convertBigIntToNumber);
  }

  if (typeof obj === 'object') {
    const result: any = {};
    for (const key in obj) {
      result[key] = convertBigIntToNumber(obj[key]);
    }
    return result;
  }

  return obj;
}

// Cache for achievements to reduce duplicate calls
const achievementsCache = new Map();
const CACHE_TTL = 30 * 1000; // 30 seconds in milliseconds

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get('wallet');
  const noCache = searchParams.get('no-cache') === 'true';

  try {
    // If no wallet, return error
    if (!wallet) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }

    // Get user by wallet - normalize the wallet address
    const normalizedWallet = wallet.toLowerCase();
    console.log(`Fetching achievements for normalized wallet: ${normalizedWallet}`);
    
    // Remove any existing process listeners to prevent memory leaks
    const maxListeners = process.getMaxListeners();
    if (process.listenerCount('beforeExit') > 5) {
      console.log(`Cleaning up excess beforeExit listeners: ${process.listenerCount('beforeExit')}`);
      // Save the original listeners
      const originalListeners = process.listeners('beforeExit');
      // Remove all listeners
      process.removeAllListeners('beforeExit');
      // Add back only the first 5 listeners (system ones)
      for (let i = 0; i < Math.min(5, originalListeners.length); i++) {
        process.on('beforeExit', originalListeners[i]);
      }
    }
    
    // Check cache first
    const cacheKey = `achievements-${normalizedWallet}`;
    const cachedData = achievementsCache.get(cacheKey);
    
    if (!noCache && cachedData && Date.now() - cachedData.timestamp < CACHE_TTL) {
      console.log(`Using cached achievements for wallet: ${normalizedWallet}`);
      return NextResponse.json({ achievements: convertBigIntToNumber(cachedData.data) }, { 
        headers: {
          'Cache-Control': 'max-age=30, s-maxage=60, stale-while-revalidate=300'
        } 
      });
    }
    
    const user = await prisma.trivia_users.findFirst({
      where: {
        wallet_address: {
          contains: normalizedWallet,
          mode: 'insensitive'
        }
      }
    });

    if (!user) {
      console.log(`User not found for wallet: ${wallet}`);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    console.log(`Found user ${user.id} for wallet ${normalizedWallet}`);

    // Use the AchievementService to get achievements
    const achievementService = AchievementService.getInstance();
    let achievements = await achievementService.getUserAchievements(user.id);

    // Handle error responses from the service
    if ('error' in achievements) {
      console.error('Achievement service error:', achievements.error);
      return NextResponse.json({ error: String(achievements.error) }, { status: 500 });
    }
    
    // Convert any BigInt values to regular numbers
    const achievementsArray = convertBigIntToNumber(achievements) as Achievement[];
    
    // Additional cleanup - deduplicate achievements with the same display name
    // This handles cases where SCIENCE_MASTER and science_master both exist
    const uniqueAchievements = new Map();
    
    for (const achievement of achievementsArray) {
      const key = `${achievement.name}|${achievement.description}`;
      
      // If we already have this achievement, only keep the one with more progress
      if (uniqueAchievements.has(key)) {
        const existing = uniqueAchievements.get(key);
        // Keep the achievement with more progress
        if ((achievement.progress / achievement.total) > (existing.progress / existing.total)) {
          uniqueAchievements.set(key, achievement);
        }
      } else {
        uniqueAchievements.set(key, achievement);
      }
    }
    
    const finalAchievements = Array.from(uniqueAchievements.values());
    
    // Log achievement summary for debugging
    console.log(`Returning ${finalAchievements.length} achievements, with ${finalAchievements.filter(a => a.achieved).length} achieved`);
    
    // Cache the result
    achievementsCache.set(cacheKey, {
      data: finalAchievements,
      timestamp: Date.now()
    });
    
    return NextResponse.json({ achievements: finalAchievements }, {
      headers: {
        'Cache-Control': 'max-age=30, s-maxage=60, stale-while-revalidate=300'
      }
    });
  } catch (error) {
    console.error('Failed to fetch achievements:', error);
    return NextResponse.json({ error: 'Internal server error', details: String(error) }, { status: 500 });
  }
}