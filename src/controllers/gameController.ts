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
const DEBUG_MODE = false; // Set to false to disable debug logging

// Debug logger - only logs when DEBUG_MODE is true
const debugLog = (...args: any[]) => {
  if (DEBUG_MODE) {
    console.log(...args);
  }
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
  }

  public static getInstance(): GameController {
    if (!GameController.instance) {
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
    
    debugLog('GameController: Emitting stateChange event with state:', newState ? 'Valid Game State' : 'Null');
    if (newState) {
      debugLog(`GameController: emitted state has sessionId: ${newState.sessionId} and ${newState.questions?.length || 0} questions`);
      
      // Additional logging for debug purposes
      if (previousSessionId !== newState.sessionId) {
        debugLog(`GameController: Session ID changed from ${previousSessionId || 'none'} to ${newState.sessionId}`);
      }
      
      // Force listeners to update with setTimeout to ensure proper event loop execution
      setTimeout(() => {
        this.emit('stateChange', newState);
      }, 0);
      
    } else if (hadPreviousState) {
      // If we're clearing state that previously existed, ensure we emit this change
      debugLog(`GameController: Clearing previous game state with session ID: ${previousSessionId}`);
      setTimeout(() => {
        this.emit('stateChange', null);
      }, 0);
    }
  }

  private async retryWithBackoff(response?: Response): Promise<Response> {
    if (this.retryCount >= MAX_RETRIES) {
      this.retryCount = 0;
      throw new Error('Maximum retry attempts reached');
    }
    
    let retryDelay = RETRY_DELAY * Math.pow(2, this.retryCount);
    
    if (response?.headers) {
      const serverRetryAfter = response.headers.get('Retry-After');
      if (serverRetryAfter) {
        retryDelay = Math.max(parseInt(serverRetryAfter) * 1000, retryDelay);
      }
    }
    
    retryDelay = Math.min(retryDelay, 10000);
    debugLog(`Retrying request after ${retryDelay}ms (attempt ${this.retryCount + 1}/${MAX_RETRIES})`);
    
    await new Promise(resolve => setTimeout(resolve, retryDelay));
    this.retryCount++;
    
    return fetch('/api/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });
  }

  async startGame(config: GameConfig): Promise<GameState> {
    try {
      if (this.sessionCreationLock) {
        console.warn('Session creation already in progress');
        if (this.gameState) {
          return this.gameState;
        } else {
          throw new Error('Game initialization in progress but no state available');
        }
      }
      
      this.sessionCreationLock = true;
      debugLog('GameController - Starting game with config:', 
                  `${config.questionCount} questions, category: ${config.category}, difficulty: ${config.difficulty}`);
      
      // Try to get from cache first
      const cacheKey = `game-state-${config.category}-${config.difficulty}-${config.questionCount}`;
      // Check if we should force a refresh (always on second game)
      const forceRefresh = true; // Always force refresh
      
      if (!forceRefresh && typeof window !== 'undefined') {
        try {
          const cachedState = localStorage.getItem(cacheKey);
          if (cachedState) {
            const parsedCache = JSON.parse(cachedState);
            // Only use cache if it's less than 5 minutes old
            if (Date.now() - parsedCache.timestamp < 300000 && 
                parsedCache.state?.questions?.length === config.questionCount) {
              debugLog('Using cached game state');
              const gameState = {
                ...parsedCache.state,
                walletAddress: config.walletAddress,
                startTime: Date.now()
              } as GameState;
              
              this.updateGameState(gameState);
              return gameState;
            }
          }
        } catch (cacheError) {
          console.warn('Cache error, continuing with API request:', cacheError);
        }
      }

      // Create session immediately when starting the game with retry logic
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        attempts++;
        debugLog(`Creating game session (attempt ${attempts}/${maxAttempts}) with wallet address:`, config.walletAddress);
        
        // Add request timeout - increased from 15s to 30s
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), SESSION_CREATION_TIMEOUT); 
        
        try {
          const response = await fetch('/api/game/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              category: config.category,
              questionCount: config.questionCount,
              difficulty: config.difficulty || 'mixed',
              walletAddress: config.walletAddress,
              forceRefresh: true, // Always force a refresh
              _t: Date.now() // Add timestamp to prevent caching
            }),
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorData = await response.json();
            if (attempts < maxAttempts) {
              console.log(`Session creation failed (attempt ${attempts}), retrying...`);
              await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
              continue;
            }
            throw new Error(errorData.error || 'Failed to create game session');
          }

          const data = await response.json();
          
          // Validate we have the correct number of questions
          if (!data.hasQuestions || !Array.isArray(data.questions) || data.questions.length !== config.questionCount) {
            if (attempts < maxAttempts) {
              console.log(`Received incorrect question count: ${data.questions?.length || 0} (attempt ${attempts}), retrying...`);
              await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
              continue;
            }
            throw new Error(`Expected ${config.questionCount} questions but received ${data.questions?.length || 0}`);
          }

          // Create game state with validated data
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
          
          console.log('Game session created successfully:', data.sessionId);
          debugLog(`Received ${gameState.questions.length} questions for the game`);
          
          // Don't cache game state anymore
          /*
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem(cacheKey, JSON.stringify({
                state: gameState,
                timestamp: Date.now()
              }));
            } catch (storageError) {
              console.warn('Failed to cache game state:', storageError);
            }
          }
          */
          
          // Update internal state right away
          this.gameState = gameState;
          
          // Emit state change event - use a very minimal timeout to ensure proper event loop handling
          setTimeout(() => {
            this.emit('stateChange', gameState);
            debugLog('GameController: State change event emitted after session creation');
          }, 10);
          
          return gameState;
        } catch (fetchError) {
          clearTimeout(timeoutId);
          
          if (fetchError.name === 'AbortError') {
            if (attempts < maxAttempts) {
              console.log(`Session creation timed out (attempt ${attempts}), retrying...`);
              await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
              continue;
            }
            throw new Error('Request timed out while creating game session');
          }
          throw fetchError;
        }
      }
      
      // If we get here, all attempts failed
      throw new Error(`Failed to create game session after ${maxAttempts} attempts`);

    } catch (error) {
      console.error('Error starting game:', error);
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
      debugLog(`Cleaning up session: ${sessionId}`);
      await fetch(`/api/game/session/${sessionId}`, { method: 'DELETE' });
      debugLog(`Session ${sessionId} cleanup completed`);
    } catch (error) {
      console.error('Failed to cleanup session:', error);
    }
  }

  reset() {
    const now = Date.now();
    if (now - this.lastResetTime < MIN_RESET_INTERVAL) {
      debugLog('Reset attempted too quickly');
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
      debugLog(`Ending game session ${sessionId}${this.gameState.walletAddress ? ` for wallet: ${this.gameState.walletAddress}` : ''}`);
      
      // Before cleanup, process achievements if we have player data
      if (this.gameState.walletAddress) {
        try {
          debugLog(`Processing achievements for wallet: ${this.gameState.walletAddress}`);
          
          // First verify all achievements for the wallet - this ensures everything is tracked properly
          const verifyResponse = await fetch('/api/verify-achievements?wallet=' + 
            encodeURIComponent(this.gameState.walletAddress));
          
          if (!verifyResponse.ok) {
            console.warn('Failed to verify all achievements');
          } else {
            const verifyResult = await verifyResponse.json();
            debugLog('Achievement verification result:', verifyResult);
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
            
            debugLog('Processed achievements for game session:', sessionId);
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