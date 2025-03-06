import { prisma } from '@/lib/db/client';
import { ActivityLogType, Prisma } from '@prisma/client';
import type { SecurityLogDetails, SecurityLogType } from '@/types/logging';

type RateLimitAction = 'session-create' | 'score-submit' | 'question-fetch' | 'test-questions';
type RateLimitConfig = { maxAttempts: number; windowMs: number };

export class RateLimitService {
  private static instance: RateLimitService | null = null;
  private rateLimits: Map<string, { count: number; lastReset: number; sessionId?: string }> = new Map();
  private readonly RATE_LIMITS: Record<RateLimitAction, RateLimitConfig> = {
    'session-create': { maxAttempts: 3, windowMs: 10000 },     // 3 attempts per 10 seconds
    'score-submit': { maxAttempts: 20, windowMs: 10000 },      // 20 attempts per 10 seconds
    'question-fetch': { maxAttempts: 10, windowMs: 60000 },     // 10 attempts per minute
    'test-questions': { maxAttempts: 5, windowMs: 60000 }      // 5 attempts per minute
  };

  private constructor() {}

  public static getInstance(): RateLimitService {
    if (!this.instance) {
      this.instance = new RateLimitService();
    }
    return this.instance;
  }

  async checkRateLimit(
    action: RateLimitAction, 
    activityType: ActivityLogType, 
    sessionId?: string
  ): Promise<boolean> {
    const limits = this.RATE_LIMITS[action];
    if (!limits) return true;

    const now = Date.now();
    const key = sessionId ? `${action}-${activityType}-${sessionId}` : `${action}-${activityType}`;
    let rateLimit = this.rateLimits.get(key);

    // Initialize or reset rate limit if window has expired
    if (!rateLimit || (now - rateLimit.lastReset >= limits.windowMs)) {
      rateLimit = { count: 0, lastReset: now, sessionId };
    }

    // For score submissions, always allow if it's a new session
    if (action === 'score-submit' && sessionId && rateLimit.sessionId !== sessionId) {
      rateLimit = { count: 0, lastReset: now, sessionId };
    }

    // Check if we're over the limit
    if (rateLimit.count >= limits.maxAttempts) {
      const timeUntilReset = (rateLimit.lastReset + limits.windowMs) - now;
      console.warn(`Rate limit exceeded for ${action}. Try again in ${Math.ceil(timeUntilReset / 1000)} seconds`);
      return false;
    }

    // Increment counter
    rateLimit.count++;
    this.rateLimits.set(key, rateLimit);
    return true;
  }

  async logAttempt(
    activityType: ActivityLogType, 
    sessionId: string | number, 
    details?: SecurityLogDetails
  ): Promise<void> {
    try {
      // For test-questions and similar actions, sessionId might be a string key rather than a numeric ID
      if (typeof sessionId === 'string' && !sessionId.match(/^\d+$/)) {
        // This is a rate limit key, not an actual session ID - don't try to log it to the database
        console.log(`Rate limit logging for key: ${sessionId}`);
        return;
      }
      
      // Convert to numeric ID for database operations
      const numericSessionId = typeof sessionId === 'string' ? parseInt(sessionId, 10) : sessionId;
      
      // Make sure we have a valid session ID before trying to create a log
      if (isNaN(numericSessionId)) {
        console.warn('Invalid session ID format for logging:', sessionId);
        return;
      }
      
      // Verify session exists before logging
      if (numericSessionId > 0) { // Only check for positive IDs
        const session = await prisma.trivia_game_sessions.findUnique({
          where: { id: numericSessionId },
          select: { id: true }
        });

        if (!session) {
          console.warn('Attempted to log security event for non-existent session:', sessionId);
          return;
        }
      }
      
      const detailsObject = {
        ...details,
        timestamp: details?.timestamp || new Date().toISOString(),
        type: details?.type || 'rate_limit_exceeded' as SecurityLogType
      } as SecurityLogDetails;

      await prisma.security_logs.create({
        data: {
          session_id: numericSessionId,
          activity_type: activityType,
          details: detailsObject as Prisma.InputJsonValue,
          logged_at: new Date()
        }
      });
    } catch (error) {
      console.error('Failed to log security activity:', error);
    }
  }

  resetLimits(): void {
    this.rateLimits.clear();
  }
}