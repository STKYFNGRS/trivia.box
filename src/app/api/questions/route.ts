import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { ServerGameQuestionService } from '@/services/server/GameQuestionService';
import { RateLimitService } from '@/services/RateLimitService';
import { ActivityLogType } from '@prisma/client';

// Mark as dynamic route to avoid static generation errors
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const questionsPerRound = parseInt(searchParams.get('questionsPerRound') || '5');
    const numberOfRounds = parseInt(searchParams.get('numberOfRounds') || '1');

    const rateLimitService = RateLimitService.getInstance();
    const canFetchQuestions = await rateLimitService.checkRateLimit('question-fetch', ActivityLogType.SESSION);

    if (!canFetchQuestions) {
      return NextResponse.json(
        { error: 'Too many question requests' },
        { 
          status: 429,
          headers: { 'Retry-After': '60' }
        }
      );
    }

    const gameQuestionService = ServerGameQuestionService.getInstance();
    const questions = await gameQuestionService.getQuestionsForGame({
      questionsPerRound,
      numberOfRounds
    });

    return NextResponse.json({
      success: true,
      questions
    });

  } catch (error) {
    console.error('Failed to fetch questions:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch questions',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}