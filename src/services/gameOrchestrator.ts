import type { GameState, GameConfig, Question } from '../types';
import { GameQuestionService } from './client/GameQuestionService';
import { trivia_game_status } from '@prisma/client';

export class GameOrchestrator {
  private static instance: GameOrchestrator | null = null;
  private questionService: GameQuestionService;
  private readonly defaultConfig = {
    roundTime: 30000,
    transitionDelay: 3000
  };

  private constructor() {
    this.questionService = GameQuestionService.getInstance();
  }

  static getInstance(): GameOrchestrator {
    if (!this.instance) {
      this.instance = new GameOrchestrator();
    }
    return this.instance;
  }

  async initializeGame(config: GameConfig & { questions: Question[]; sessionId: number }): Promise<GameState> {
    const fullConfig = {
      ...this.defaultConfig,
      ...config
    };
    
    return {
      sessionId: config.sessionId.toString(),
      questions: config.questions,
      gamePhase: 'playing',
      currentQuestionIndex: 0,
      timeRemaining: fullConfig.roundTime,
      score: 0,
      combo: 0,
      status: trivia_game_status.active
    };
  }

  getNextQuestion(state: GameState): GameState {
    if (state.currentQuestionIndex >= state.questions.length - 1) {
      return {
        ...state,
        gamePhase: 'complete',
        status: trivia_game_status.completed
      };
    }

    return {
      ...state,
      currentQuestionIndex: state.currentQuestionIndex + 1,
      timeRemaining: this.defaultConfig.roundTime
    };
  }

  updateScore(state: GameState, isCorrect: boolean, timeLeft: number): GameState {
    const newCombo = isCorrect ? state.combo + 1 : 0;
    const points = isCorrect ? Math.ceil(timeLeft * (newCombo + 1)) : 0;

    return {
      ...state,
      score: state.score + points,
      combo: newCombo
    };
  }
}