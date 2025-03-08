import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { prisma } from '@/lib/db/client';

// Add caching while still allowing revalidation
export const dynamic = 'force-dynamic';
export const revalidate = 60; // Revalidate every 60 seconds

// Cache for user stats to reduce duplicate database calls
const statsCache = new Map();
const CACHE_TTL = 30 * 1000; // 30 seconds in milliseconds

export async function GET(req: Request) {
  try {
    // Handle the URL safely to avoid parsing errors
    let walletAddress: string | null = null;
    
    try {
      // Try the standard way first
      const url = new URL(req.url);
      const walletParam = url.searchParams.get('wallet');
      walletAddress = walletParam ? walletParam.toLowerCase() : null;
    } catch (urlError) {
      // Fallback: Extract wallet parameter directly from the request URL
      console.warn('URL parsing error:', urlError);
      
      const urlString = req.url || '';
      const walletMatch = urlString.match(/[?&]wallet=([^&]*)/i);
      if (walletMatch && walletMatch[1]) {
        walletAddress = decodeURIComponent(walletMatch[1]).toLowerCase();
      }
    }
    
    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }

    // Check cache first
    const cacheKey = `stats-${walletAddress}`;
    const cachedData = statsCache.get(cacheKey);
    
    if (cachedData && Date.now() - cachedData.timestamp < CACHE_TTL) {
      console.log(`Using cached stats for wallet: ${walletAddress}`);
      return NextResponse.json(cachedData.data, { 
        headers: {
          'Cache-Control': 'max-age=30, s-maxage=60, stale-while-revalidate=300'
        } 
      });
    }

    // Add retry mechanism for database connection issues
    let retries = 2;
    let user: any = null;
    let rank = 0;

    try {
      while (retries > 0 && user === null) {
        try {
          // Get user data
          user = await prisma.trivia_users.findFirst({
            where: { 
              wallet_address: {
                equals: walletAddress,
                mode: 'insensitive'
              }
            },
            select: {
              id: true,
              total_points: true,
              games_played: true,
              best_streak: true
            }
          });

          // If user found, get highest streak from streak history
          if (user) {
            const maxStreak = await prisma.trivia_streak_history.findFirst({
              where: {
                user_id: user.id
              },
              orderBy: {
                streak_count: 'desc'
              },
              select: {
                streak_count: true
              }
            });

            // Use the highest streak from history if available
            if (maxStreak) {
              console.log(`Using streak from history: ${maxStreak.streak_count} instead of ${user.best_streak}`);
              user.best_streak = maxStreak.streak_count;
            } else if (user.best_streak === 50) {
              // If best_streak is 50 and no history, reset it
              console.log('Resetting suspicious best_streak value of 50');
              user.best_streak = 0;
            }

            // Get user rank
            rank = await prisma.trivia_users.count({
              where: {
                total_points: {
                  gt: user.total_points
                }
              }
            });
          }
          
          // Success, exit the retry loop
          break;
        } catch (dbError) {
          console.warn(`Database error (retries left: ${retries}):`, dbError);
          retries--;
          // Wait before retrying
          if (retries > 0) await new Promise(resolve => setTimeout(resolve, 300));
        }
      }

      return handleResults(user, rank, walletAddress);
    } catch (dbError) {
      console.warn(`Database error:`, dbError);
      // Return default stats
      return handleResults(null, 0, walletAddress);
    }
  } catch (error) {
    console.error('Error in stats route:', error instanceof Error ? {
        message: error.message,
        name: error.name,
        stack: error.stack
      } : error);
    return NextResponse.json(
      { error: 'Failed to fetch user stats' },
      { status: 500 }
    );
  }
}

// Helper function to format and return stats
function handleResults(user: any, rank: number, walletAddress: string) {
  if (!user) {
    // Return default stats for new users
    console.log('No user found, returning default stats');
    const defaultStats = {
      totalPoints: 0,
      gamesPlayed: 0,
      bestStreak: 0,
      rank: 1
    };
    
    // Cache the result
    statsCache.set(`stats-${walletAddress}`, { 
      data: defaultStats, 
      timestamp: Date.now() 
    });
    
    return NextResponse.json(defaultStats, { 
      headers: {
        'Cache-Control': 'max-age=30, s-maxage=60, stale-while-revalidate=300'
      } 
    });
  }

  // Convert BigInt to regular number for JSON serialization
  const totalPoints = typeof user.total_points === 'bigint' 
    ? Number(user.total_points)
    : Number(user.total_points || 0);
    
  // Use the (possibly corrected) best_streak value
  const bestStreak = user.best_streak || 0;
  
  console.log(`User ${user.id} stats - totalPoints: ${totalPoints}, gamesPlayed: ${user.games_played}, bestStreak: ${bestStreak}, rank: ${rank + 1}`);

  const userStats = {
    totalPoints,
    gamesPlayed: user.games_played,
    bestStreak: bestStreak,
    rank: rank + 1
  };
  
  // Cache the result
  statsCache.set(`stats-${walletAddress}`, { 
    data: userStats, 
    timestamp: Date.now() 
  });

  return NextResponse.json(userStats, { 
    headers: {
      'Cache-Control': 'max-age=30, s-maxage=60, stale-while-revalidate=300'
    } 
  });
}