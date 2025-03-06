import { NextResponse, NextRequest, RouteHandler } from '@/app/experimental-route-type';
import { prisma } from '@/lib/db/client';
import { trivia_game_status } from '@prisma/client';

// Mark as dynamic route to avoid static generation errors
export const dynamic = 'force-dynamic';

/**
 * PATCH handler for session updates
 */
const patchHandler: RouteHandler<{ id: string }> = async (
  request,
  { params }
) => {
  try {
    if (!params?.id) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      );
    }

    const sessionId = parseInt(params.id);
    if (isNaN(sessionId)) {
      return NextResponse.json(
        { error: 'Invalid session ID' },
        { status: 400 }
      );
    }

    // Wrap all operations in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // First verify the session exists and get its relationships
      const session = await tx.trivia_game_sessions.findUnique({
        where: { id: sessionId },
        include: {
          trivia_streak_history: true,
          trivia_player_responses: true,
          security_logs: true
        }
      });

      if (!session) {
        throw new Error('Session not found');
      }

      // Update relationships first - use disconnect instead of null
      if (session.trivia_streak_history.length > 0) {
        await tx.trivia_streak_history.deleteMany({
          where: { game_session_id: sessionId }
        });
      }

      // Then update the session status
      const updatedSession = await tx.trivia_game_sessions.update({
        where: { id: sessionId },
        data: {
          status: trivia_game_status.completed,
          ended_at: new Date()
        }
      });

      // Create a completion log
      await tx.security_logs.create({
        data: {
          session_id: sessionId,
          activity_type: 'SESSION',
          details: {
            type: 'session_completed',
            timestamp: new Date().toISOString(),
            responseCount: session.trivia_player_responses.length,
            streakCount: session.trivia_streak_history.length
          }
        }
      });

      return updatedSession;
    });

    return NextResponse.json({
      success: true,
      session: result
    });

  } catch (error) {
    console.error('Session cleanup error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to cleanup session' },
      { status: error instanceof Error && error.message === 'Session not found' ? 404 : 500 }
    );
  }
};

// Export the DELETE handler that calls PATCH
const deleteHandler: RouteHandler<{ id: string }> = (
  request,
  context
) => {
  return patchHandler(request, context);
};

// Export with the names Next.js expects
export const PATCH = patchHandler;
export const DELETE = deleteHandler;
