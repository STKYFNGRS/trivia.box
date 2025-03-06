import { trivia_difficulty, trivia_category, trivia_question_status } from '@prisma/client'

// Base question structure
export interface Question {
  id: number
  content: string
  difficulty: trivia_difficulty
  category: trivia_category
  correct_answer: string
  incorrect_answers: string[]
  ai_generated: boolean
  validation_status: trivia_question_status
  validation_feedback?: QuestionValidationFeedback[]
  created_at: Date
  last_used?: Date
  usage_count: number
}

// Question generation request
export interface QuestionGenerationParams {
  difficulty: trivia_difficulty
  category: trivia_category
  context?: string
}

// Validation feedback structure
export interface QuestionValidationFeedback {
  type: 'error' | 'warning' | 'suggestion'
  message: string
  field?: keyof Question
}

// Question batch operations
export interface QuestionBatch {
  questions: Question[]
  totalCount: number
  validCount: number
  pendingValidation: number
}

// Question statistics
export interface QuestionStats {
  byCategory: Record<trivia_category, number>
  byDifficulty: Record<trivia_difficulty, number>
  byStatus: Record<trivia_question_status, number>
  totalQuestions: number
  averageUsageCount: number
}

// Question search parameters
export interface QuestionSearchParams {
  category?: trivia_category
  difficulty?: trivia_difficulty
  status?: trivia_question_status
  aiGenerated?: boolean
  usedAfter?: Date
  usedBefore?: Date
  limit?: number
  offset?: number
}