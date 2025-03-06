import type { Question } from './question'
import type { User } from './user'
import type { GameState, GameSession } from './game'
import type { Achievement } from './achievement'
import type { trivia_category, trivia_difficulty, trivia_game_status } from '@prisma/client'

// API Response wrapper
export interface APIResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}

export interface GameAPIResponse {
  session_id: number
  player_id: number
  answer: string
  timestamp: number
}

// Game API Endpoints
export interface GameAPI {
  // Game session management
  createGame(questions: number[]): Promise<APIResponse<GameSession>>
  startGame(session_id: number): Promise<APIResponse<GameSession>>
  submitAnswer(response: GameAPIResponse): Promise<APIResponse<{
    points: number
    correct: boolean
    standing: number
  }>>
  getGameState(session_id: number): Promise<APIResponse<GameSession>>

  // Question management
  getQuestions(params: QuestionQueryParams): Promise<APIResponse<Question[]>>
  validateQuestion(questionId: number): Promise<QuestionValidationResponse>
}

// User API Endpoints
export interface UserAPI {
  getProfile(userId: number): Promise<UserResponse>
  updateProfile(userId: number, data: Partial<User>): Promise<UserResponse>
  getAchievements(userId: number): Promise<APIResponse<Achievement[]>>
  getLeaderboard(timeframe: 'weekly' | 'all-time'): Promise<APIResponse<LeaderboardEntry[]>>
}

// Query Parameters
export interface QuestionQueryParams {
  category?: trivia_category
  difficulty?: trivia_difficulty
  status?: trivia_game_status
  limit?: number
  offset?: number
}

export interface LeaderboardEntry {
  user: User
  score: number
  rank: number
}

export interface ValidationResult {
  status: 'approved' | 'rejected' | 'reviewing'
  feedback: ValidationFeedback[]
  factChecking?: {
    sources: string[]
    confidence: number
  }
}

export interface ValidationFeedback {
  type: 'error' | 'warning' | 'suggestion'
  field?: keyof Question | string
  message: string
  details?: Record<string, unknown>
}

// WebSocket Event Data Types
interface GameStartEventData {
  session_id: number
  player_count: number
  total_questions: number
}

interface QuestionStartEventData {
  question_id: number
  time_limit_ms: number
  category: trivia_category
  difficulty: trivia_difficulty
}

interface PlayerAnswerEventData {
  player_id: number
  answer: string
  time_spent_ms: number
  points_earned: number
}

interface QuestionEndEventData {
  correct_answer: string
  scores: Record<number, number>
  next_question_delay_ms: number
}

interface GameEndEventData {
  final_scores: Record<number, number>
  winner_id: number
  achievements_earned: Record<number, string[]>
}

interface LeaderboardUpdateEventData {
  rankings: Array<{
    player_id: number
    score: number
    rank: number
  }>
}

type WSEventDataMap = {
  game_start: GameStartEventData
  question_start: QuestionStartEventData
  player_answer: PlayerAnswerEventData
  question_end: QuestionEndEventData
  game_end: GameEndEventData
  leaderboard_update: LeaderboardUpdateEventData
}

export type WSEventType = 
  | 'game_start'
  | 'question_start'
  | 'player_answer'
  | 'question_end'
  | 'game_end'
  | 'leaderboard_update'

export interface WSEvent<T extends WSEventType> {
  type: T
  session_id: number
  timestamp: number
  data: WSEventDataMap[T]
}

// Error Codes
export enum APIErrorCode {
  INVALID_INPUT = 'INVALID_INPUT',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  GAME_ERROR = 'GAME_ERROR',
  BLOCKCHAIN_ERROR = 'BLOCKCHAIN_ERROR',
  SERVER_ERROR = 'SERVER_ERROR'
}

export interface ErrorResponse {
  code: string
  message: string
  details?: Record<string, unknown>
}

export interface QuestionMetadata {
  id: number
  category: string
  difficulty: string
  format: string
  source?: string
}

export type QuestionValidationResponse = APIResponse<ValidationResult>
export type UserResponse = APIResponse<User>
export type QuestionResponse = APIResponse<Question>
export type GameStateResponse = APIResponse<GameState>
export type GameSessionResponse = APIResponse<GameSession>
export type QuestionMetadataResponse = APIResponse<QuestionMetadata>