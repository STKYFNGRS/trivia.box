import type { Question, QuestionGenerationParams, APIResponse } from '../types';
import type { ValidationFeedback } from '../types/api';
import { prisma } from '../lib/db/client';
import ClaudeService from './ClaudeService';
import { trivia_difficulty, trivia_category, trivia_question_status, Prisma } from '@prisma/client';
import { validateGenerationParams } from '../utils/validation/questions';

interface QuestionData {
  id: number;
  content: string;
  category: trivia_category;
  difficulty: trivia_difficulty;
  correct_answer: string;
  incorrect_answers: string[];
  validation_status: trivia_question_status;
  validation_feedback: Prisma.JsonValue;
  ai_generated: boolean;
  created_at: Date;
  last_used: Date | null;
  usage_count: number;
}

class QuestionService {
  private static instance: QuestionService | null = null
  private claudeService: ClaudeService

  private constructor() {
    this.claudeService = ClaudeService.getInstance()
  }

  static getInstance(): QuestionService {
    if (!this.instance) {
      this.instance = new QuestionService()
    }
    return this.instance
  }

  private convertToQuestion(data: QuestionData): Question {
    const parsedFeedback = data.validation_feedback ? 
      JSON.parse(data.validation_feedback as string) as ValidationFeedback[] : 
      undefined;

    return {
      id: data.id,
      content: data.content,
      category: data.category,
      difficulty: data.difficulty,
      correct_answer: data.correct_answer,
      incorrect_answers: data.incorrect_answers,
      ai_generated: data.ai_generated,
      validation_status: data.validation_status,
      validation_feedback: parsedFeedback,
      created_at: data.created_at,
      last_used: data.last_used || undefined,
      usage_count: data.usage_count
    };
  }

  async generateAndValidateQuestion(params: QuestionGenerationParams): Promise<APIResponse<Question>> {
    try {
      // Validate generation params first
      const paramValidation = validateGenerationParams(params.difficulty, params.category);
      if (paramValidation.length > 0) {
        return {
          success: false,
          error: {
            code: 'INVALID_PARAMS',
            message: 'Invalid generation parameters',
            details: { feedback: paramValidation }
          }
        };
      }

      // Check for existing similar questions first
      const existingQuestions = await prisma.trivia_questions.findMany({
        where: {
          category: params.category,
          difficulty: params.difficulty
        }
      });

      const generatedQuestion = await this.claudeService.generateQuestion(params);

      // Check for duplicates or similar questions
      const isDuplicate = existingQuestions.some(q => 
        this.isSimilarQuestion(this.convertToQuestion(q as QuestionData), generatedQuestion)
      );

      if (isDuplicate) {
        return {
          success: false,
          error: {
            code: 'DUPLICATE_QUESTION',
            message: 'A similar question already exists'
          }
        };
      }

      // Validate with Claude
      let validation;
      try {
        validation = await this.claudeService.validateQuestion(generatedQuestion);
      } catch (validationError) {
        console.error('Validation failed:', validationError);
        return {
          success: false,
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Failed to validate question'
          }
        };
      }

      // Only store approved questions
      if (validation.status !== 'approved') {
        return {
          success: false,
          error: {
            code: 'VALIDATION_NOT_APPROVED',
            message: 'Question needs review or was rejected',
            details: { feedbackItems: validation.feedback } as Record<string, unknown>
          }
        };
      }

      const stored = await prisma.trivia_questions.create({
        data: {
          content: generatedQuestion.content,
          difficulty: params.difficulty,
          category: params.category,
          correct_answer: generatedQuestion.correct_answer,
          incorrect_answers: generatedQuestion.incorrect_answers,
          ai_generated: true,
          validation_status: validation.status as trivia_question_status,
          validation_feedback: JSON.stringify(validation.feedback)
        }
      });

      return {
        success: true,
        data: this.convertToQuestion(stored as QuestionData)
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'GENERATION_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  private isSimilarQuestion(q1: Question, q2: Question): boolean {
    // Check exact matches
    if (q1.content.toLowerCase() === q2.content.toLowerCase() ||
        q1.correct_answer.toLowerCase() === q2.correct_answer.toLowerCase()) {
      return true;
    }

    // Check for high similarity using basic word matching
    const words1 = q1.content.toLowerCase().split(' ');
    const words2 = q2.content.toLowerCase().split(' ');
    const commonWords = words1.filter((w: string) => words2.includes(w));
    const similarity = commonWords.length / Math.max(words1.length, words2.length);

    return similarity > 0.8; // 80% similarity threshold
  }

  async getQuestionById(id: number): Promise<APIResponse<Question>> {
    try {
      const question = await prisma.trivia_questions.findUnique({
        where: { id }
      })

      if (!question) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Question not found'
          }
        }
      }

      return {
        success: true,
        data: this.convertToQuestion(question as QuestionData)
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'FETCH_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  }

  async getQuestionsByIds(ids: number[]): Promise<APIResponse<Question[]>> {
    try {
      const questions = await prisma.trivia_questions.findMany({
        where: { id: { in: ids } }
      });

      return {
        success: true,
        data: questions.map(q => this.convertToQuestion(q as QuestionData))
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'FETCH_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  async updateQuestion(
    id: number, 
    updates: Partial<Omit<Question, 'id' | 'validation_feedback'>>
  ): Promise<APIResponse<Question>> {
    try {
      const updated = await prisma.trivia_questions.update({
        where: { id },
        data: updates
      })

      return {
        success: true,
        data: this.convertToQuestion(updated as QuestionData)
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'UPDATE_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  }

  async getQuestionsByCategory(
    category: trivia_category,
    difficulty?: trivia_difficulty,
    limit = 10,
    cacheBuster?: number // Add optional cache buster parameter
  ): Promise<APIResponse<Question[]>> {
    try {
      // First verify database connection
      try {
        await prisma.$queryRaw`SELECT 1`;
        console.log('QuestionService: Database connection verified');
      } catch (dbError) {
        console.error('QuestionService: Database connection failed:', dbError);
        throw new Error(`Database connection error: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
      }
      const baseQuery = {
        validation_status: trivia_question_status.approved,
      };

      // Generate a truly random number for each query execution to bust any caching
      const randomSeed = (cacheBuster || Date.now()).toString() + Math.random().toString();
      console.log(`Getting questions for ${category}/${difficulty || 'any'} with random seed: ${randomSeed.substring(0, 8)}`);

      // First, get all eligible questions from the category without using raw queries
      let initialQuestions = await prisma.trivia_questions.findMany({
        where: {
          validation_status: trivia_question_status.approved,
          category, // Always respect the requested category
          ...(difficulty ? { difficulty } : {})
        },
        // Add a random orderBy that changes every query by using the cache buster
        orderBy: [
          { id: (cacheBuster || Date.now()) % 2 === 0 ? 'asc' : 'desc' }
        ]
      });

      // Apply JavaScript-level randomization to ensure shuffling
      initialQuestions = this.fisherYatesShuffle(initialQuestions, cacheBuster);
      
      console.log(`Retrieved ${initialQuestions.length} ${category} questions with difficulty ${difficulty || 'any'} for randomization`);

      // If we got at least half of the requested questions or at least 5 questions, 
      // use only category-specific questions rather than diluting with other categories
      let questions = [...initialQuestions];
      
      // First try to get more questions from same category but different difficulties
      if (questions.length < limit && difficulty) {
        console.log(`Got ${questions.length}/${limit} ${category} questions with difficulty ${difficulty}, trying other difficulties`);

        // Get questions from the same category without difficulty restriction
        const excludeIds = questions.map(q => q.id);
        
        const additionalCategoryQuestions = await prisma.trivia_questions.findMany({
          where: {
            validation_status: trivia_question_status.approved,
            category, // Keep the same category
            id: { notIn: excludeIds } // Don't repeat questions
          },
          orderBy: [
            { id: (cacheBuster || Date.now()) % 3 === 0 ? 'desc' : 'asc' }
          ]
        });

        // Apply randomization with cache buster
        const shuffledAdditional = this.fisherYatesShuffle(additionalCategoryQuestions, cacheBuster ? cacheBuster + 1 : undefined);
        
        console.log(`Retrieved ${shuffledAdditional.length} additional ${category} questions with mixed difficulty levels`);
        questions = [...questions, ...shuffledAdditional];
      }

      // Only if we have fewer than 5 questions or less than half the requested number, 
      // then get some from other categories as a last resort
      if (questions.length < Math.min(limit / 2, 5)) {
        console.log(`Only found ${questions.length} ${category} questions, getting some from other categories to meet minimum`);

        const excludeIds = questions.map(q => q.id);
        
        // Get questions from other categories as a last resort, but limit the number
        const otherCategoryQuestions = await prisma.trivia_questions.findMany({
          where: {
            validation_status: trivia_question_status.approved,
            category: { not: category }, // Explicitly different category
            id: { notIn: excludeIds },
            // Match the difficulty if specified
            ...(difficulty ? { difficulty } : {})
          },
          orderBy: [
            { id: (cacheBuster || Date.now()) % 4 === 0 ? 'desc' : 'asc' }
          ],
          // Only get what's absolutely needed
          take: limit - questions.length
        });

        // Apply randomization with cache buster
        const shuffledOtherCategories = this.fisherYatesShuffle(otherCategoryQuestions, cacheBuster ? cacheBuster + 2 : undefined);
        
        console.log(`Adding ${shuffledOtherCategories.length} questions from other categories to supplement ${questions.length} ${category} questions`);
        questions = [...questions, ...shuffledOtherCategories];
      }

      // STEP 1: Separate questions by category
      const categoryQuestions = questions.filter(q => q.category === category);
      const otherQuestions = questions.filter(q => q.category !== category);
      
      // STEP 2: Prioritize questions from the requested category
      let selectedQuestions: any[] = [];
      
      // Shuffle category questions for randomness
      const shuffledCategoryQuestions = this.fisherYatesShuffle(categoryQuestions, cacheBuster);
      
      // Take as many as possible from the requested category
      selectedQuestions = shuffledCategoryQuestions.slice(0, Math.min(limit, shuffledCategoryQuestions.length));
      
      // Only if we still don't have enough, use some from other categories
      if (selectedQuestions.length < limit && otherQuestions.length > 0) {
        const shuffledOtherQuestions = this.fisherYatesShuffle(otherQuestions, cacheBuster ? cacheBuster + 50 : undefined);
        const remainingNeeded = limit - selectedQuestions.length;
        
        // Log a clear warning that we're mixing categories
        console.log(`WARNING: Using ${Math.min(remainingNeeded, shuffledOtherQuestions.length)} questions from other categories to complete set of ${limit}`);
        
        // Add just enough to reach the limit
        selectedQuestions = [
          ...selectedQuestions,
          ...shuffledOtherQuestions.slice(0, Math.min(remainingNeeded, shuffledOtherQuestions.length))
        ];
      }
      
      // Final shuffle to mix category and non-category questions
      selectedQuestions = this.fisherYatesShuffle(selectedQuestions, cacheBuster ? cacheBuster + 100 : undefined);
      
      // Log detailed category breakdown for debugging
      const categoryBreakdown = selectedQuestions.reduce((acc: Record<string, number>, q) => {
        const cat = q.category as string;
        acc[cat] = (acc[cat] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      console.log(`Final selection: ${selectedQuestions.length} questions - Breakdown: ${JSON.stringify(categoryBreakdown)}. Requested: ${category}`);

      // Update usage count for selected questions
      await Promise.all(
        selectedQuestions.map(q => 
          prisma.trivia_questions.update({
            where: { id: q.id },
            data: {
              usage_count: { increment: 1 },
              last_used: new Date()
            }
          })
        )
      );
      
      // Clear any question cache that might exist in the global space
      if (typeof global !== 'undefined') {
        (global as any).questionCache = undefined;
      }

      return {
        success: true,
        data: selectedQuestions.map(q => this.convertToQuestion(q as any))
      };
    } catch (error) {
      console.error('Error fetching questions:', error);
      return {
        success: false,
        error: {
          code: 'FETCH_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  // Improved Fisher-Yates shuffle algorithm for better randomization
  private fisherYatesShuffle<T>(array: T[], seed?: number): T[] {
    const shuffled = [...array];
    // Use a seed that changes with each call for true randomization
    const effectiveSeed = seed || Date.now() + Math.random();
    
    for (let i = shuffled.length - 1; i > 0; i--) {
      // Add the seed to make each shuffle unique
      const j = Math.floor((Math.random() * (i + 1)) + (effectiveSeed % 13) / 13);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}

export default QuestionService;