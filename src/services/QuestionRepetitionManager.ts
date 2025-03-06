import { prisma } from '@/lib/db/client';
import type { Question } from '@/types/question';

// Constants
const CORRECT_ANSWER_COOLDOWN_DAYS = 30; // Longer cooldown for correctly answered questions
const INCORRECT_ANSWER_COOLDOWN_DAYS = 7;  // Shorter cooldown for incorrectly answered questions
const MAX_TRACKING_HISTORY = 1000; // Maximum number of questions to track per user

export class QuestionRepetitionManager {
  private static instance: QuestionRepetitionManager | null = null;

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): QuestionRepetitionManager {
    if (!this.instance) {
      this.instance = new QuestionRepetitionManager();
    }
    return this.instance;
  }

  /**
   * Get the list of questions to exclude for a specific user
   */
  public async getQuestionsToExclude(walletAddress: string | null): Promise<number[]> {
    if (!walletAddress) {
      return [];
    }

    try {
      // Normalize wallet address for case-insensitive comparison
      const normalizedWallet = walletAddress.toLowerCase();
      
      // Find the user by wallet address
      const user = await prisma.trivia_users.findFirst({
        where: {
          wallet_address: {
            contains: normalizedWallet,
            mode: 'insensitive'
          }
        },
        select: { id: true }
      });

      if (!user) {
        return [];
      }
      
      // Calculate the date for each cooldown period
      const correctCooldownDate = new Date();
      correctCooldownDate.setDate(correctCooldownDate.getDate() - CORRECT_ANSWER_COOLDOWN_DAYS);
      
      const incorrectCooldownDate = new Date();
      incorrectCooldownDate.setDate(incorrectCooldownDate.getDate() - INCORRECT_ANSWER_COOLDOWN_DAYS);
      
      // Get correctly answered questions with longer cooldown
      const correctAnswers = await prisma.trivia_player_responses.findMany({
        where: {
          user_id: user.id,
          is_correct: true,
          answered_at: {
            gte: correctCooldownDate
          }
        },
        orderBy: {
          answered_at: 'desc'
        },
        select: {
          question_id: true
        },
        take: MAX_TRACKING_HISTORY
      });

      // Get incorrectly answered questions with shorter cooldown
      const incorrectAnswers = await prisma.trivia_player_responses.findMany({
        where: {
          user_id: user.id,
          is_correct: false,
          answered_at: {
            gte: incorrectCooldownDate
          }
        },
        orderBy: {
          answered_at: 'desc'
        },
        select: {
          question_id: true
        },
        take: MAX_TRACKING_HISTORY
      });

      // Combine both sets of question IDs
      const correctIds = correctAnswers.map(response => response.question_id);
      const incorrectIds = incorrectAnswers.map(response => response.question_id);
      
      console.log(`Excluding ${correctIds.length} correctly answered questions and ${incorrectIds.length} incorrectly answered questions for user ${user.id}`);
      
      // Return combined exclusion list
      return [...correctIds, ...incorrectIds];
    } catch (error) {
      console.error('Error fetching questions to exclude:', error);
      return [];
    }
  }

  /**
   * Filter questions to remove recently answered ones
   */
  public async filterOutRecentQuestions(
    questions: Question[],
    walletAddress: string | null
  ): Promise<Question[]> {
    if (!walletAddress || questions.length === 0) {
      return questions;
    }

    try {
      const questionsToExclude = await this.getQuestionsToExclude(walletAddress);
      
      if (questionsToExclude.length === 0) {
        return questions;
      }

      // Filter out recently answered questions
      return questions.filter(question => !questionsToExclude.includes(question.id));
    } catch (error) {
      console.error('Error filtering out recent questions:', error);
      return questions;
    }
  }
}