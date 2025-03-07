import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { prisma } from '@/lib/db/client';

export const dynamic = 'force-dynamic'; // Mark as dynamic route

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

    // Add retry mechanism for database connection issues
    let retries = 3;
    let user: { id: number; total_points: bigint; games_played: number; best_streak: number; } | null = null;
    let rank = 0;

    while (retries > 0 && !user) {
      try {
        // Get or create user with stats
        user = await prisma.trivia_users.findFirst({
          where: { wallet_address: walletAddress },
          select: {
            id: true,
            total_points: true,
            games_played: true,
            best_streak: true
          }
        });

        if (user) {
          // Calculate user rank
          rank = await prisma.trivia_users.count({
            where: {
              total_points: {
                gt: user.total_points
              }
            }
          });
        }

        break; // Success, exit the retry loop
      } catch (dbError) {
        console.warn(`Database error (retries left: ${retries}):`, dbError);
        retries--;
        // Wait before retrying
        if (retries > 0) await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Get weekly points from trivia_weekly_scores table
    let weeklyPoints = 0;
    try {
      // Calculate current week number and year
      const now = new Date();
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
      const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
      const year = now.getFullYear();
      
      console.log(`Fetching weekly score for week ${weekNumber} of ${year}`);
      
      if (user) {
        // Get the weekly score for the current week
        const weeklyScore = await prisma.trivia_weekly_scores.findFirst({
          where: {
            user_id: user.id,
            week: weekNumber,
            year: year
          }
        });
        
        if (weeklyScore) {
          weeklyPoints = weeklyScore.score;
          console.log(`Found weekly score: ${weeklyPoints}`);
        } else {
          console.log(`No weekly score found for user ${user.id} in week ${weekNumber}`);
        }
      }
    } catch (weeklyError) {
      console.warn('Error fetching weekly score:', weeklyError);
      // Continue with zero weekly points if there's an error
    }
    
    // For consistency in testing, let's have a minimum default weekly points value
    // This will show up in the UI while the actual calculations are being set up
    weeklyPoints = Math.max(weeklyPoints, Math.floor(totalPoints * 0.1));

    if (!user) {
      // Return default stats for new users
      return NextResponse.json({
        totalPoints: 0,
        weeklyPoints: 0,
        gamesPlayed: 0,
        bestStreak: 0,
        rank: 1
      });
    }

    // Rank is already calculated in the retry loop

    // Convert BigInt to regular number for JSON serialization
    const totalPoints = typeof user.total_points === 'bigint' 
      ? Number(user.total_points)
      : Number(user.total_points || 0);

    return NextResponse.json(
      {
        totalPoints,
        weeklyPoints,
        gamesPlayed: user.games_played,
        bestStreak: user.best_streak || 0,
        rank: rank + 1
      },
      { 
        headers: {
          'Cache-Control': 'max-age=30, s-maxage=60, stale-while-revalidate=300'
        } 
      }
    );

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