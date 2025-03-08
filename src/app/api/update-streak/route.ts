import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { prisma } from '@/lib/db/client';

// This route updates the streak value based on actual player data
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const fixMode = searchParams.get('mode') || 'auto';

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // Get current user data for comparison
    const user = await prisma.trivia_users.findUnique({
      where: { 
        id: parseInt(userId) 
      },
      select: {
        id: true,
        best_streak: true
      }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const currentStreak = user.best_streak;
    let newStreak = 0;

    if (fixMode === 'auto') {
      // Find the highest streak_count from the streak history
      const maxStreakFromHistory = await prisma.trivia_streak_history.findFirst({
        where: {
          user_id: parseInt(userId)
        },
        orderBy: {
          streak_count: 'desc'
        }
      });
      
      console.log('Max streak from history:', maxStreakFromHistory);
      
      newStreak = maxStreakFromHistory?.streak_count || 0;
      
      // If we didn't find any valid streak, default to 0
      if (newStreak === 0 && currentStreak === 50) {
        // If current streak is the suspicious value 50, reset to a more plausible value
        newStreak = 0;
      } else if (newStreak === 0) {
        // Keep the current streak if we couldn't determine a better value
        newStreak = currentStreak;
      }
    } else {
      // Manual mode - directly use the value specified
      const manualValue = searchParams.get('value');
      if (!manualValue || isNaN(parseInt(manualValue))) {
        return NextResponse.json({ error: 'Valid streak value is required in manual mode' }, { status: 400 });
      }
      newStreak = parseInt(manualValue);
    }

    // Update the user's best_streak value
    await prisma.trivia_users.update({
      where: {
        id: parseInt(userId)
      },
      data: {
        best_streak: newStreak
      }
    });

    // Clear the cache to ensure updated values are shown
    // Note: This is handled client-side

    return NextResponse.json({
      success: true,
      message: `Updated user ${userId} streak from ${currentStreak} to ${newStreak}`,
      fixMode,
      oldStreak: currentStreak,
      newStreak
    });
  } catch (error) {
    console.error('Error updating streak:', error);
    return NextResponse.json(
      { error: 'Failed to update streak' },
      { status: 500 }
    );
  }
}