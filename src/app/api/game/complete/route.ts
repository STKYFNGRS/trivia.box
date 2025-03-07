import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { AchievementService } from '@/services/achievements/AchievementService';

// Mark as dynamic route to avoid static generation errors
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: Request) {
  try {
    console.log('API: Processing game completion request');
    
    // Parse request body
    let jsonData;
    try {
      jsonData = await req.json();
    } catch (parseError) {
      console.error('API: Invalid JSON in request body:', parseError);
      return NextResponse.json({ 
        error: 'Invalid JSON in request body', 
        details: parseError instanceof Error ? parseError.message : 'Parse error'
      }, { status: 400 });
    }
    
    const { sessionId, walletAddress, finalScore, correctAnswers, totalQuestions, bestStreak } = jsonData;
    
    console.log('API: Game completion request:', { 
      sessionId, 
      walletAddress: walletAddress ? walletAddress.slice(0, 10) + '...' : null,
      finalScore,
      correctAnswers,
      totalQuestions,
      bestStreak
    });
    
    if (!sessionId || !walletAddress) {
      return NextResponse.json({ 
        error: 'Missing required fields', 
        details: { sessionId: !sessionId, walletAddress: !walletAddress }
      }, { status: 400 });
    }
    
    // Check database connection
    try {
      await prisma.$queryRaw`SELECT 1`;
      console.log('API: Database connection verified');
    } catch (dbConnError) {
      console.error('API: Database connection error:', dbConnError);
      return NextResponse.json({
        error: 'Database connection failed',
        details: dbConnError instanceof Error ? dbConnError.message : String(dbConnError)
      }, { status: 500 });
    }
    
    // Try to get user first
    const user = await prisma.trivia_users.findFirst({
      where: {
        wallet_address: {
          contains: walletAddress.toLowerCase(),
          mode: 'insensitive'
        }
      }
    });
    
    if (!user) {
      console.error(`API: User not found for wallet: ${walletAddress}`);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    // Use a transaction to batch database operations
    await prisma.$transaction(async (tx) => {
      // Mark session as completed
      await tx.trivia_game_sessions.update({
        where: { id: parseInt(sessionId.toString()) },
        data: {
          status: 'completed',
          ended_at: new Date()
        }
      });
      
      // Record final streak if applicable
      if (bestStreak > 0) {
        await tx.trivia_streak_history.create({
          data: {
            user_id: user.id,
            game_session_id: parseInt(sessionId.toString()),
            streak_count: bestStreak,
            points_earned: finalScore || 0
          }
        });
      }
      
      // Update user stats
      await tx.trivia_users.update({
        where: { id: user.id },
        data: {
          total_points: { increment: finalScore || 0 },
          games_played: { increment: 1 },
          best_streak: bestStreak > (user.best_streak || 0) ? bestStreak : undefined,
          last_played_at: new Date()
        }
      });
    });
    
    // Verify achievements
    try {
      const achievementService = AchievementService.getInstance();
      
      // This is async but we don't need to await it for the response
      await achievementService.processGameEnd({
        userId: user.id,
        sessionId: parseInt(sessionId.toString()),
        category: 'general', // Default to general
        correctAnswers: correctAnswers || 0,
        totalQuestions: totalQuestions || 0,
        bestStreak: bestStreak || 0,
        averageResponseTime: 0, // Not critical
        startTime: new Date(Date.now() - 300000), // Approximate 5 minutes ago
        endTime: new Date()
      });
      
      console.log('API: Successfully processed achievements for session:', sessionId);
    } catch (achievementError) {
      console.error('API: Achievement processing error:', achievementError);
      // Don't fail the request if achievements fail
    }

    return NextResponse.json({
      success: true,
      message: 'Game completed successfully'
    });

  } catch (error) {
    console.error('API: Game completion error:', error);
    
    // Provide more detailed error information
    let errorMessage = 'Failed to complete game';
    let errorDetails = null;
    
    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = error.stack;
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error && typeof error === 'object') {
      errorMessage = JSON.stringify(error);
    }
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: errorDetails,
        success: false
      },
      { status: 500 }
    );
  }
}