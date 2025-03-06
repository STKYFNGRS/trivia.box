export interface DatabaseRecord {
  count: number;
}

// Activity log validation results
export interface SecurityLogQueryResult {
  count: string;
}

// Update our scoring types to match schema
export interface TimeData {
  remainingTime: number;
  remainingPoints: number;
  elapsedTime: number;
}

export interface AnswerValidation {
  isValid: boolean;
  timeTaken: number;
  serverDrift: number;
  reason?: string;
}

export interface ScoreSubmission {
  questionId?: number;
  answer?: string;
  startTime: number;
  endTime: number;
  sessionId: number;
  type?: 'answer' | 'game_complete';
  score?: number;
  walletAddress?: string;
  timeLeft?: number;
}

export interface ScoreCalculationInput {
  timeRemaining: number;
  isCorrect: boolean;
  streakCount: number;
  maxPoints?: number;
}

export interface ScoreResult {
  points: number;
  maxPoints: number;
  streak: number;
}

export type RateLimitAction = 'session-create' | 'score-submit' | 'question-fetch' | 'achievement-check';

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