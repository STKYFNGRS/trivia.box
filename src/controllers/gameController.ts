// Add minimal changes to ensure the game controller events work correctly
import { GameOrchestrator } from '../services/gameOrchestrator';
import { GameQuestionService } from '../services/client/GameQuestionService';
import { AchievementService } from '@/services/achievements/AchievementService';
import { EventEmitter } from 'events';
import { GameState, GameConfig } from '@/types/game';
import { safelyStoreSessionData, safelyGetSessionData, isMobileDevice } from '@/utils/deviceDetect';

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
    
    // Try to restore game state from sessionStorage
    try {
      if (typeof window !== 'undefined') {
        const savedState = safelyGetSessionData<GameState | null>('triviabox_gamestate', null);
        if (savedState) {
          console.log('🎲 GameController: Found saved game state, attempting to restore');
          
          // Validate the state has required properties
          if (savedState.sessionId && savedState.questions && 
              Array.isArray(savedState.questions) && savedState.questions.length > 0) {
            console.log('🎲 GameController: Restored valid game state with session ID:', savedState.sessionId);
            
            // Extra logging for mobile devices
            if (isMobileDevice()) {
              console.log('🎲 GameController: Mobile device detected, ensuring proper state restoration');
            }
            
            this.gameState = savedState;
          } else {
            console.warn('🎲 GameController: Saved state was invalid, clearing it');
            sessionStorage.removeItem('triviabox_gamestate');
          }
        }
      }
    } catch (error) {
      console.error('🎲 GameController: Error restoring game state:', error);
      // Clear potentially corrupted state
      try {
        sessionStorage.removeItem('triviabox_gamestate');
      } catch (e) {
        // Ignore
      }
    }
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
    
    // Save current state to sessionStorage for persistence across refreshes
    if (newState) {
      // Detect mobile browsers for special handling
      const isMobile = isMobileDevice();
      if (isMobile) {
        console.log('🎲 GameController: Mobile device detected, using enhanced storage methods');
      }
      
      try {
        console.log('🎲 GameController: Persisting game state to sessionStorage');
        const success = safelyStoreSessionData('triviabox_gamestate', newState);
        if (!success && isMobile) {
          console.warn('🎲 GameController: Failed to persist state on mobile, trying alternative approach');
          // Fallback for problematic mobile browsers
          try {
            // Store minimal session info that's enough to reconnect
            const minimalState = {
              sessionId: newState.sessionId,
              walletAddress: newState.walletAddress
            };
            sessionStorage.setItem('triviabox_minimal_state', JSON.stringify(minimalState));
          } catch (fallbackErr) {
            console.warn('Even minimal state storage failed:', fallbackErr);
          }
        }
      } catch (err) {
        console.warn('Failed to persist game state:', err);
      }
    } else {
      // Clear stored state if we're setting to null
      try {
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('triviabox_gamestate');
          sessionStorage.removeItem('triviabox_minimal_state');
        }
      } catch (err) {
        console.warn('Failed to clear game state from sessionStorage:', err);
      }
    }
    
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

  /**
   * Attempt to recover a minimally stored session state - especially useful for mobile browsers
   */
  public async attemptSessionRecovery(): Promise<boolean> {
    if (this.gameState) {
      // We already have a game state, no need to recover
      return true;
    }
    
    try {
      if (typeof window === 'undefined') return false;
      
      // First check for full game state
      const savedState = safelyGetSessionData<GameState | null>('triviabox_gamestate', null);
      if (savedState && savedState.sessionId && savedState.questions && 
          Array.isArray(savedState.questions) && savedState.questions.length > 0) {
        console.log('🎲 GameController: Found full saved game state, restoring');
        this.gameState = savedState;
        this.emit('stateChange', savedState);
        return true;
      }
      
      // If no full state, try to find minimal state
      const minimalState = safelyGetSessionData<{sessionId: string, walletAddress?: string} | null>(
        'triviabox_minimal_state', 
        null
      );
      
      if (!minimalState || !minimalState.sessionId) {
        return false;
      }
      
      // Found minimal state, try to recover by fetching the session data
      console.log('🎲 GameController: Found minimal saved state, attempting recovery');
      
      const response = await fetch(`/api/game/session/${minimalState.sessionId}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        },
        cache: 'no-store'
      });
      
      if (!response.ok) {
        console.warn('🎲 Session recovery failed: Session not found or expired');
        sessionStorage.removeItem('triviabox_minimal_state');
        return false;
      }
      
      const sessionData = await response.json();
      if (!sessionData.questions || !Array.isArray(sessionData.questions) || 
          sessionData.questions.length === 0) {
        console.warn('🎲 Session recovery failed: Invalid session data received');
        sessionStorage.removeItem('triviabox_minimal_state');
        return false;
      }
      
      // Reconstruct game state
      const recoveredState: GameState = {
        sessionId: minimalState.sessionId,
        questions: sessionData.questions,
        gamePhase: 'playing',
        currentQuestionIndex: 0, // Will reset to the beginning - not ideal but workable
        timeRemaining: 15,
        score: 0,
        combo: 0,
        status: 'active',
        walletAddress: minimalState.walletAddress || '',
        startTime: Date.now()
      };
      
      console.log('🎲 GameController: Successfully recovered session');
      this.gameState = recoveredState;
      this.emit('stateChange', recoveredState);
      
      // Now store the full state to avoid future recovery needs
      safelyStoreSessionData('triviabox_gamestate', recoveredState);
      sessionStorage.removeItem('triviabox_minimal_state');
      
      return true;
    } catch (error) {
      console.error('🎲 Error during session recovery:', error);
      try {
        sessionStorage.removeItem('triviabox_minimal_state');
      } catch (e) {}
      return false;
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
            let errorDetails = '';
            try {
              errorData = JSON.parse(errorText);
              // Extract detailed error information if available
              if (errorData.errorDetails) {
                errorDetails = errorData.errorDetails;
                console.log('🎲 Server error details:', errorDetails);
              }
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