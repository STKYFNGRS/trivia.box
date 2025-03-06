// Environment constants
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const IS_PRODUCTION = NODE_ENV === 'production';
export const IS_DEVELOPMENT = NODE_ENV === 'development';

// Cache durations in milliseconds
export const CACHE_DURATIONS = {
  SHORT: 1000 * 60, // 1 minute
  MEDIUM: 1000 * 60 * 5, // 5 minutes
  LONG: 1000 * 60 * 30, // 30 minutes
  VERY_LONG: 1000 * 60 * 60 * 6, // 6 hours
};

// API endpoints
export const API_ENDPOINTS = {
  STATS: '/api/scores/stats',
  LEADERBOARD: '/api/scores/leaderboard',
  USER: '/api/user',
  QUESTIONS: '/api/questions',
  GAME_SESSION: '/api/game/session',
};