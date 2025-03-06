import type { GameSession, APIResponse } from '../types'
import { prisma } from '../lib/db/client'
import type { trivia_game_sessions, trivia_game_status } from '@prisma/client'

export class GameSessionService {
  private static instance: GameSessionService | null = null

  private constructor() {}

  static getInstance(): GameSessionService {
    if (!this.instance) {
      this.instance = new GameSessionService()
    }
    return this.instance
  }

  async createSession(questionIds: number[]): Promise<APIResponse<GameSession>> {
    try {
      const session = await prisma.trivia_game_sessions.create({
        data: {
          question_sequence: JSON.stringify(questionIds),
          player_count: 0,
          status: 'pending' as trivia_game_status,
          started_at: new Date(),
          current_index: 0
        }
      })

      return {
        success: true,
        data: this.mapToGameSession(session)
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SESSION_CREATE_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  }

  async completeSession(sessionId: number): Promise<APIResponse<GameSession>> {
    try {
      const session = await prisma.trivia_game_sessions.update({
        where: { id: sessionId },
        data: { 
          status: 'completed' as trivia_game_status,
          ended_at: new Date()
        },
        include: {
          trivia_player_responses: {
            select: {
              streak_count: true,
              user_id: true
            },
            orderBy: {
              answered_at: 'desc'
            }
          }
        }
      })

      return {
        success: true,
        data: this.mapToGameSession(session)
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SESSION_UPDATE_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  }

  async getSessionResponses(sessionId: number): Promise<APIResponse<GameSession>> {
    try {
      const session = await prisma.trivia_game_sessions.findUnique({
        where: { id: sessionId },
        include: {
          trivia_player_responses: {
            select: {
              streak_count: true,
              user_id: true
            },
            orderBy: {
              answered_at: 'desc'
            }
          }
        }
      })

      if (!session) {
        return {
          success: false,
          error: {
            code: 'SESSION_NOT_FOUND',
            message: 'Session not found'
          }
        }
      }

      return {
        success: true,
        data: this.mapToGameSession(session)
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SESSION_FETCH_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  }

  private mapToGameSession(data: trivia_game_sessions & { trivia_player_responses?: Array<{ streak_count: number; user_id: number }> }): GameSession {
    // Parse question_sequence from JSON string to array
    const questionSequence = JSON.parse(data.question_sequence);

    return {
      id: data.id,
      status: data.status,
      started_at: data.started_at,
      ended_at: data.ended_at ?? undefined,
      question_sequence: questionSequence,
      player_count: data.player_count,
      current_index: data.current_index,
      responses: data.trivia_player_responses
    }
  }
}