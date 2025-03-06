import type { ValidationFeedback } from './api'
import { trivia_difficulty, trivia_category, trivia_question_status } from '@prisma/client'

export type Category = trivia_category
export type Difficulty = trivia_difficulty
export type QuestionStatus = trivia_question_status

export interface Question {
  id: number
  content: string
  category: Category
  difficulty: Difficulty
  correct_answer: string
  incorrect_answers: string[]
  ai_generated: boolean
  validation_status: QuestionStatus
  validation_feedback?: ValidationFeedback[]
  created_at: Date
  last_used?: Date
  usage_count: number
}

export interface CreateQuestionInput {
  content: string
  category: Category
  difficulty: Difficulty
  correct_answer: string
  incorrect_answers: string[]
  ai_generated?: boolean
  validation_status?: QuestionStatus
  validation_feedback?: ValidationFeedback[]
}

export interface QuestionGenerationParams {
  category: Category
  difficulty: Difficulty
  context?: string
}