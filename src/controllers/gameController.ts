// Add minimal changes to ensure the game controller events work correctly
import { GameOrchestrator } from '../services/gameOrchestrator';
import { GameQuestionService } from '../services/client/GameQuestionService';
import { AchievementService } from '@/services/achievements/AchievementService';
import { EventEmitter } from 'events';
import { GameState, GameConfig } from '@/types/game';

const RETRY_DELAY = 2000; // 2 seconds between retries
const MAX_RETRIES = 2; // Maximum 2 retries
const MIN_RESET_INTERVAL = 3000; // Minimum 3 seconds between resets
const SESSION_CLEANUP_TIMEOUT = 2000; // Wait 2 seconds for cleanup
const SESSION_CREATION_TIMEOUT = 30000; // Increase timeout to 30 seconds for session creation
const DEBUG_MODE = true; // Enable for debugging

// Debug logger - logs to console regardless of DEBUG_MODE for critical functions
const debugLog = (...args: any[]) => {
  console.log(...args);
};

export class GameController extends EventEmitter {
  private static instance: GameController | null = null;
  private gameState: GameState | null = null;
  private pendingGameStart: Promise<GameState> | null = null;
  private lastResetTime: number = 0;
  private lastCleanupTime: number = 0;
  private orchestrator: GameOrchestrator;
  private questionService: GameQuestionService;
  private retryCount = 0;
  private lastErrorTime: number = 0;
  private sessionCreationLock = false;
  private readonly MIN_CLEANUP_INTERVAL = 5000; // 5 seconds between cleanups
  private cleanupInProgress: Set<number> = new Set();

  constructor() {
    super();
    this.orchestrator = GameOrchestrator.getInstance();
    this.questionService = GameQuestionService.getInstance();
    
    // Set a higher limit for event listeners to prevent warnings
    this.setMaxListeners(20);
    
    // Log constructor for debugging
    console.log('🎲 GameController: constructor called');
  }

  public static getInstance(): GameController {
    if (!GameController.instance) {
      console.log('🎲 GameController: Creating new instance');
      GameController.instance = new GameController();
    }
    return GameController.instance;
  }

  private updateGameState(newState: GameState | null) {
    // Store previous state for comparison
    const hadPreviousState = !!this.gameState;
    const previousSessionId = this.gameState?.sessionId;
    
    // Update the internal state
    this.gameState = newState;
    
    console.log('🎲 GameController: Emitting stateChange event with state:', newState ? 'Valid Game State' : 'Null');
    if (newState) {
      console.log(`🎲 GameController: emitted state has sessionId: ${newState.sessionId} and ${newState.questions?.length || 0} questions`);
      
      // Force listeners to update with setTimeout to ensure proper event loop execution
      // Don't use setTimeout - use immediate emission to prevent state loss
      this.emit('stateChange', newState);
      
    } else if (hadPreviousState) {
      // If we're clearing state that previously existed, ensure we emit this change
      console.log(`🎲 GameController: Clearing previous game state with session ID: ${previousSessionId}`);
      this.emit('stateChange', null);
    }
  }

  async startGame(config: GameConfig): Promise<GameState> {
    try {
      if (this.sessionCreationLock) {
        console.warn('🎲 Session creation already in progress');
        if (this.gameState) {
          return this.gameState;
        } else {
          throw new Error('Game initialization in progress but no state available');
        }
      }
      
      this.sessionCreationLock = true;
      console.log('🎲 GameController - Starting game with config:', 
                  `${config.questionCount} questions, category: ${config.category}, difficulty: ${config.difficulty}, wallet: ${config.walletAddress?.slice(0, 8)}...`);
      
      // Always force refresh
      const forceRefresh = true; 
      
      // Create session immediately when starting the game with retry logic
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        attempts++;
        console.log(`🎲 Creating game session (attempt ${attempts}/${maxAttempts}) with wallet address: ${config.walletAddress?.slice(0, 8)}`);
        
        // Add request timeout - increased from 15s to 30s
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), SESSION_CREATION_TIMEOUT); 
        
        try {
          console.log('🎲 Sending fetch request to /api/game/session');
          const startTime = performance.now();
          
          // Add retry mechanism with exponential backoff
          const backoffTime = attempts === 1 ? 0 : Math.min(2000 * Math.pow(1.5, attempts - 2), 5000);
          if (backoffTime > 0) {
            console.log(`🎲 Backoff wait for ${backoffTime}ms before attempt ${attempts}`);
            await new Promise(resolve => setTimeout(resolve, backoffTime));
          }
          
          const response = await fetch('/api/game/session', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache'
            },
            body: JSON.stringify({
              category: config.category,
              questionCount: config.questionCount,
              difficulty: config.difficulty || 'mixed',
              walletAddress: config.walletAddress,
              forceRefresh: true, // Always force a refresh
              _t: Date.now(), // Add timestamp to prevent caching
              retry: attempts // Tell server this is a retry
            }),
            signal: controller.signal,
            // Force network fetch with no cache
            cache: 'no-store'
          });
          
          const endTime = performance.now();
          console.log(`🎲 Fetch request completed in ${Math.round(endTime - startTime)}ms`);
          
          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorText = await response.text();
            let errorData;
            try {
              errorData = JSON.parse(errorText);
            } catch (e) {
              errorData = { error: errorText || 'Failed to create game session' };
            }
            
            if (attempts < maxAttempts) {
              console.log(`🎲 Session creation failed (attempt ${attempts}), retrying...`);
              // Log the specific error to help debugging
              console.log(`🎲 Error response: ${JSON.stringify(errorData)}`);
              await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
              continue;
            }
            throw new Error(errorData.error || 'Failed to create game session');
          }

          console.log('🎲 Parsing response JSON...');
          const parseStart = performance.now();
          let data;
          try {
            data = await response.json();
          } catch (parseError) {
            console.error('🎲 JSON parsing error:', parseError);
            if (attempts < maxAttempts) {
              console.log(`🎲 JSON parsing failed (attempt ${attempts}), retrying...`);
              await new Promise(resolve => setTimeout(resolve, 2000));
              continue;
            }
            throw new Error('Failed to parse response from game server');
          }
          console.log(`🎲 JSON parsing completed in ${Math.round(performance.now() - parseStart)}ms`);
          
          // Validate we have the correct number of questions
          if (!data.hasQuestions || !Array.isArray(data.questions) || data.questions.length !== config.questionCount) {
            if (attempts < maxAttempts) {
              console.log(`🎲 Received incorrect question count: ${data.questions?.length || 0} (attempt ${attempts}), retrying...`);
              await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
              continue;
            }
            throw new Error(`Expected ${config.questionCount} questions but received ${data.questions?.length || 0}`);
          }

          // Create game state with validated data
          console.log('🎲 Creating new game state object...');
          const gameState = {
            sessionId: data.sessionId.toString(),
            questions: data.questions,
            gamePhase: 'playing',
            currentQuestionIndex: 0,
            timeRemaining: 15,
            score: 0,
            combo: 0,
            status: 'active',
            walletAddress: config.walletAddress,
            startTime: Date.now()
          } as GameState;
          
          console.log('🎲 Game session created successfully:', data.sessionId);
          console.log(`🎲 Received ${gameState.questions.length} questions for the game`);
          
          // Critical: Update the internal state right away
          this.gameState = gameState;
          
          // Emit state change event immediately (no setTimeout)
          console.log('🎲 Emitting stateChange event...');
          this.emit('stateChange', gameState);
          
          console.log('🎲 Returning gameState object');
          return gameState;
        } catch (fetchError) {
          clearTimeout(timeoutId);
          
          if (fetchError.name === 'AbortError') {
            if (attempts < maxAttempts) {
              console.log(`🎲 Session creation timed out (attempt ${attempts}), retrying...`);
              await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
              continue;
            }
            throw new Error('Request timed out while creating game session');
          }
          
          console.error(`🎲 Fetch error on attempt ${attempts}:`, fetchError);
          if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
            continue;
          }
          
          throw fetchError;
        }
      }
      
      // If we get here, all attempts failed
      throw new Error(`Failed to create game session after ${maxAttempts} attempts`);

    } catch (error) {
      console.error('🎲 Error starting game:', error);
      throw error;
    } finally {
      // Small delay before releasing the lock to prevent immediate retries
      setTimeout(() => {
        this.sessionCreationLock = false;
      }, 200);
    }
  }

  private async cleanupSession(sessionId: string) {
    try {
      console.log(`🎲 Cleaning up session: ${sessionId}`);
      await fetch(`/api/game/session/${sessionId}`, { method: 'DELETE' });
      console.log(`🎲 Session ${sessionId} cleanup completed`);
    } catch (error) {
      console.error('Failed to cleanup session:', error);
    }
  }

  reset() {
    const now = Date.now();
    if (now - this.lastResetTime < MIN_RESET_INTERVAL) {
      console.log('🎲 Reset attempted too quickly');
      return;
    }
    
    this.lastResetTime = now;
    
    if (this.gameState?.sessionId) {
      this.cleanupSession(this.gameState.sessionId)
        .catch(console.error)
        .finally(() => {
          // Always clear state after cleanup attempt
          setTimeout(() => {
            this.updateGameState(null);
            this.pendingGameStart = null;
            this.retryCount = 0;
            this.sessionCreationLock = false;
          }, SESSION_CLEANUP_TIMEOUT);
        });
    } else {
      this.updateGameState(null);
      this.pendingGameStart = null;
      this.retryCount = 0;
      this.sessionCreationLock = false;
    }
  }

  getCurrentState(): GameState | null {
    return this.gameState;
  }

  public async endGame(sessionId: string): Promise<void> {
    if (!this.gameState || this.gameState.sessionId !== sessionId) {
      return;
    }

    try {
      console.log(`🎲 Ending game session ${sessionId}${this.gameState.walletAddress ? ` for wallet: ${this.gameState.walletAddress}` : ''}`);
      
      // Before cleanup, process achievements if we have player data
      if (this.gameState.walletAddress) {
        try {
          console.log(`🎲 Processing achievements for wallet: ${this.gameState.walletAddress}`);
          
          // First verify all achievements for the wallet - this ensures everything is tracked properly
          const verifyResponse = await fetch('/api/verify-achievements?wallet=' + 
            encodeURIComponent(this.gameState.walletAddress));
          
          if (!verifyResponse.ok) {
            console.warn('Failed to verify all achievements');
          } else {
            const verifyResult = await verifyResponse.json();
            console.log('Achievement verification result:', verifyResult);
          }
          
          // Then get game results data
          const response = await fetch(`/api/game/session/${sessionId}/results`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
          });
          
          if (response.ok) {
            const gameResults = await response.json();
            const achievementService = AchievementService.getInstance();
            
            // Calculate game statistics
            const correctAnswers = gameResults.correctAnswers || 0;
            const totalQuestions = this.gameState.questions.length;
            const bestStreak = gameResults.bestStreak || 0;
            const category = gameResults.category || 'general';
            const averageResponseTime = gameResults.averageResponseTime || 3000;
            
            // Process achievements based on game results
            await achievementService.processGameEnd({
              userId: gameResults.userId,
              sessionId: parseInt(sessionId),
              category: category,
              correctAnswers: correctAnswers,
              totalQuestions: totalQuestions,
              bestStreak: bestStreak,
              averageResponseTime: averageResponseTime,
              startTime: new Date(this.gameState.startTime || Date.now() - 300000),
              endTime: new Date()
            });
            
            console.log('Processed achievements for game session:', sessionId);
          }
        } catch (error) {
          console.error('Failed to process achievements:', error);
        }
      }
      
      await this.cleanupSession(sessionId);
    } finally {
      this.updateGameState(null);
      this.pendingGameStart = null;
      this.retryCount = 0;
      this.sessionCreationLock = false;
    }
  }

  public getGameState(): GameState | null {
    return this.gameState;
  }
}

export default GameController;