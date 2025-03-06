import { prisma } from '@/lib/db/client';
import { CACHE_DURATIONS } from '@/lib/constants';
import { trivia_category, trivia_difficulty } from '@prisma/client';

// Mark this route as dynamic
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { unstable_cache } from 'next/cache';
import { RateLimitService } from '@/services/RateLimitService';
import { ActivityLogType } from '@/types/logging';

interface ErrorWithMessage {
  message: string;
}

function isErrorWithMessage(error: unknown): error is ErrorWithMessage {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as Record<string, unknown>).message === 'string'
  );
}

const getTestQuestions = unstable_cache(
  async () => {
    const rateLimitService = RateLimitService.getInstance();
    const canFetch = await rateLimitService.checkRateLimit('test-questions', ActivityLogType.SESSION);
    
    if (!canFetch) {
      throw new Error('Rate limit exceeded for question fetching');
    }

    const questions = await prisma.trivia_questions.findMany({
      where: {
        category: trivia_category.technology,
        difficulty: trivia_difficulty.medium,
        validation_status: 'approved',
        last_used: {
          lt: new Date(Date.now() - 3600000) // 1 hour cooldown
        }
      },
      orderBy: [
        { usage_count: 'asc' },
        { created_at: 'desc' }
      ],
      take: 10,
      select: {
        id: true,
        content: true,
        category: true,
        difficulty: true,
        correct_answer: true,
        incorrect_answers: true,
        validation_feedback: true
      }
    });

    if (!questions || questions.length < 10) {
      await rateLimitService.logAttempt(ActivityLogType.SESSION, 'test-questions', {
        type: 'rate_limit_exceeded',
        timestamp: new Date().toISOString(),
        error: 'Not enough questions available',
        count: questions?.length ?? 0
      });
      throw new Error('Not enough questions available');
    }

    await rateLimitService.logAttempt(ActivityLogType.SESSION, 'test-questions', {
      type: 'session_created',
      timestamp: new Date().toISOString(),
      count: questions.length
    });

    return questions.map(q => ({
      ...q,
      validation_feedback: q.validation_feedback ? JSON.parse(q.validation_feedback as string) : undefined
    }));
  },
  ['test-questions'],
  { revalidate: 60 } // Cache for 1 minute
);

export async function GET() {
    console.log('Questions API - Fetching test questions');
  
  // For better error tracking
  let fetchStartTime = Date.now();
  
  try {
    const questions = await getTestQuestions();

    const fetchDuration = Date.now() - fetchStartTime;
    console.log(`Questions API - Successfully retrieved ${questions.length} questions in ${fetchDuration}ms`);
    return NextResponse.json({
      success: true,
      questions
    }, {
      headers: {
        'Cache-Control': 'private, max-age=60, stale-while-revalidate=30',
        'X-Questions-Count': questions.length.toString()
      }
    });

  } catch (error) {
    console.error('Questions API - Error fetching test questions:', error);
    const statusCode = isErrorWithMessage(error) && 
      error.message === 'Rate limit exceeded for question fetching' ? 429 : 500;
    
    return NextResponse.json(
      { 
        success: false, 
        error: isErrorWithMessage(error) ? error.message : 'Failed to fetch questions'
      },
      { 
        status: statusCode,
        headers: statusCode === 429 ? { 'Retry-After': '60' } : undefined
      }
    );
  }
}