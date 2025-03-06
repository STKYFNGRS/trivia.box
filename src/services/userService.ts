import type { User, APIResponse } from '../types'
import { prisma } from '../lib/db/client'

export class UserService {
  private static instance: UserService | null = null

  private constructor() {}

  static getInstance(): UserService {
    if (!this.instance) {
      this.instance = new UserService()
    }
    return this.instance
  }

  async getOrCreateUser(walletAddress: string): Promise<APIResponse<User>> {
    try {
      let user = await prisma.trivia_users.findUnique({
        where: { wallet_address: walletAddress }
      })

      if (!user) {
        user = await prisma.trivia_users.create({
          data: {
            wallet_address: walletAddress,
            total_points: 0n,  // Using BigInt for total_points as per schema
            games_played: 0
          }
        })
      }

      return {
        success: true,
        data: user as User
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'USER_OPERATION_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  }

  async updateUserPoints(userId: number, pointsToAdd: bigint): Promise<APIResponse<User>> {
    try {
      const user = await prisma.trivia_users.update({
        where: { id: userId },
        data: {
          total_points: {
            increment: pointsToAdd
          }
        }
      })

      return {
        success: true,
        data: user as User
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'USER_UPDATE_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  }

  async incrementGamesPlayed(userId: number): Promise<APIResponse<User>> {
    try {
      const user = await prisma.trivia_users.update({
        where: { id: userId },
        data: {
          games_played: {
            increment: 1
          },
          last_played_at: new Date()
        }
      })

      return {
        success: true,
        data: user as User
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'USER_UPDATE_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  }
}