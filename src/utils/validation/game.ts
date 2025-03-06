import type { GameState } from '../../types/game'
import type { ErrorResponse } from '../../types/api'

export interface GameValidationResult {
  isValid: boolean
  errors: ErrorResponse[]
}

export function validateGameTimings(state: GameState): GameValidationResult {
  const errors: ErrorResponse[] = []

  if (state.timeRemaining < 0) {
    errors.push({
      code: 'INVALID_TIME',
      message: 'Time remaining cannot be negative'
    })
  }

  return {
    isValid: errors.length === 0,
    errors
  }
}

interface Points {
  base: number
  time: number
  combo: number
  total: number
}

interface DifficultyMultiplier {
  easy: number
  medium: number
  hard: number
}

const DIFFICULTY_MULTIPLIERS: DifficultyMultiplier = {
  easy: 1,
  medium: 1.5,
  hard: 2
}

export function calculatePoints(
  timeRemaining: number,
  combo: number,
  difficulty: keyof DifficultyMultiplier
): Points {
  const basePoints = 100
  const timeBonus = Math.floor(timeRemaining / 1000) * 10
  const comboBonus = combo * 50
  const multiplier = DIFFICULTY_MULTIPLIERS[difficulty]

  return {
    base: basePoints,
    time: timeBonus,
    combo: comboBonus,
    total: Math.floor((basePoints + timeBonus + comboBonus) * multiplier)
  }
}

export function validateGameResponse(
  state: GameState
): GameValidationResult {
  const errors: ErrorResponse[] = []

  const currentQuestion = state.questions[state.currentQuestionIndex]
  if (!currentQuestion) {
    errors.push({
      code: 'NO_ACTIVE_QUESTION',
      message: 'No active question to validate response against'
    })
  }

  if (state.timeRemaining <= 0) {
    errors.push({
      code: 'TIME_EXPIRED',
      message: 'Time has expired for this question'
    })
  }

  return {
    isValid: errors.length === 0,
    errors
  }
}