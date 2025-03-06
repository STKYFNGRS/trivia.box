import { NextResponse, NextRequest, RouteHandler } from '@/app/experimental-route-type';
import { prisma } from '@/lib/db/client';
import { trivia_game_status } from '@prisma/client';

// Mark as dynamic route to avoid static generation errors
export const dynamic = 'force-dynamic';

/**
 * Route handler for session deletion
 */
const deleteHandler: RouteHandler<{ sessionId: string }> = async (
  request,
  { params }
) => {
  try {
    const sessionId = parseInt(params.sessionId);
    
    if (isNaN(sessionId)) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid session ID' 
      }, { status: 400 });
    }

    await prisma.trivia_game_sessions.update({
      where: { id: sessionId },
      data: { 
        status: trivia_game_status.cancelled,
        ended_at: new Date()
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Session cleanup error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to cleanup session'
    }, { status: 500 });
  }
};

// Export it with the name Next.js expects
export const DELETE = deleteHandler;
