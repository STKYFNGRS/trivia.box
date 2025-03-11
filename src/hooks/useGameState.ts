'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { log } from '@/utils/logger';
import { useAccount } from 'wagmi';
import { modal } from '@/config/appkit';
import useSWR from 'swr';
import { GameController } from '@/controllers/gameController';
import type { GameState, GameConfig } from '@/types/game';
import { isMobileDevice } from '@/utils/deviceDetect';

// Configuration
const RESET_COOLDOWN = 500; // 0.5 seconds cooldown between resets
const INIT_COOLDOWN = 500; // Reduced from 1000ms to 500ms
const MAX_INIT_ATTEMPTS = 3;
const DEBUG_MODE = true; // Enable for better debugging

// Debug logger to track game initialization
const debugLog = (message: string, meta?: any) => {
  log.debug(message, { component: 'useGameState', meta });
};

export function useGameState() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { address: user } = useAccount();
  const gameController = useRef(new GameController()).current;
  const lastResetTime = useRef<number>(0);
  const lastInitTime = useRef<number>(0);
  const initAttempts = useRef(0);
  const initializationComplete = useRef(false);
  const [mobileDetected, setMobileDetected] = useState(false);

  // Detect mobile on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isMobile = isMobileDevice();
      setMobileDetected(isMobile);
      if (isMobile) {
        console.log('🎮 useGameState: Mobile device detected, enabling enhanced persistence');
      }
    }
  }, []);

  // Add a ref to directly track attempted initialization options
  const lastAttemptedOptions = useRef<Partial<GameConfig> | null>(null);

  // Subscribe to controller state changes with improved error handling
  useEffect(() => {
    log.debug('Setting up stateChange listener', { component: 'useGameState' });
    
    // Create a handler that explicitly calls setGameState
    const handleStateChange = (newState: GameState | null) => {
      log.debug('Received state change event', { 
        component: 'useGameState', 
        meta: { hasState: !!newState } 
      });
      if (newState) {
        log.debug('Game state details', { 
          component: 'useGameState',
          meta: { 
            sessionId: newState.sessionId, 
            questionCount: newState.questions?.length || 0 
          }
        });
        
        // Force state update immediately (no timeout)
        setGameState(newState);
        initializationComplete.current = true;
        log.debug('Game state updated successfully', { component: 'useGameState' });
      } else {
        // For null state updates
        setGameState(null);
      }
    };
    
    // Make sure we're properly listening for events
    gameController.on('stateChange', handleStateChange);
    
    // Check if we already have a state in the controller
    const currentState = gameController.getGameState();
    if (currentState) {
      log.debug('Found existing game state in controller', { component: 'useGameState' });
      handleStateChange(currentState);
      
      // Handle mobile refresh case by showing a toast or notification
      if (typeof window !== 'undefined') {
        try {
          if (sessionStorage.getItem('triviabox_gamestate')) {
            log.debug('Detected restored game state after page refresh', { component: 'useGameState' });
            // Here you could show a toast notification that the game was restored
          }
        } catch (e) {
          // Ignore errors with sessionStorage
        }
      }
    }
    
    return () => {
      log.debug('Removing stateChange listener', { component: 'useGameState' });
      gameController.off('stateChange', handleStateChange);
    };
  }, [gameController]);

  // Attempt to recover session on mount, especially important for mobile browsers
  useEffect(() => {
    const attemptRecovery = async () => {
      if (!gameState && user) {
        log.debug('Attempting to recover session on page load/refresh', { component: 'useGameState' });
        try {
          const recovered = await gameController.attemptSessionRecovery();
          if (recovered) {
            log.debug('Successfully recovered session after page refresh', { component: 'useGameState' });
          }
        } catch (error) {
          console.error('🎮 useGameState: Error recovering session:', error);
        }
      }
    };
    
    attemptRecovery();
  }, [gameController, gameState, user]);

  // Use SWR for efficient data fetching and caching - only fetch when user is connected
  const { data: stats, mutate: mutateStats } = useSWR(
    user ? `/api/scores/stats?wallet=${user}` : null,
    {
      revalidateOnFocus: true, // Changed from false to true to update on focus
      dedupingInterval: 10000, // Reduced from 60000 to 10000 (10 seconds) for more frequent updates
      revalidateIfStale: true, // Changed from false to true
      focusThrottleInterval: 5000, // Reduced from 120000 to 5000 (5 seconds)
      errorRetryCount: 2
    }
  );

  // Only fetch leaderboard when user is connected
  const { data: leaderboard, mutate: mutateLeaderboard } = useSWR(
    user ? '/api/scores/leaderboard' : null, 
    {
      revalidateOnFocus: true, // Changed from false to true
      dedupingInterval: 10000, // Reduced from 60000 to 10000 (10 seconds)
      revalidateIfStale: true, // Changed from false to true
      focusThrottleInterval: 5000, // Reduced from 120000 to 5000 (5 seconds)
      errorRetryCount: 2
    }
  );

  // Add a resetStateAndCleanup function that will cleanly reset everything without needing a page reload
  const resetStateAndCleanup = useCallback(() => {
    console.log('🎮 Performing complete game state cleanup');
    
    // Reset all state in a coordinated way
    try {
      // First reset the controller
      gameController.reset();
      
      // Then update React state
      setGameState(null);
      setError(null);
      setIsLoading(false);
      
      // Reset all refs
      initAttempts.current = 0;
      initializationComplete.current = false;
      lastAttemptedOptions.current = null;
      
      // Clear any localStorage/sessionStorage game data
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.removeItem('triviabox_gamestate');
          localStorage.removeItem('triviabox_current_session');
          
          // Trigger a refreshWalletStats event to update stats
          window.dispatchEvent(new CustomEvent('refreshWalletStats'));
          
          console.log('🎮 Game state cleanup complete - all state reset');
        } catch (storageError) {
          console.warn('Error clearing storage during cleanup:', storageError);
        }
      }
    } catch (error) {
      console.error('Error during game state cleanup:', error);
    }
  }, [gameController]);
  
  // Regular reset function (uses the new resetStateAndCleanup internally)
  const resetGame = useCallback(() => {
    const now = Date.now();
    if (now - lastResetTime.current < RESET_COOLDOWN) {
      console.log('🎮 Reset attempted too quickly');
      return;
    }

    console.log('🎮 Resetting game state...');
    lastResetTime.current = now;
    resetStateAndCleanup();
  }, [resetStateAndCleanup]);

  // Add event listener for game close events
  useEffect(() => {
    const handleGameClose = () => {
      console.log('🎮 Game close event received in useGameState');
      resetStateAndCleanup();
    };
    
    window.addEventListener('gameClose', handleGameClose);
    return () => window.removeEventListener('gameClose', handleGameClose);
  }, [resetStateAndCleanup]);
  const initGame = useCallback(async (options: Partial<GameConfig> = {}) => {
    if (isLoading) {
      console.log('🎮 Game initialization already in loading state');
      return;
    }
    
    // Store the attempted options for potential retry
    lastAttemptedOptions.current = options;
    console.log('🎮 Starting game with options:', {
      ...options,
      timestamp: new Date().toISOString()
    });
    
    // Reset initialization flag since we're explicitly trying to init a new game
    initializationComplete.current = false;
    
    try {
      console.log('🎮 Setting loading state to TRUE');
      setIsLoading(true);
      setError(null);
      
      // Initialize with abort controller for timeout protection
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log('🎮 Game initialization timeout - aborting');
        abortController.abort();
      }, 25000); // 25 second timeout - increased from 20s
      
      try {
        console.log('🎮 Calling gameController.startGame...');
        const startTime = performance.now();
        
        // Critical function call to start the game
        const newGameState = await gameController.startGame({
          questionCount: options.questionCount || 10,
          category: options.category,
          difficulty: options.difficulty || 'mixed',
          excludeQuestions: options.excludeQuestions || [],
          walletAddress: user || ''
        });
        
        const endTime = performance.now();
        console.log(`🎮 gameController.startGame completed in ${Math.round(endTime - startTime)}ms`);
        
        clearTimeout(timeoutId);
        
        if (!newGameState) {
          throw new Error('Game controller returned empty game state');
        }
        
        // Important: directly update React state
        console.log('🎮 Game initialization successful - Setting game state with:', {
          sessionId: newGameState.sessionId,
          questions: newGameState.questions?.length
        });
        
        // Important: Use a special flag to ensure code doesn't optimize this away
        const forceUpdate = true;
        if (forceUpdate) {
          setGameState(newGameState);
          initializationComplete.current = true;
          console.log('🎮 Game state successfully updated');
        }
        
      } catch (fetchError) {
        clearTimeout(timeoutId);
        console.error('🎮 Error in gameController.startGame:', fetchError);
        
        if (fetchError.name === 'AbortError') {
          throw new Error('Game initialization timed out. Please try again.');
        }
        throw fetchError;
      }
    } catch (error) {
      console.error('🎮 Game initialization failed:', error);
      setError(error instanceof Error ? error.message : 'Failed to initialize game');
      setGameState(null);
    } finally {
      console.log('🎮 Setting loading state to FALSE');
      setIsLoading(false);
    }
  }, [gameController, isLoading, user]);

  const submitScore = useCallback(async (score: number) => {
    if (!user) {
      try {
        await modal.open();
      } catch (error) {
        console.error('Failed to open connect modal:', error);
        return;
      }
      return;
    }

    try {
      // Use abort controller for timeout protection
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
      
      const response = await fetch('/api/scores', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          score,
          walletAddress: user
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error('Failed to submit score');
      }
    } catch (err) {
      console.error('Error submitting score:', err);
      if (err.name === 'AbortError') {
        setError('Score submission timed out. Please try again.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to submit score');
      }
    }
  }, [user]);

  return {
    gameState,
    isLoading,
    error,
    stats,
    leaderboard,
    initGame,
    resetGame,
    submitScore,
    isAuthenticated: !!user,
    isMobile: mobileDetected,
    // Add mutation functions for refreshing data
    refreshStats: () => mutateStats(),
    refreshLeaderboard: () => mutateLeaderboard() 
  };
}