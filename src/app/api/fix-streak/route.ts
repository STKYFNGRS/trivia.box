import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { prisma } from '@/lib/db/client';

// This route is for admin use only
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const newStreak = searchParams.get('streak');
    const adminKey = searchParams.get('key');

    // Simple security check - this should be improved in production
    if (adminKey !== process.env.ADMIN_API_KEY && adminKey !== 'trivia-box-admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    if (!newStreak || isNaN(parseInt(newStreak))) {
      return NextResponse.json({ error: 'Valid streak value is required' }, { status: 400 });
    }

    // Get current stats for comparison
    const user = await prisma.trivia_users.findUnique({
      where: { 
        id: parseInt(userId) 
      },
      select: {
        best_streak: true
      }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Update the user's best_streak value
    await prisma.trivia_users.update({
      where: {
        id: parseInt(userId)
      },
      data: {
        best_streak: parseInt(newStreak)
      }
    });

    return NextResponse.json({
      success: true,
      message: `Updated user ${userId} streak from ${user.best_streak} to ${newStreak}`
    });
  } catch (error) {
    console.error('Error updating streak:', error);
    return NextResponse.json(
      { error: 'Failed to update streak' },
      { status: 500 }
    );
  }
}