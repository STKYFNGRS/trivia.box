import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { prisma } from '@/lib/db/client';

// This route is for debugging streak data
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    // Only for development use
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || '1';

    // Get user streak history
    const streakHistory = await prisma.trivia_streak_history.findMany({
      where: {
        user_id: parseInt(userId)
      },
      orderBy: {
        streak_count: 'desc'
      },
      take: 10
    });

    // Get user data
    const userData = await prisma.trivia_users.findUnique({
      where: {
        id: parseInt(userId)
      },
      select: {
        best_streak: true,
        games_played: true,
        total_points: true,
        wallet_address: true
      }
    });

    // Get response data with highest streaks
    const topStreakResponses = await prisma.trivia_player_responses.findMany({
      where: {
        user_id: parseInt(userId)
      },
      orderBy: {
        streak_count: 'desc'
      },
      take: 10
    });

    return NextResponse.json({
      userData,
      streakHistory,
      topStreakResponses: topStreakResponses.map(r => ({
        streak_count: r.streak_count,
        answered_at: r.answered_at,
        is_correct: r.is_correct
      }))
    });

  } catch (error) {
    console.error('Error in debug-streak route:', error);
    return NextResponse.json(
      { error: 'Failed to fetch streak data' },
      { status: 500 }
    );
  }
}