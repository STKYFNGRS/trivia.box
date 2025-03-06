import type { Question } from '../types'
import type { CreateQuestionInput } from '../types/question'
import { prisma } from '../lib/db/client'
import { Prisma } from '@prisma/client'
import type { trivia_category, trivia_difficulty, trivia_question_status } from '@prisma/client'
import type { ValidationFeedback } from '../types/api'

export class QuestionOperations {
  private static serializeValidationFeedback(feedback?: ValidationFeedback[]): Prisma.InputJsonValue | undefined {
    if (!feedback) return undefined;
    return JSON.stringify(feedback);
  }

  private static deserializeValidationFeedback(json: unknown): ValidationFeedback[] | undefined {
    if (!json) return undefined;
    try {
      const parsed = JSON.parse(json as string);
      if (Array.isArray(parsed)) {
        return parsed as ValidationFeedback[];
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  static async createQuestion(data: CreateQuestionInput): Promise<Question> {
    const result = await prisma.trivia_questions.create({
      data: {
        content: data.content,
        category: data.category,
        difficulty: data.difficulty,
        correct_answer: data.correct_answer,
        incorrect_answers: data.incorrect_answers,
        ai_generated: data.ai_generated ?? false,
        validation_status: data.validation_status ?? 'draft',
        validation_feedback: this.serializeValidationFeedback(data.validation_feedback)
      }
    });

    return {
      ...result,
      validation_feedback: this.deserializeValidationFeedback(result.validation_feedback)
    } as Question;
  }

  static async createManyQuestions(questions: CreateQuestionInput[]): Promise<Question[]> {
    await prisma.trivia_questions.createMany({
      data: questions.map(q => ({
        content: q.content,
        category: q.category,
        difficulty: q.difficulty,
        correct_answer: q.correct_answer,
        incorrect_answers: q.incorrect_answers,
        ai_generated: q.ai_generated ?? false,
        validation_status: q.validation_status ?? 'draft',
        validation_feedback: this.serializeValidationFeedback(q.validation_feedback)
      }))
    });

    // Since createMany doesn't return the created records, we need to fetch them
    const latestQuestions = await prisma.trivia_questions.findMany({
      orderBy: { id: 'desc' },
      take: questions.length
    });

    return latestQuestions.map(q => ({
      ...q,
      validation_feedback: this.deserializeValidationFeedback(q.validation_feedback)
    })) as Question[];
  }

  static async getQuestionsByCategory(
    category: trivia_category,
    difficulty?: trivia_difficulty,
    limit = 10
  ): Promise<Question[]> {
    const questions = await prisma.trivia_questions.findMany({
      where: {
        category,
        ...(difficulty ? { difficulty } : {})
      },
      take: limit
    });

    return questions.map(q => ({
      ...q,
      validation_feedback: this.deserializeValidationFeedback(q.validation_feedback)
    })) as Question[];
  }

  static async updateQuestionStatus(
    id: number,
    status: trivia_question_status,
    feedback?: ValidationFeedback[]
  ): Promise<Question> {
    const result = await prisma.trivia_questions.update({
      where: { id },
      data: {
        validation_status: status,
        validation_feedback: this.serializeValidationFeedback(feedback)
      }
    });

    return {
      ...result,
      validation_feedback: this.deserializeValidationFeedback(result.validation_feedback)
    } as Question;
  }

  static async markQuestionUsed(id: number): Promise<Question> {
    const result = await prisma.trivia_questions.update({
      where: { id },
      data: {
        last_used: new Date(),
        usage_count: {
          increment: 1
        }
      }
    });

    return {
      ...result,
      validation_feedback: this.deserializeValidationFeedback(result.validation_feedback)
    } as Question;
  }
}