import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { prisma } from '@/lib/db/client';
import { ScoreCalculationService } from '@/services/ScoreCalculationService';
import { AchievementService } from '@/services/AchievementService';
import type { PlayerResponse } from '@/types/scoring';

// Mark as dynamic route to avoid static generation errors
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const scoreCalculator = ScoreCalculationService.getInstance();
  const achievementService = AchievementService.getInstance();
  
  try {
    const { questionId, sessionId, answer, startTime, endTime, walletAddress, isLastQuestion, finalStats } = await req.json();
    
    if (!questionId || !sessionId || !startTime || !endTime || !walletAddress) {
      return NextResponse.json({ 
        error: 'Missing required fields', 
        details: { questionId: !questionId, sessionId: !sessionId, startTime: !startTime, endTime: !endTime, walletAddress: !walletAddress }
      }, { status: 400 });
    }
    
    // Validate timing early to fail fast if invalid
    const timing = scoreCalculator.validateTiming(startTime, endTime);
    if (!timing.isValid) {
      return NextResponse.json({ error: 'Invalid timing' }, { status: 400 });
    }
    
    // Use a transaction to batch database operations
    const result = await prisma.$transaction(async (tx) => {
      // Get or create user and get question in parallel
      const [user, question] = await Promise.all([
        tx.trivia_users.upsert({
          where: { wallet_address: walletAddress.toLowerCase() },
          update: {},
          create: { 
            wallet_address: walletAddress.toLowerCase(),
            total_points: 0,
            games_played: 0,
            best_streak: 0
          },
          select: {
            id: true,
            total_points: true,
            games_played: true,
            best_streak: true
          }
        }),
        tx.trivia_questions.findUnique({
          where: { id: questionId }
        })
      ]);
      
      if (!question) {
        throw new Error('Question not found');
      }
      
      const isCorrect = answer === question.correct_answer;
      
      // Get current session streak
      const sessionStreak = await tx.trivia_player_responses.findMany({
        where: { 
          game_session_id: sessionId,
          user_id: user.id,
          is_correct: true
        },
        orderBy: { answered_at: 'desc' },
        take: 1
      });

      const currentStreak = sessionStreak.length > 0 ? sessionStreak[0].streak_count : 0;
      const newStreak = isCorrect ? currentStreak + 1 : 0;

      // Calculate score
      const scoreResult = await scoreCalculator.calculateScore({
        timeRemaining: timing.remainingTime,
        isCorrect,
        streakCount: currentStreak
      });
      
      // Create response and update user stats in parallel
      const [response, updatedUser] = await Promise.all([
        // Record response
        tx.trivia_player_responses.create({
          data: {
            game_session_id: sessionId,
            user_id: user.id,
            question_id: questionId,
            answer: answer || '',
            is_correct: isCorrect,
            points_earned: scoreResult.points,
            potential_points: scoreResult.maxPoints,
            streak_count: newStreak,
            time_remaining: timing.remainingTime,
            answered_at: new Date(endTime),
            response_time_ms: new Date(endTime).getTime() - new Date(startTime).getTime()
          }
        }),
        
        // Update user stats
        tx.trivia_users.update({
          where: { id: user.id },
          data: {
            total_points: { increment: scoreResult.points },
            last_played_at: new Date(),
            games_played: isLastQuestion ? { increment: 1 } : undefined,
            best_streak: newStreak > (user.best_streak || 0) ? newStreak : undefined
          },
          select: {
            total_points: true,
            games_played: true,
            best_streak: true
          }
        })
      ]);
      
      // If this is the last question, finalize the session
      if (isLastQuestion && finalStats) {
        // Process end-of-game tasks in parallel
        await Promise.all([
          // Update session status
          tx.trivia_game_sessions.update({
            where: { id: sessionId },
            data: {
              status: 'completed',
              ended_at: new Date()
            }
          }),
          
          // Record final streak if applicable
          finalStats.bestStreak > 0 ?
            tx.trivia_streak_history.create({
              data: {
                user_id: user.id,
                game_session_id: sessionId,
                streak_count: finalStats.bestStreak,
                points_earned: finalStats.finalScore
              }
            }) : Promise.resolve()
        ]);
      }
      
      return {
        user: updatedUser,
        response,
        isCorrect,
        question,
        newStreak,
        score: scoreResult
      };
    });
    
    // Queue achievement check outside the transaction to prevent long-running transactions
    if (isLastQuestion && finalStats) {
      try {
        const responseForAchievement: PlayerResponse = {
          ...result.response,
          game_session_id: sessionId,
          time_remaining: timing.remainingTime
        };
        // This is async but we don't need to await it for the response
        achievementService.queueAchievementCheck(responseForAchievement);
      } catch (error) {
        console.error('Achievement check failed:', error);
      }
    }

    return NextResponse.json({
      success: true,
      score: {
        points: result.score.points,
        currentStreak: result.newStreak,
        bestStreak: result.user.best_streak
      },
      isCorrect: result.isCorrect,
      correctAnswer: result.question.correct_answer
    });

  } catch (error) {
    console.error('Score submission error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user stats' },
      { status: 500 }
    );
  }
}