import type { Question, Difficulty } from '@/types/question';

interface GameQuestionConfig {
  questionsPerRound?: number;
  numberOfRounds?: number;
  difficultyProgression?: Difficulty[];
}

export class GameQuestionService {
  private static instance: GameQuestionService | null = null;
  private questionCache: Map<string, {questions: Question[], timestamp: number}> = new Map();
  private readonly CACHE_DURATION = 60000; // 1 minute cache

  private constructor() {}

  public static getInstance(): GameQuestionService {
    if (!this.instance) {
      this.instance = new GameQuestionService();
    }
    return this.instance;
  }

  async getQuestionsForGame(config: GameQuestionConfig): Promise<Question[][]> {
    try {
      const params = new URLSearchParams({
        questionsPerRound: (config.questionsPerRound || 5).toString(),
        numberOfRounds: (config.numberOfRounds || 1).toString()
      });

      const response = await fetch(`/api/questions?${params}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || 'Failed to fetch questions');
      }

      const data = await response.json();
      if (!data.success || !data.questions) {
        throw new Error('Invalid response from questions API');
      }

      return data.questions;
    } catch (error) {
      console.error('Error fetching questions:', error);
      this.questionCache.clear(); // Clear potentially corrupted cache
      throw error;
    }
  }

  clearCache(): void {
    this.questionCache.clear();
  }
}