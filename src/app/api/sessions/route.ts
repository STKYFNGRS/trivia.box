import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { prisma } from '@/lib/db/client';
import { ServerGameQuestionService } from '@/services/server/GameQuestionService';
import { trivia_game_status, ActivityLogType } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { RateLimitService } from '@/services/RateLimitService';

// Mark as dynamic route to avoid static generation errors
export const dynamic = 'force-dynamic';

const DEFAULT_CONFIG = {
  roundTime: 30000,
  transitionDelay: 3000,
  questionsPerRound: 5,
  numberOfRounds: 1
};

export async function POST() {
  try {
    // Check rate limiting first
    const rateLimitService = RateLimitService.getInstance();
    const canCreateSession = await rateLimitService.checkRateLimit('session-create', ActivityLogType.SESSION);
    
    if (!canCreateSession) {
      console.log('Rate limit exceeded for session creation');
      return NextResponse.json(
        { 
          success: false,
          error: 'Too many session requests',
          details: 'Please wait before trying again'
        },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }

    // Verify database connection
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (dbError) {
      console.error('Database connection failed:', dbError);
      return NextResponse.json(
        { 
          success: false,
          error: 'Database connection failed',
          details: 'Unable to connect to game server. Please try again later.'
        },
        { status: 503 }
      );
    }

    // Clean up old pending sessions first - with proper transaction ordering
    await prisma.$transaction(async (tx) => {
      // 1. First get all old sessions to clean up
      const oldSessions = await tx.trivia_game_sessions.findMany({
        where: {
          OR: [
            {
              status: 'pending',
              started_at: {
                lt: new Date(Date.now() - 3600000) // 1 hour old
              }
            },
            {
              status: 'completed',
              ended_at: {
                lt: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hours old
              }
            }
          ]
        },
        include: {
          trivia_streak_history: true,
          trivia_player_responses: true,
          security_logs: true
        }
      });

      // 2. For each session, clean up in correct order
      for (const session of oldSessions) {
        // First delete streak history entries instead of nullifying
        if (session.trivia_streak_history.length > 0) {
          await tx.trivia_streak_history.deleteMany({
            where: { game_session_id: session.id }
          });
        }

        // Delete related records
        if (session.security_logs.length > 0) {
          await tx.security_logs.deleteMany({
            where: { session_id: session.id }
          });
        }

        if (session.trivia_player_responses.length > 0) {
          await tx.trivia_player_responses.deleteMany({
            where: { game_session_id: session.id }
          });
        }

        // Finally delete the session itself
        await tx.trivia_game_sessions.delete({
          where: { id: session.id }
        });
      }
    });

    // Get questions first to ensure we have them before creating a session
    const questionService = ServerGameQuestionService.getInstance();
    
    let questions;
    try {
      console.log('Fetching questions for new game session...');
      questions = await questionService.getQuestionsForGame({
        questionsPerRound: DEFAULT_CONFIG.questionsPerRound,
        numberOfRounds: DEFAULT_CONFIG.numberOfRounds
      });

      if (!questions?.[0]?.length) {
        console.error('No questions available for game session');
        return NextResponse.json(
          { 
            success: false,
            error: 'No questions available',
            details: 'Unable to retrieve questions. Please try again later.'
          },
          { status: 503 }
        );
      }

      if (questions[0].length < DEFAULT_CONFIG.questionsPerRound) {
        console.error(`Insufficient questions: got ${questions[0].length}, need ${DEFAULT_CONFIG.questionsPerRound}`);
        return NextResponse.json(
          { 
            success: false,
            error: 'Insufficient questions',
            details: 'Not enough questions available for a complete game. Please try again later.'
          },
          { status: 503 }
        );
      }

      console.log(`Successfully fetched ${questions[0].length} questions for round 1`);
    } catch (questionError) {
      console.error('Error fetching questions:', questionError);
      return NextResponse.json(
        { 
          success: false,
          error: 'Question service error',
          details: 'Failed to retrieve questions. Please try again later.'
        },
        { status: 503 }
      );
    }

    // Start a transaction to ensure session and security log are created together
    let session;
    try {
      session = await prisma.$transaction(async (tx) => {
        // Create session with stringified question sequence
        console.log('Creating new game session...');
        const newSession = await tx.trivia_game_sessions.create({
          data: {
            status: trivia_game_status.active,
            started_at: new Date(),
            question_sequence: JSON.stringify(questions[0].map(q => q.id)),
            player_count: 1,
            current_index: 0
          }
        });

        console.log(`Created session with ID: ${newSession.id}`);

        // Create security log
        console.log('Creating security log...');
        await tx.security_logs.create({
          data: {
            session_id: newSession.id,
            activity_type: ActivityLogType.SESSION,
            details: {
              type: 'session_created',
              timestamp: new Date().toISOString(),
              questionCount: questions[0].length,
              questionIds: questions[0].map(q => q.id),
              session_id: newSession.id,
              config: DEFAULT_CONFIG
            } as Prisma.JsonObject,
            logged_at: new Date()
          }
        });

        console.log('Security log created successfully');
        return newSession;
      });
    } catch (transactionError) {
      console.error('Transaction failed:', transactionError);
      return NextResponse.json(
        { 
          success: false,
          error: 'Failed to create session',
          details: 'Unable to initialize game session. Please try again.'
        },
        { status: 500 }
      );
    }

    // Clean up old sessions in the background
    prisma.$transaction([
      prisma.security_logs.deleteMany({
        where: {
          session_id: {
            in: (await prisma.trivia_game_sessions.findMany({
              where: {
                OR: [
                  { started_at: { lte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
                  { status: 'completed' }
                ]
              },
              select: { id: true }
            })).map(s => s.id)
          }
        }
      }),
      prisma.trivia_player_responses.deleteMany({
        where: {
          game_session_id: {
            in: (await prisma.trivia_game_sessions.findMany({
              where: {
                OR: [
                  { started_at: { lte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
                  { status: 'completed' }
                ]
              },
              select: { id: true }
            })).map(s => s.id)
          }
        }
      }),
      prisma.trivia_game_sessions.deleteMany({
        where: {
          OR: [
            { started_at: { lte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
            { status: 'completed' }
          ]
        }
      })
    ]).catch(error => {
      console.error('Failed to clean up old sessions:', error);
      // Don't fail the request if cleanup fails
    });

    console.log('Returning successful response');
    return NextResponse.json({
      success: true,
      sessionId: session.id,
      questions: questions[0],
      config: {
        ...DEFAULT_CONFIG,
        currentRound: 1,
        status: trivia_game_status.active
      }
    });

  } catch (error) {
    console.error('Failed to create session:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to create session',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}

// Add DELETE endpoint for cleanup
export async function DELETE(req: Request) {
  try {
    const sessionId = new URL(req.url).pathname.split('/').pop();
    
    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'Session ID required' },
        { status: 400 }
      );
    }

    await prisma.$transaction([
      prisma.trivia_player_responses.deleteMany({
        where: { game_session_id: parseInt(sessionId) }
      }),
      prisma.trivia_game_sessions.delete({
        where: { id: parseInt(sessionId) }
      })
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete session:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete session' },
      { status: 500 }
    );
  }
}