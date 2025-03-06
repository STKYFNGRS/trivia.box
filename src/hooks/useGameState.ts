'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { modal } from '@/config/appkit';
import useSWR from 'swr';
import { GameController } from '@/controllers/gameController';
import type { GameState, GameConfig } from '@/types/game';

// Configuration
const RESET_COOLDOWN = 500; // 0.5 seconds cooldown between resets
const INIT_COOLDOWN = 1000; // 1 second cooldown between init attempts
const MAX_INIT_ATTEMPTS = 3;
const DEBUG_MODE = false; // Set to false to disable debug logging

// Debug logger - only logs when DEBUG_MODE is true
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

  // Subscribe to controller state changes
  useEffect(() => {
    debugLog('useGameState: Setting up stateChange listener');
    
    // Create a handler that explicitly calls setGameState
    const handleStateChange = (newState: GameState | null) => {
      debugLog('useGameState: Received state change event:', newState ? 'Valid Game State' : 'Null');
      if (newState) {
        debugLog(`useGameState: received state has sessionId: ${newState.sessionId} and ${newState.questions?.length || 0} questions`);
        
        // Force state update on the next microtask to ensure React processes it
        setTimeout(() => {
          setGameState(newState);
          initializationComplete.current = true;
        }, 0);
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
      debugLog('useGameState: Found existing game state in controller');
      handleStateChange(currentState);
    }
    
    return () => {
      debugLog('useGameState: Removing stateChange listener');
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
      debugLog('Reset attempted too quickly');
      return;
    }

    debugLog('Resetting game state...');
    lastResetTime.current = now;
    gameController.reset();
    setGameState(null);
    setError(null);
    initAttempts.current = 0;
    initializationComplete.current = false;
  }, [gameController]);

  const initGameUnbounced = useCallback(async (options: Partial<GameConfig> = {}) => {
    if (isLoading) {
      debugLog('Game initialization already in loading state');
      return;
    }
    
    // Reset initialization flag since we're explicitly trying to init a new game
    initializationComplete.current = false;
    
    const now = Date.now();
    if (now - lastInitTime.current < INIT_COOLDOWN) {
      debugLog('Initialization attempted too frequently, please wait');
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
      debugLog('Starting game initialization...');
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
        
        // Important: directly update our local state in addition to relying on the event
        setGameState(newGameState);
        initializationComplete.current = true;
        initAttempts.current = 0;
        debugLog('Game initialization successful with direct state update');
        
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

  // Use useMemo to create the debounced version of initGameUnbounced with a shorter delay
  const initGame = useMemo(
    () => debounce(initGameUnbounced, 100), // Reduce from 300ms to 100ms for more responsive feeling
    [initGameUnbounced]
  );

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