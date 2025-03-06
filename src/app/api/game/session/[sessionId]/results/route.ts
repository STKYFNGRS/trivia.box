import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { prisma } from '@/lib/db/client';

// Mark as dynamic route to avoid static generation errors
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  try {
    const sessionId = parseInt(params.sessionId);
    
    if (isNaN(sessionId)) {
      return NextResponse.json(
        { error: 'Invalid session ID' },
        { status: 400 }
      );
    }
    
    // Get game session with player responses
    const session = await prisma.trivia_game_sessions.findUnique({
      where: { id: sessionId },
      include: {
        trivia_player_responses: {
          include: {
            trivia_questions: true,
            trivia_users: {
              select: {
                id: true,
                wallet_address: true
              }
            }
          }
        }
      }
    });
    
    if (!session) {
      return NextResponse.json(
        { error: 'Game session not found' },
        { status: 404 }
      );
    }
    
    // Calculate game statistics
    let userId = 0;
    let walletAddress = '';
    let category = 'general';
    
    if (session.trivia_player_responses.length > 0) {
      userId = session.trivia_player_responses[0].trivia_users?.id || 0;
      walletAddress = session.trivia_player_responses[0].trivia_users?.wallet_address || '';
      
      // Try to determine the most common category
      const categoryCount = session.trivia_player_responses.reduce((acc, response) => {
        const category = response.trivia_questions?.category;
        if (category) {
          acc[category] = (acc[category] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>);
      
      // Find category with most questions
      let maxCount = 0;
      for (const [cat, count] of Object.entries(categoryCount)) {
        if (count > maxCount) {
          maxCount = count;
          category = cat;
        }
      }
    }
    
    const correctAnswers = session.trivia_player_responses.filter(r => r.is_correct).length;
    
    // Calculate best streak
    const streaks = session.trivia_player_responses.map(r => r.streak_count);
    const bestStreak = streaks.length > 0 ? Math.max(...streaks) : 0;
    
    // Calculate average response time
    const totalResponseTime = session.trivia_player_responses.reduce(
      (sum, r) => sum + r.response_time_ms, 
      0
    );
    const averageResponseTime = session.trivia_player_responses.length > 0 
      ? totalResponseTime / session.trivia_player_responses.length 
      : 0;
    
    return NextResponse.json({
      success: true,
      sessionId,
      userId,
      walletAddress,
      category,
      correctAnswers,
      totalQuestions: session.trivia_player_responses.length,
      bestStreak,
      averageResponseTime,
      startedAt: session.started_at,
      endedAt: session.ended_at
    });
    
  } catch (error) {
    console.error('Error getting game session results:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}