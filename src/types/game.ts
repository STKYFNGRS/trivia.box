import type { trivia_game_status, trivia_difficulty, trivia_category } from '@prisma/client';
import type { Question } from './question';

// Game session state
export interface GameSession {
  id: number;
  status: trivia_game_status;
  started_at: Date;
  ended_at?: Date;
  question_sequence: number[];
  player_count: number;
  current_index: number;
  responses?: Array<{
    streak_count: number;
    user_id: number;
  }>;
}

// Player-specific game state
export interface PlayerGameState {
  userId: number;
  sessionId: number;
  currentScore: number;
  combo: number;
  answeredQuestions: {
    questionId: number;
    answer: string;
    isCorrect: boolean;
    timeRemaining: number;
    pointsEarned: number;
  }[];
  lastAnsweredAt?: Date;
}

// Game configuration
export interface GameConfig {
  roundTime?: number;
  transitionDelay?: number;
  questionsPerRound?: number;
  numberOfRounds?: number;
  timeLimit?: number;
  difficultyProgression?: trivia_difficulty[];
  categoryFilters?: trivia_category[];
  questionCount: number;
  category?: string;
  excludeQuestions?: string[];
  walletAddress: string;
  difficulty?: string;
}

// Game state during gameplay
export interface GameState {
  sessionId: string;
  questions: Question[];
  gamePhase: 'playing' | 'complete';
  currentQuestionIndex: number;
  timeRemaining: number;
  score: number;
  combo: number;
  status: 'active' | 'completed' | 'cancelled';
  walletAddress?: string;
  startTime?: number;
}

// Player's response
export interface PlayerResponse {
  id: number;
  game_session_id: number;
  user_id: number;
  question_id: number;
  response_time_ms: number;
  answer: string;
  is_correct: boolean;
  points_earned: number;
  potential_points: number;
  streak_count: number;
  time_remaining: number;
  answered_at: Date;
}

export type GamePhase = 'waiting' | 'playing' | 'completed';

export interface TimeData {
  remainingTime: number;
  remainingPoints: number;
  elapsedTime: number;
}

// Game Response type
export interface GameResponse {
  success: boolean;
  data?: {
    state: GameState;
    achievements?: string[];
  };
  error?: string;
}

// Game Scoring
export interface GameScoring {
  basePoints: number;
  timeBonus: number;
  streakBonus: number;
  totalPoints: number;
}

// Game Round
export interface GameRound {
  roundNumber: number;
  questions: Question[];
  scores: Record<number, number>;
  timeLimit: number;
}

// Game Standings
export interface GameStandings {
  rankings: PlayerRanking[];
  topScore: number;
  averageScore: number;
}

// Player Ranking
export interface PlayerRanking {
  userId: number;
  score: number;
  position: number;
  streak: number;
}

// Game Results
export interface GameResults {
  sessionId: number;
  standings: GameStandings;
  achievements: Record<number, string[]>;
  duration: number;
}

// Question Performance
export interface QuestionPerformance {
  questionId: number;
  averageTime: number;
  correctAnswers: number;
  totalAttempts: number;
  averageScore: number;
}

// Game Validation Result
export interface GameValidationResult {
  isValid: boolean;
  errors: string[];
}