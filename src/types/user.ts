import type { Achievement } from './achievement'
import { trivia_achievements } from '@prisma/client';

// User profile
export interface User {
  id: number
  wallet_address: string
  total_points: bigint  // Use native bigint type
  games_played: number
  created_at: Date
  last_played_at?: Date
}

// Extended user profile with stats
export interface UserProfile extends User {
  achievements: Achievement[]
  weekly_rank?: number
  all_time_rank?: number
  average_score: number
  accuracy_rate: number
  favorite_category?: string
  recent_games: GameSummary[]
  trivia_achievements: trivia_achievements[];
  stats: {
    totalPoints: number;
    gamesPlayed: number;
    bestStreak: number;
    trivia_achievements_count: number;
  };
}

// User game summary
export interface GameSummary {
  session_id: number
  played_at: Date
  score: number
  position: number
  total_players: number
  correct_answers: number
  achievements_earned: string[]
}

// User statistics
export interface UserStats {
  total_games: number
  total_points: number
  correct_answers: number
  total_answers: number
  average_response_time: number
  best_category: {
    name: string
    accuracy: number
  }
  achievements_count: number
  best_position: number
  walletAddress: string;
  totalPoints: number;
  gamesPlayed: number;
  bestStreak: number;
  trivia_achievements: trivia_achievements[];
}

// Weekly user performance
export interface WeeklyPerformance {
  week_number: number
  year: number
  games_played: number
  total_points: number
  achievements_earned: Achievement[]
  average_position: number
}

// User leaderboard entry
export interface LeaderboardEntry {
  user: User
  rank: number
  score: number
  games_played: number
  achievements: number
  last_played: Date
  walletAddress: string;
  points: number;
  gamesPlayed: number;
  trivia_achievements: string[];
}