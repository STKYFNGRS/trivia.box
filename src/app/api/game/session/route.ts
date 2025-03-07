import QuestionService from '@/services/QuestionService';
import { QuestionRepetitionManager } from '@/services/QuestionRepetitionManager';
import { prisma } from '@/lib/db/client';
import { trivia_game_status, trivia_category, trivia_difficulty } from '@prisma/client';
import type { Question } from '@/types/question';
import { NextResponse } from 'next/dist/server/web/spec-extension/response';

// Mark as dynamic route to avoid static generation errors
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export async function POST(req: Request) {
  try {
    // Generate a unique identifier for this request
    const timestamp = Date.now();
    const uniqueId = Math.random().toString(36).substring(2, 10);
    
    // Parse the request
    const jsonData = await req.json();
    const { 
      questionCount = 10, 
      category, 
      difficulty = 'mixed', 
      walletAddress 
    } = jsonData;
    
    // Get questions user has recently answered to exclude
    const repetitionManager = QuestionRepetitionManager.getInstance();
    const recentQuestionIds = await repetitionManager.getQuestionsToExclude(walletAddress);
    
    // Get question service
    const questionService = QuestionService.getInstance();

    // Simplified question retrieval
    let finalQuestions: Question[] = [];
    
    if (category === 'random') {
      // For random category selection, get questions from a random selection of categories
      const randomQuestions = await getRandomCategoryQuestions(
        questionService,
        questionCount,
        difficulty,
        recentQuestionIds,
        timestamp
      );
      finalQuestions = randomQuestions;
    } else if (difficulty === 'mixed') {
      // For mixed difficulty, get questions across all difficulty levels
      const mixedQuestions = await getMixedDifficultyQuestions(
        questionService,
        category as trivia_category,
        questionCount,
        recentQuestionIds,
        timestamp
      );
      finalQuestions = mixedQuestions;
    } else {
      // Get questions for specific category and difficulty
      const specificQuestions = await getSingleCategoryQuestions(
        questionService,
        category as trivia_category,
        difficulty as trivia_difficulty,
        questionCount,
        recentQuestionIds,
        timestamp
      );
      finalQuestions = specificQuestions;
    }
    
    // Check if we found enough questions
    if (finalQuestions.length < questionCount) {
      // If not enough questions, get some additional ones without the filters
      const expandedQuestions = await getAdditionalQuestions(
        questionService,
        category as trivia_category,
        difficulty as trivia_difficulty,
        questionCount,
        finalQuestions,
        walletAddress,
        timestamp
      );
      finalQuestions = expandedQuestions;
    }
    
    // Final shuffle for randomness
    finalQuestions = shuffleQuestions(finalQuestions);
    
    // If still not enough questions, use what we have or return an error
    if (finalQuestions.length === 0) {
      return NextResponse.json({
        success: false,
        error: `Could not find any questions matching your criteria.`,
        hasQuestions: false
      }, { status: 400 });
    }

    // Take only what we need
    finalQuestions = finalQuestions.slice(0, questionCount);
    
    // Create a new game session
    try {
      const session = await prisma.trivia_game_sessions.create({
        data: {
          status: trivia_game_status.active,
          question_sequence: JSON.stringify({
            questions: finalQuestions.map((q: Question) => q.id),
            metadata: {
              timestamp,
              uniqueId,
              generatedAt: new Date().toISOString()
            }
          }),
          player_count: 1,
          current_index: 0
        }
      });

      console.log(`Successfully created game session ${session.id} with ${finalQuestions.length} questions`);

      return NextResponse.json({
        success: true,
        sessionId: session.id,
        hasQuestions: true,
        questions: finalQuestions
      }, {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
    } catch (dbError) {
      console.error('Failed to create session in database:', dbError);
      return NextResponse.json({
        success: false,
        error: 'Database error: Failed to create game session',
        errorDetails: dbError instanceof Error ? dbError.message : String(dbError),
        hasQuestions: false
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Game session creation error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create game session',
      hasQuestions: false
    }, { status: 500 });
  }
}

// Helper for getting questions from random categories
async function getRandomCategoryQuestions(
  questionService: QuestionService,
  questionCount: number,
  difficulty: string,
  excludeIds: number[],
  timestamp: number
): Promise<Question[]> {
  const allCategories = Object.values(trivia_category);
  const shuffledCategories = allCategories.sort(() => Math.random() - 0.5);
  
  // Select a few random categories rather than all
  const categoriesToUse = shuffledCategories.slice(0, 3);
  const questionsPerCategory = Math.ceil(questionCount / categoriesToUse.length) + 5; // Add buffer
  
  const allQuestions: Question[] = [];
  
  if (difficulty === 'mixed') {
    // Use one difficulty level for simplicity when category is random
    const difficultyLevel = ['easy', 'medium', 'hard'][Math.floor(Math.random() * 3)] as trivia_difficulty;
    
    for (const cat of categoriesToUse) {
      const result = await questionService.getQuestionsByCategory(
        cat,
        difficultyLevel,
        questionsPerCategory
      );
      
      if (result.success && result.data && result.data.length > 0) {
        allQuestions.push(...(result.data as Question[]));
      }
    }
  } else {
    // Use specified difficulty for all categories
    const difficultyLevel = difficulty as trivia_difficulty;
    
    for (const cat of categoriesToUse) {
      const result = await questionService.getQuestionsByCategory(
        cat,
        difficultyLevel,
        questionsPerCategory
      );
      
      if (result.success && result.data && result.data.length > 0) {
        allQuestions.push(...(result.data as Question[]));
      }
    }
  }
  
  // Filter out excluded questions
  const excludeSet = new Set(excludeIds);
  const filteredQuestions = allQuestions.filter(q => !excludeSet.has(q.id));
  
  return shuffleQuestions(filteredQuestions);
}

// Helper for getting questions with mixed difficulty
async function getMixedDifficultyQuestions(
  questionService: QuestionService,
  category: trivia_category,
  questionCount: number,
  excludeIds: number[],
  timestamp: number
): Promise<Question[]> {
  const difficulties = Object.values(trivia_difficulty);
  const questionsPerDifficulty = Math.ceil(questionCount / difficulties.length) + 3; // Add buffer
  
  const allQuestions: Question[] = [];
  
  for (const diff of difficulties) {
    const result = await questionService.getQuestionsByCategory(
      category,
      diff,
      questionsPerDifficulty
    );
    
    if (result.success && result.data && result.data.length > 0) {
      allQuestions.push(...(result.data as Question[]));
    }
  }
  
  // Filter out excluded questions
  const excludeSet = new Set(excludeIds);
  const filteredQuestions = allQuestions.filter(q => !excludeSet.has(q.id));
  
  return shuffleQuestions(filteredQuestions);
}

// Helper for getting questions from a single category and difficulty
async function getSingleCategoryQuestions(
  questionService: QuestionService,
  category: trivia_category,
  difficulty: trivia_difficulty,
  questionCount: number,
  excludeIds: number[],
  timestamp: number
): Promise<Question[]> {
  // Add buffer to account for excluded questions
  const questionsToFetch = questionCount + Math.min(excludeIds.length, 20);
  
  const result = await questionService.getQuestionsByCategory(
    category,
    difficulty,
    questionsToFetch
  );
  
  if (!result.success || !result.data) {
    return [];
  }
  
  // Filter out excluded questions
  const excludeSet = new Set(excludeIds);
  const filteredQuestions = result.data.filter((q: Question) => !excludeSet.has(q.id));
  
  return shuffleQuestions(filteredQuestions);
}

// Helper for getting additional questions when needed
async function getAdditionalQuestions(
  questionService: QuestionService,
  category: trivia_category,
  difficulty: trivia_difficulty,
  questionCount: number,
  currentQuestions: Question[],
  walletAddress: string,
  timestamp: number
): Promise<Question[]> {
  const neededCount = questionCount - currentQuestions.length;
  
  if (neededCount <= 0) {
    return currentQuestions;
  }
  
  let additionalQuestions: Question[] = [];
  
  // Try to get questions the user previously answered incorrectly
  if (walletAddress) {
    const user = await prisma.trivia_users.findFirst({
      where: {
        wallet_address: {
          contains: walletAddress.toLowerCase(),
          mode: 'insensitive'
        }
      },
      select: { id: true }
    });
    
    if (user) {
      const incorrectlyAnsweredQuestions = await prisma.trivia_player_responses.findMany({
        where: {
          user_id: user.id,
          is_correct: false
        },
        select: {
          question_id: true
        },
        take: neededCount * 2
      });
      
      if (incorrectlyAnsweredQuestions.length > 0) {
        const incorrectIds = incorrectlyAnsweredQuestions.map(q => q.question_id);
        const result = await questionService.getQuestionsByIds(incorrectIds);
        
        if (result.success && result.data) {
          // Only include questions not already in current set
          const currentIds = new Set(currentQuestions.map(q => q.id));
          additionalQuestions = result.data.filter(q => !currentIds.has(q.id));
        }
      }
    }
  }
  
  // If still not enough, try getting any questions
  if (additionalQuestions.length < neededCount) {
    const stillNeeded = neededCount - additionalQuestions.length;
    
    // Try with any category if original was specific
    if (category !== 'random' as any) {
      const categories = Object.values(trivia_category);
      const randomCategory = categories[Math.floor(Math.random() * categories.length)];
      
      const difficultyLevel = difficulty === 'mixed' as any ? 
        ['easy', 'medium', 'hard'][Math.floor(Math.random() * 3)] as trivia_difficulty :
        difficulty;
        
      const result = await questionService.getQuestionsByCategory(
        randomCategory,
        difficultyLevel,
        stillNeeded
      );
      
      if (result.success && result.data) {
        const currentIds = new Set([
          ...currentQuestions.map(q => q.id),
          ...additionalQuestions.map(q => q.id)
        ]);
        
        additionalQuestions = [
          ...additionalQuestions,
          ...result.data.filter(q => !currentIds.has(q.id))
        ];
      }
    }
  }
  
  // Combine and shuffle all questions
  return shuffleQuestions([...currentQuestions, ...additionalQuestions]);
}

// Helper to shuffle questions
function shuffleQuestions(questions: Question[]): Question[] {
  return [...questions].sort(() => Math.random() - 0.5);
}