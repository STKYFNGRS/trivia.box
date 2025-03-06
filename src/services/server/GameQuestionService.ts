import { prisma } from '@/lib/db/client';
import type { Question, Difficulty, Category } from '@/types/question';
import type { trivia_question_status, Prisma } from '@prisma/client';

interface RawQuestion {
  id: number;
  content: string;
  difficulty: Difficulty;
  category: Category;
  correct_answer: string;
  incorrect_answers: string[];
  validation_status: trivia_question_status;
  validation_feedback?: Prisma.JsonValue;
  usage_count: number;
  ai_generated: boolean;
  created_at: Date;
  last_used?: Date | null;  // Allow null since that's what Prisma returns
}

export class ServerGameQuestionService {
  private static instance: ServerGameQuestionService | null = null;
  private static readonly DEFAULT_QUESTIONS_PER_ROUND = 5;
  private static readonly DEFAULT_NUMBER_OF_ROUNDS = 1;
  private static readonly MIN_QUESTIONS_REQUIRED = 3;
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY = 1000;
  private static readonly CONNECTION_RETRY_DELAY = 2000;
  private static readonly MAX_CONNECTION_RETRIES = 3;
  private questionCache: Map<string, {questions: Question[], timestamp: number}> = new Map();
  private readonly CACHE_DURATION = 60000; // 1 minute cache
  private initializationPromise: Promise<void> | null = null;

  private constructor() {
    this.initializationPromise = this.initialize();
  }

  public static getInstance(): ServerGameQuestionService {
    if (!this.instance) {
      this.instance = new ServerGameQuestionService();
    }
    return this.instance;
  }

  private async initialize(): Promise<void> {
    try {
      // Try to get fresh questions first
      const questions = await this.getFreshQuestionsWithRetry(ServerGameQuestionService.DEFAULT_QUESTIONS_PER_ROUND);
      
      if (questions.length > 0) {
        const validQuestions = this.validateQuestions(questions);
        if (validQuestions.length > 0) {
          this.questionCache.set('default', {
            questions: validQuestions,
            timestamp: Date.now()
          });
          return;
        }
      }
      
      console.error('No valid questions available during initialization');
      this.initializationPromise = null;
    } catch (error) {
      console.error('Failed to initialize question cache:', error);
      this.initializationPromise = null;
    }
  }

  async getQuestionsForGame(config: {
    questionsPerRound?: number;
    numberOfRounds?: number;
    difficultyProgression?: Difficulty[];
  }): Promise<Question[][]> {
    try {
      // Initialize if needed
      if (!this.questionCache.has('default')) {
        await this.initialize();
      }

      const questionsPerRound = config.questionsPerRound ?? ServerGameQuestionService.DEFAULT_QUESTIONS_PER_ROUND;
      const numberOfRounds = config.numberOfRounds ?? ServerGameQuestionService.DEFAULT_NUMBER_OF_ROUNDS;
      const totalQuestionsNeeded = questionsPerRound * numberOfRounds;

      if (totalQuestionsNeeded < ServerGameQuestionService.MIN_QUESTIONS_REQUIRED) {
        throw new Error(`Minimum ${ServerGameQuestionService.MIN_QUESTIONS_REQUIRED} questions required per game`);
      }

      // Try to get questions with retries
      const questions = await this.getQuestionsWithRetry(totalQuestionsNeeded, 0);
      const validQuestions = this.validateQuestions(questions);

      if (validQuestions.length < ServerGameQuestionService.MIN_QUESTIONS_REQUIRED) {
        throw new Error('Not enough valid questions available');
      }

      // Update question usage before returning
      await this.updateQuestionUsage(validQuestions.map(q => q.id));

      return this.groupQuestions(validQuestions, questionsPerRound, numberOfRounds);
    } catch (error) {
      console.error('Failed to get questions for game:', error);
      this.questionCache.clear(); // Clear cache on error
      throw new Error('Failed to initialize game questions');
    }
  }

  private async getQuestionsWithRetry(count: number, retryCount: number): Promise<RawQuestion[]> {
    try {
      const questions = await prisma.trivia_questions.findMany({
        where: {
          validation_status: 'approved'
        },
        orderBy: [
          { usage_count: 'asc' },
          { created_at: 'desc' }
        ],
        take: count,
        select: {
          id: true,
          content: true,
          difficulty: true,
          category: true,
          correct_answer: true,
          incorrect_answers: true,
          validation_status: true,
          validation_feedback: true,
          usage_count: true,
          ai_generated: true,
          created_at: true,
          last_used: true
        }
      }).then(results => results.map(q => ({
        ...q,
        last_used: q.last_used || undefined  // Convert null to undefined
      })));

      if (questions.length >= count) {
        return questions;
      }

      // If we don't have enough questions, try again after a delay
      if (retryCount < ServerGameQuestionService.MAX_RETRIES) {
        console.log(`Found ${questions.length} questions, need ${count}. Retrying... (attempt ${retryCount + 1}/${ServerGameQuestionService.MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, ServerGameQuestionService.RETRY_DELAY));
        return this.getQuestionsWithRetry(count, retryCount + 1);
      }

      // If we still don't have enough questions after all retries, use what we have if it meets minimum requirements
      if (questions.length >= ServerGameQuestionService.MIN_QUESTIONS_REQUIRED) {
        console.log(`Using ${questions.length} questions after exhausting retries`);
        return questions;
      }

      throw new Error(`Only found ${questions.length} questions after ${retryCount} retries, minimum ${ServerGameQuestionService.MIN_QUESTIONS_REQUIRED} required`);
    } catch (error) {
      console.error('Error in getQuestionsWithRetry:', error);
      throw error;
    }
  }

  private async getFreshQuestionsWithRetry(count: number, retryCount = 0): Promise<RawQuestion[]> {
    try {
      return await this.getFreshQuestions(count);
    } catch (error) {
      if (error instanceof Error && error.message.includes('connection') && retryCount < ServerGameQuestionService.MAX_CONNECTION_RETRIES) {
        console.log(`Connection error, retrying (${retryCount + 1}/${ServerGameQuestionService.MAX_CONNECTION_RETRIES})...`);
        await new Promise(resolve => setTimeout(resolve, ServerGameQuestionService.CONNECTION_RETRY_DELAY));
        return this.getFreshQuestionsWithRetry(count, retryCount + 1);
      }
      throw error;
    }
  }

  private async getFreshQuestions(count: number): Promise<RawQuestion[]> {
    try {
      const freshQuestions = await prisma.trivia_questions.findMany({
        where: {
          validation_status: 'approved',
          last_used: {
            lt: new Date(Date.now() - 3600000) // 1 hour cooldown
          }
        },
        orderBy: [
          { usage_count: 'asc' },
          { created_at: 'desc' }
        ],
        take: count,
        select: {
          id: true,
          content: true,
          difficulty: true,
          category: true,
          correct_answer: true,
          incorrect_answers: true,
          validation_status: true,
          validation_feedback: true,
          usage_count: true,
          ai_generated: true,
          created_at: true,
          last_used: true
        }
      });

      return freshQuestions.map(q => ({
        ...q,
        last_used: q.last_used || undefined
      }));
    } catch (error) {
      console.error('Error in getFreshQuestions:', error);
      throw error;
    }
  }

  private async getAnyApprovedQuestions(count: number): Promise<RawQuestion[]> {
    return prisma.trivia_questions.findMany({
      where: {
        validation_status: 'approved'
      },
      orderBy: [
        { usage_count: 'asc' },
        { created_at: 'desc' }
      ],
      take: count,
      select: {
        id: true,
        content: true,
        difficulty: true,
        category: true,
        correct_answer: true,
        incorrect_answers: true,
        validation_status: true,
        validation_feedback: true,
        usage_count: true,
        ai_generated: true,
        created_at: true,
        last_used: true
      }
    }).then(results => results.map(q => ({
      ...q,
      last_used: q.last_used || undefined  // Convert null to undefined
    })));
  }

  private validateQuestions(questions: RawQuestion[]): Question[] {
    console.log('Validating questions:', {
      totalQuestions: questions.length,
      questionIds: questions.map(q => q.id)
    });

    const validatedQuestions = questions
      .map(q => {
        try {
          // Convert RawQuestion to Question type
          const question: Question = {
            id: q.id,
            content: q.content,
            difficulty: q.difficulty,
            category: q.category,
            correct_answer: q.correct_answer,
            incorrect_answers: q.incorrect_answers,
            validation_status: q.validation_status,
            usage_count: q.usage_count,
            ai_generated: q.ai_generated,
            created_at: q.created_at
          };

          // Only include validation_feedback if it exists and can be parsed
          if (q.validation_feedback) {
            try {
              question.validation_feedback = JSON.parse(q.validation_feedback.toString());
            } catch {
              console.warn(`Failed to parse validation feedback for question ${q.id}`);
            }
          }

          return question;
        } catch (error) {
          console.error('Error processing question:', {
            questionId: q.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          return null;
        }
      })
      .filter((q): q is Question => 
        q !== null && 
        Boolean(q.content) && 
        Boolean(q.correct_answer) && 
        Array.isArray(q.incorrect_answers) && 
        q.incorrect_answers.length > 0
      );

    console.log('Question validation results:', {
      totalQuestions: questions.length,
      validQuestions: validatedQuestions.length,
      invalidQuestions: questions.length - validatedQuestions.length
    });

    return validatedQuestions;
  }

  private groupQuestions(questions: Question[], questionsPerRound: number, numberOfRounds: number): Question[][] {
    return Array.from({ length: numberOfRounds }, (_, i) => 
      questions.slice(i * questionsPerRound, (i + 1) * questionsPerRound)
    );
  }

  private async updateQuestionUsage(questionIds: number[]): Promise<void> {
    await prisma.trivia_questions.updateMany({
      where: { id: { in: questionIds } },
      data: {
        last_used: new Date(),
        usage_count: { increment: 1 }
      }
    });
  }
}

export default ServerGameQuestionService;