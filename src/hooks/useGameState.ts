'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
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
const debugLog = (...args: any[]) => {
  console.log(...args); // Always log to make debugging easier
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
    console.log('🎮 useGameState: Setting up stateChange listener');
    
    // Create a handler that explicitly calls setGameState
    const handleStateChange = (newState: GameState | null) => {
      console.log('🎮 useGameState: Received state change event:', newState ? 'Valid Game State' : 'Null');
      if (newState) {
        console.log(`🎮 useGameState: received state has sessionId: ${newState.sessionId} and ${newState.questions?.length || 0} questions`);
        
        // Force state update immediately (no timeout)
        setGameState(newState);
        initializationComplete.current = true;
        console.log('🎮 useGameState: Game state updated successfully');
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
      console.log('🎮 useGameState: Found existing game state in controller');
      handleStateChange(currentState);
      
      // Handle mobile refresh case by showing a toast or notification
      if (typeof window !== 'undefined') {
        try {
          if (sessionStorage.getItem('triviabox_gamestate')) {
            console.log('🎮 useGameState: Detected restored game state after page refresh');
            // Here you could show a toast notification that the game was restored
          }
        } catch (e) {
          // Ignore errors with sessionStorage
        }
      }
    }
    
    return () => {
      console.log('🎮 useGameState: Removing stateChange listener');
      gameController.off('stateChange', handleStateChange);
    };
  }, [gameController]);

  // Attempt to recover session on mount, especially important for mobile browsers
  useEffect(() => {
    const attemptRecovery = async () => {
      if (!gameState && user) {
        console.log('🎮 useGameState: Attempting to recover session on page load/refresh');
        try {
          const recovered = await gameController.attemptSessionRecovery();
          if (recovered) {
            console.log('🎮 useGameState: Successfully recovered session after page refresh');
          }
        } catch (error) {
          console.error('🎮 useGameState: Error recovering session:', error);
        }
      }
    };
    
    attemptRecovery();
  }, [gameController, gameState, user]);

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
      console.log('🎮 Reset attempted too quickly');
      return;
    }

    console.log('🎮 Resetting game state...');
    lastResetTime.current = now;
    gameController.reset();
    setGameState(null);
    setError(null);
    initAttempts.current = 0;
    initializationComplete.current = false;
  }, [gameController]);

  // Key function for starting the game - direct implementation (no debounce)
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
    isMobile: mobileDetected
  };
}