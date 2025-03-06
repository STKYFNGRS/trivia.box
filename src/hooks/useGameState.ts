'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { modal } from '@/config/appkit';
import useSWR from 'swr';
import { GameController } from '@/controllers/gameController';
import type { GameState, GameConfig } from '@/types/game';

// Configuration
const RESET_COOLDOWN = 500; // 0.5 seconds cooldown between resets
const INIT_COOLDOWN = 500; // Reduced from 1000ms to 500ms
const MAX_INIT_ATTEMPTS = 3;
const DEBUG_MODE = true; // Enable for better debugging

// Debug logger - logs to console regardless of DEBUG_MODE for critical functions
const debugLog = (...args: any[]) => {
  if (DEBUG_MODE) {
    console.log(...args);
  }
};

// Debounce implementation
function debounce<T extends (...args: any[]) => any>(func: T, wait: number) {
  let timeout: NodeJS.Timeout | null = null;
  return function(...args: Parameters<T>) {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      func(...args);
      timeout = null;
    }, wait);
  };
}

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

  // Add a ref to directly track attempted initialization options
  const lastAttemptedOptions = useRef<Partial<GameConfig> | null>(null);

  // Subscribe to controller state changes with improved error handling
  useEffect(() => {
    console.log('useGameState: Setting up stateChange listener');
    
    // Create a handler that explicitly calls setGameState
    const handleStateChange = (newState: GameState | null) => {
      console.log('useGameState: Received state change event:', newState ? 'Valid Game State' : 'Null');
      if (newState) {
        console.log(`useGameState: received state has sessionId: ${newState.sessionId} and ${newState.questions?.length || 0} questions`);
        
        // Force state update immediately (no timeout)
        setGameState(newState);
        initializationComplete.current = true;
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
      console.log('useGameState: Found existing game state in controller');
      handleStateChange(currentState);
    }
    
    return () => {
      console.log('useGameState: Removing stateChange listener');
      gameController.off('stateChange', handleStateChange);
    };
  }, [gameController]);

  // Use SWR for efficient data fetching and caching - only fetch when user is connected
  const { data: stats } = useSWR(
    user ? `/api/scores/stats?wallet=${user}` : null,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000, // 1 minute
      revalidateIfStale: false,
      focusThrottleInterval: 120000, // 2 minutes
      errorRetryCount: 2
    }
  );

  // Only fetch leaderboard when user is connected
  const { data: leaderboard } = useSWR(
    user ? '/api/scores/leaderboard' : null, 
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000, // 1 minute
      revalidateIfStale: false,
      focusThrottleInterval: 120000, // 2 minutes
      errorRetryCount: 2
    }
  );

  const resetGame = useCallback(() => {
    const now = Date.now();
    if (now - lastResetTime.current < RESET_COOLDOWN) {
      console.log('Reset attempted too quickly');
      return;
    }

    console.log('Resetting game state...');
    lastResetTime.current = now;
    gameController.reset();
    setGameState(null);
    setError(null);
    initAttempts.current = 0;
    initializationComplete.current = false;
  }, [gameController]);

  const initGameUnbounced = useCallback(async (options: Partial<GameConfig> = {}) => {
    if (isLoading) {
      console.log('Game initialization already in loading state');
      return;
    }
    
    // Store the attempted options for potential retry
    lastAttemptedOptions.current = options;
    console.log('Attempting to start game with options:', options);
    
    // Reset initialization flag since we're explicitly trying to init a new game
    initializationComplete.current = false;
    
    const now = Date.now();
    if (now - lastInitTime.current < INIT_COOLDOWN) {
      console.log('Initialization attempted too frequently, please wait');
      return;
    }

    // Reset attempt counter if it's been a while
    if (now - lastInitTime.current > 30000) {
      initAttempts.current = 0;
    }

    if (initAttempts.current >= MAX_INIT_ATTEMPTS) {
      setError('Please wait a moment before trying again');
      return;
    }

    try {
      console.log('Starting game initialization...');
      setIsLoading(true);
      setError(null);
      lastInitTime.current = now;
      initAttempts.current++;

      // Initialize with abort controller for timeout protection
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 20000); // 20 second timeout

      try {
        const newGameState = await gameController.startGame({
          questionCount: options.questionCount || 10,
          category: options.category,
          difficulty: options.difficulty || 'mixed',
          excludeQuestions: options.excludeQuestions || [],
          walletAddress: user || ''
        });

        clearTimeout(timeoutId);
        
        // Important: directly update React state - no more relying on events only
        console.log('Game initialization successful - DIRECTLY setting game state');
        setGameState(newGameState);
        initializationComplete.current = true;
        initAttempts.current = 0;
        
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          throw new Error('Game initialization timed out. Please try again.');
        }
        throw fetchError;
      }
    } catch (error) {
      console.error('Game initialization failed:', error);
      setError(error instanceof Error ? error.message : 'Failed to initialize game');
      setGameState(null);
    } finally {
      setIsLoading(false);
    }
  }, [gameController, isLoading, user]);

  // Use initGameUnbounced directly - no more debouncing which was causing issues
  const initGame = initGameUnbounced;

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
    isAuthenticated: !!user
  };
}