import QuestionService from '@/services/QuestionService';
import { QuestionRepetitionManager } from '@/services/QuestionRepetitionManager';
import { prisma } from '@/lib/db/client';
import { trivia_game_status, trivia_category, trivia_difficulty } from '@prisma/client';
import type { Question } from '@/types/question';
import { NextResponse } from 'next/dist/server/web/spec-extension/response';

// Mark as dynamic route to avoid static generation errors - this prevents route from being cached
export const dynamic = 'force-dynamic';
// Disable any other caching mechanisms
export const fetchCache = 'force-no-store';
export const revalidate = 0;

// Anti-cache timestamp to ensure fresh requests
const CACHE_BUSTER = Date.now();

export async function POST(req: Request) {
  try {
    // Generate a unique timestamp to prevent caching
    const timestamp = Date.now();
    const uniqueId = Math.random().toString(36).substring(2, 15);
    console.log(`Game session request [${timestamp}-${uniqueId}]`);
    
    // Clone and parse the request to avoid any reuse of cached body
    const clonedReq = req.clone();
    const jsonData = await clonedReq.json();
    const { 
      questionCount = 10, 
      category, 
      difficulty = 'mixed', 
      excludeQuestions = [], 
      walletAddress,
      forceRefresh = false, // Add force refresh flag
    } = jsonData;
    
    // If forceRefresh is true, add something to bust any caches
    const cacheBuster = forceRefresh ? `-force-${uniqueId}` : '';
    
    
    console.log(`Creating new game session with ${questionCount} questions in category: ${category}, difficulty: ${difficulty}${walletAddress ? ` for wallet: ${walletAddress}` : ''}`);
    console.log(`Cache buster: ${timestamp}`);
    
    // Get questions user has recently answered to exclude them
    const repetitionManager = QuestionRepetitionManager.getInstance();
    const recentQuestionIds = await repetitionManager.getQuestionsToExclude(walletAddress);
    
    console.log(`Found ${recentQuestionIds.length} recently answered questions to exclude`);
    
    // Add timestamp to excluded questions to ensure unique selection each time
    const allExcludedQuestions = [
      ...excludeQuestions.map(q => typeof q === 'string' ? parseInt(q) : q), 
      ...recentQuestionIds,
      // Add a dummy exclusion based on timestamp to break any caching
      (timestamp % 1000000)
    ].filter(id => typeof id === 'number');
    
    // If category is 'random', we'll get questions from all categories
    let selectedCategory = category;
    let selectFromAllCategories = false;
    
    if (category === 'random') {
      selectFromAllCategories = true;
      // We still need to set a valid category for the service call, but we'll handle mixing categories below
      const categories = Object.values(trivia_category);
      // Use timestamp to select a different starting category each time
      const categoryIndex = timestamp % categories.length;
      selectedCategory = categories[categoryIndex];
      console.log(`Random selection: Will select questions from all categories (starting with ${selectedCategory})`);
    }

    // If difficulty is 'mixed', we'll get questions from all difficulties
    let selectedDifficulty = difficulty === 'mixed' ? trivia_difficulty.medium : difficulty as trivia_difficulty;
    let mixedDifficulties = difficulty === 'mixed';
    
    if (mixedDifficulties) {
      console.log('Mixed difficulty: Will select questions from all difficulty levels');
    }

    // Get singleton instance of QuestionService with cache busting
    const questionService = QuestionService.getInstance();

    // Calculate how many extra questions we need to account for filtering
    const extraQuestionsBuffer = Math.max(allExcludedQuestions.length, 10); // At least 10 extra questions
    const totalQuestionsToFetch = questionCount + extraQuestionsBuffer;

    // Get questions based on category with extra questions to account for filtering
    let questionsResult;
    
    if (selectFromAllCategories) {
      // For random selection, get questions from all categories
      console.log(`Getting randomized questions from all categories [cache: ${timestamp}]`);
      
      const allCategories = Object.values(trivia_category);
      // Randomize category order based on timestamp
      const shuffledCategories = allCategories.sort(() => (timestamp % 2 === 0) ? 0.5 - Math.random() : Math.random() - 0.5);
      const questionsPerCategory = Math.ceil(totalQuestionsToFetch / shuffledCategories.length);
      
      // Get questions from each category
      const allQuestions: Question[] = [];
      
      if (mixedDifficulties) {
        // Get questions from all difficulties across all categories
        const difficultyLevels = Object.values(trivia_difficulty);
        // Randomize difficulty order based on timestamp
        const shuffledDifficulties = difficultyLevels.sort(() => (timestamp % 3 === 0) ? 0.5 - Math.random() : Math.random() - 0.5);
        
        for (const cat of shuffledCategories) {
          for (const diff of shuffledDifficulties) {
            // Vary the number of questions per category/difficulty combination based on timestamp
            // This ensures different distribution each time
            const variableCount = Math.ceil((questionsPerCategory / difficultyLevels.length) * (0.8 + (timestamp % 5) / 10));
            
            const categoryResult = await questionService.getQuestionsByCategory(
              cat,
              diff,
              variableCount
            );
            
            if (categoryResult.success && categoryResult.data && categoryResult.data.length > 0) {
              allQuestions.push(...(categoryResult.data as Question[]));
            }
          }
        }
      } else {
        // Get questions from specific difficulty across all categories
        for (const cat of shuffledCategories) {
          // Vary the number of questions per category based on timestamp
          const variableCount = Math.ceil(questionsPerCategory * (0.8 + (timestamp % 5) / 10));
          
          const categoryResult = await questionService.getQuestionsByCategory(
            cat,
            selectedDifficulty,
            variableCount
          );
          
          if (categoryResult.success && categoryResult.data && categoryResult.data.length > 0) {
            allQuestions.push(...(categoryResult.data as Question[]));
          }
        }
      }
      
      // Shuffle all questions to ensure randomness
      // Use the timestamp to influence the shuffle for varied results each time
      const shuffledQuestions = allQuestions
        .sort(() => ((timestamp % 2) === 0) ? 0.5 - Math.random() : Math.random() - 0.5)
        .slice(0, totalQuestionsToFetch);
      
      questionsResult = {
        success: shuffledQuestions.length > 0,
        data: shuffledQuestions
      };
      
      console.log(`Retrieved ${shuffledQuestions.length} mixed questions for selection [cache: ${timestamp}]`);
    } else if (mixedDifficulties) {
      // Get questions from all difficulties for the selected category
      console.log(`Getting questions from all difficulties for category: ${selectedCategory} [cache: ${timestamp}]`);
      
      const difficultyLevels = Object.values(trivia_difficulty);
      // Randomize difficulty order based on timestamp
      const shuffledDifficulties = difficultyLevels.sort(() => (timestamp % 3 === 0) ? 0.5 - Math.random() : Math.random() - 0.5);
      const questionsPerDifficulty = Math.ceil(totalQuestionsToFetch / shuffledDifficulties.length);
      
      const allQuestions: Question[] = [];
      
      for (const diff of shuffledDifficulties) {
        // Vary the number of questions per difficulty based on timestamp
        const variableCount = Math.ceil(questionsPerDifficulty * (0.8 + (timestamp % 5) / 10));
        
        const difficultyResult = await questionService.getQuestionsByCategory(
          selectedCategory,
          diff,
          variableCount
        );
        
        if (difficultyResult.success && difficultyResult.data && difficultyResult.data.length > 0) {
          allQuestions.push(...(difficultyResult.data as Question[]));
        }
      }
      
      // Shuffle all questions using timestamp-based randomization
      const shuffledQuestions = allQuestions
        .sort(() => ((timestamp % 2) === 0) ? 0.5 - Math.random() : Math.random() - 0.5)
        .slice(0, totalQuestionsToFetch);
      
      questionsResult = {
        success: shuffledQuestions.length > 0,
        data: shuffledQuestions
      };
      
      console.log(`Retrieved ${shuffledQuestions.length} mixed difficulty questions for category: ${selectedCategory} [cache: ${timestamp}]`);
    } else {
      // Get questions from a specific category and difficulty
      questionsResult = await questionService.getQuestionsByCategory(
        selectedCategory,
        selectedDifficulty,
        totalQuestionsToFetch, // Get extra questions to account for filtering
        timestamp // Pass timestamp to ensure cache busting at the service level
      );
      
      console.log(`Retrieved ${questionsResult.data?.length || 0} questions for category: ${selectedCategory}, difficulty: ${selectedDifficulty} [cache: ${timestamp}]`);
    }

    if (!questionsResult.success || !questionsResult.data || questionsResult.data.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch questions',
        hasQuestions: false
      }, { 
        status: 400,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
          'X-Cache-Buster': `${timestamp}`
        }
      });
    }

    // Filter out excluded questions if any
    let finalQuestions = questionsResult.data;
    if (allExcludedQuestions.length > 0) {
      const beforeCount = finalQuestions.length;
      
      // Ensure we're strictly filtering out all excluded questions
      const excludedSet = new Set(allExcludedQuestions);
      finalQuestions = finalQuestions.filter(q => !excludedSet.has(q.id));
      
      const filteredCount = beforeCount - finalQuestions.length;
      console.log(`Filtered out ${filteredCount} recently answered questions [cache: ${timestamp}]`);
      
      // Double-check that all excluded questions are actually filtered out
      const remainingExcluded = finalQuestions.filter(q => excludedSet.has(q.id));
      if (remainingExcluded.length > 0) {
        console.warn(`WARNING: ${remainingExcluded.length} excluded questions still remain in the set`);
      }
    }

    // Ensure questions are well-shuffled with multi-stage shuffling
    finalQuestions = multiLayerShuffle(finalQuestions, timestamp);

    // Take exactly the number of questions requested
    finalQuestions = finalQuestions.slice(0, questionCount);

    // Verify we have enough questions and they match the requested category
    if (finalQuestions.length !== questionCount) {
      console.warn(`Warning: Could not find enough fresh questions. Requested ${questionCount} but only found ${finalQuestions.length} [cache: ${timestamp}]`);
      
      // Log category breakdown for debugging
      const categoryBreakdown = finalQuestions.reduce((acc: Record<string, number>, q) => {
        acc[q.category] = (acc[q.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      console.log(`Category breakdown: ${JSON.stringify(categoryBreakdown)}. Requested: ${category}`);
      
      
      // If we don't have enough questions, prioritize questions the user answered incorrectly
      if (finalQuestions.length < questionCount && walletAddress) {
        console.log("Fetching additional questions that were previously answered incorrectly");
        
        try {
          // Find the user
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
            // Get previously incorrectly answered questions
            const incorrectlyAnsweredQuestions = await prisma.trivia_player_responses.findMany({
              where: {
                user_id: user.id,
                is_correct: false
              },
              orderBy: {
                // Use different ordering based on timestamp to get different questions each time
                answered_at: timestamp % 2 === 0 ? 'desc' : 'asc'
              },
              select: {
                question_id: true
              },
              take: questionCount * 2 // Get more than needed to have options
            });
            
            // Get the actual questions
            if (incorrectlyAnsweredQuestions.length > 0) {
              const incorrectQuestionIds = incorrectlyAnsweredQuestions.map(q => q.question_id);
              console.log(`Found ${incorrectQuestionIds.length} incorrectly answered questions [cache: ${timestamp}]`);
              
              const incorrectQuestionsResult = await questionService.getQuestionsByIds(incorrectQuestionIds);
              
              if (incorrectQuestionsResult.success && incorrectQuestionsResult.data) {
                // Filter out questions already included
                const incorrectQuestions = (incorrectQuestionsResult.data as Question[])
                  .filter(q => !finalQuestions.some(fq => fq.id === q.id));
                
                // Add incorrectly answered questions first until we meet the quota
                const neededCount = questionCount - finalQuestions.length;
                
                // Shuffle based on timestamp for more variety
                const shuffledIncorrectQuestions = incorrectQuestions.sort(() => 
                  ((timestamp % 3) === 0) ? 0.5 - Math.random() : Math.random() - 0.5
                );
                
                const selectedIncorrect = shuffledIncorrectQuestions.slice(0, neededCount);
                
                finalQuestions = [...finalQuestions, ...selectedIncorrect];
                
                console.log(`Added ${selectedIncorrect.length} previously incorrectly answered questions [cache: ${timestamp}]`);
              }
            }
          }
        } catch (error) {
          console.error("Error fetching incorrectly answered questions:", error);
        }
      }
      
      // If we still need more questions, get random ones without filtering
      if (finalQuestions.length < questionCount) {
        console.log(`Fetching additional questions without exclusion filtering [cache: ${timestamp}]`);
        
        // Get more questions without the exclusion filter
        const additionalQuestionsResult = await questionService.getQuestionsByCategory(
          selectedCategory,
          selectedDifficulty,
          questionCount - finalQuestions.length,
          timestamp + 1 // Use different timestamp to ensure different questions
        );
        
        if (additionalQuestionsResult.success && additionalQuestionsResult.data && additionalQuestionsResult.data.length > 0) {
          // Add the additional questions, avoiding duplicates
          finalQuestions = [
            ...finalQuestions,
            ...(additionalQuestionsResult.data as Question[]).filter(q => !finalQuestions.some(fq => fq.id === q.id))
          ];
          
          // Take exactly the number of questions requested
          finalQuestions = finalQuestions.slice(0, questionCount);
          console.log(`Added ${additionalQuestionsResult.data.length} additional random questions [cache: ${timestamp}]`);
        }
      }
      
      // If we still don't have enough, we'll use whatever we have
      if (finalQuestions.length < questionCount) {
        console.log(`We have ${finalQuestions.length} out of the ${questionCount} requested questions - using what we have`);
        // Take whatever we've got
        if (finalQuestions.length === 0) {
          return NextResponse.json({
            success: false,
            error: `Could not find any questions matching your criteria. Try a different category or difficulty.`,
            hasQuestions: false
          }, { 
            status: 400,
            headers: {
              'Cache-Control': 'no-store, max-age=0',
              'Pragma': 'no-cache',
              'Expires': '0',
              'X-Cache-Buster': `${timestamp}`
            }
          });
        }

        // Log what categories we're returning
        const categoryBreakdown = finalQuestions.reduce((acc: Record<string, number>, q) => {
          const cat = q.category as string;
          acc[cat] = (acc[cat] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        console.log(`Using ${finalQuestions.length} questions with distribution: ${JSON.stringify(categoryBreakdown)}`);
      }
    }

    // Final shuffle to ensure maximum randomness
    finalQuestions = multiLayerShuffle(finalQuestions, timestamp + 2);
    
    // Create a new game session with stringified question sequence
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
        // Note: started_at is automatically set to now() by Prisma
      }
    });

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      hasQuestions: true,
      questions: finalQuestions,
      _cacheBuster: timestamp // Add cache buster to the response
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Cache-Buster': `${timestamp}`
      }
    });
  } catch (error) {
    console.error('Game session creation error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create game session',
      hasQuestions: false,
      _cacheBuster: Date.now() // Add cache buster to error responses too
    }, { 
      status: 500,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  }
}

// Multi-layer shuffling function for maximum randomness
function multiLayerShuffle<T>(array: T[], seed: number = Date.now()): T[] {
  // Create a copy to avoid modifying the original
  let result = [...array];
  
  // First shuffle - basic Fisher-Yates
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  
  // Second shuffle - influenced by seed
  result = result.sort(() => (seed % 2 === 0 ? 0.5 : -0.5) + Math.random());
  
  // Third shuffle - another Fisher-Yates with different pattern
  for (let i = 0; i < result.length - 1; i++) {
    const j = Math.floor(Math.random() * (result.length - i)) + i;
    [result[i], result[j]] = [result[j], result[i]];
  }
  
  return result;
}