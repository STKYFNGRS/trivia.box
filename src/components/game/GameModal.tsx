'use client';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAccount } from 'wagmi';
import type { Question } from '@/types/question';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

// Configuration
const DEBUG_MODE = false; // Set to false to disable debug logging
const DURATION = 15;
const MAX_POINTS = 15;

// Debug logger - only logs when DEBUG_MODE is true
const debugLog = (...args: any[]) => {
  if (DEBUG_MODE) {
    console.log(...args);
  }
};

const CyberTimer = dynamic(() => import('./CyberTimer'));

interface GameModalProps {
  questions: Question[];
  sessionId: string;
  onClose: () => void;
  onGameComplete?: (score: number) => Promise<void>;
}

export default function GameModal({ questions, sessionId, onClose, onGameComplete }: GameModalProps) {
  const { address } = useAccount();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(DURATION);
  const [gameEnded, setGameEnded] = useState(false);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [gameBestStreak, setGameBestStreak] = useState(0);
  const [potentialPoints, setPotentialPoints] = useState(MAX_POINTS);
  const [isTimerActive, setIsTimerActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [finalStats, setFinalStats] = useState<{
    correctAnswers: number;
    totalQuestions: number;
    bestStreak: number;
    finalScore: number;
  } | null>(null);
  
  // Early initialization of ref to track ongoing submissions
  const isSubmitting = useRef(false);
  const questionStartTime = useRef<string>(new Date().toISOString());
  const isClosing = useRef(false);
  const sessionResponses = useRef<Array<{ isCorrect: boolean }>>([]);
  const hasLoggedRender = useRef(false);
  // Add the missing modalRef
  const modalRef = useRef<HTMLDivElement>(null);
  
  // Define current question and shuffled answers
  const currentQuestion = questions && currentQuestionIndex < questions.length
    ? questions[currentQuestionIndex]
    : null;
    
  const shuffledAnswers = useMemo(() => {
    if (!currentQuestion) return [];
    const answers = [currentQuestion.correct_answer, ...currentQuestion.incorrect_answers];
    return answers.sort(() => Math.random() - 0.5);
  }, [currentQuestion]);
  
  // Define submit answer function first as other hooks depend on it
  const submitAnswer = useCallback(async (answer: string | null) => {
    if (!currentQuestion || !address || !questions) return;
    
    try {
      // Block duplicate submissions
      if (isSubmitting.current || sessionResponses.current[currentQuestionIndex]) {
        console.warn('Preventing duplicate answer submission');
        return;
      }
      
      // Mark as submitting to prevent concurrent calls
      isSubmitting.current = true;
      
      debugLog(`Submitting answer for question ${currentQuestionIndex + 1}/${questions.length}`);
      const startSubmit = Date.now();
      
      const endTime = new Date().toISOString();
      const isLastQuestion = currentQuestionIndex + 1 >= questions.length;
      
      // Handle time-out case - ensure we have valid timing data
      // Force timeRemaining to exactly 0 for null answers (timeouts)
      const effectiveTimeLeft = answer === null ? 0 : Math.max(0, timeLeft); 
      const isCorrect = answer === currentQuestion.correct_answer;
      const pointsEarned = isCorrect ? effectiveTimeLeft : 0;
      const effectiveScore = score + pointsEarned;
      
      // Ensure valid timing data by using start and end timestamps that make sense
      const startDate = new Date(questionStartTime.current);
      const endDate = new Date(endTime);
      
      // Always use valid timing data:
      // 1. For timeouts: Force duration to be DURATION seconds
      // 2. For normal answers: Use actual timing but ensure it's valid
      let validStartTime = questionStartTime.current;
      let validEndTime = endTime;
      
      // Force timing to be valid for all submissions
      if (answer === null || endDate.getTime() - startDate.getTime() < 1000) {
        // For timeouts or very quick answers, ensure at least 1 second duration
        const adjustedStartDate = new Date(endDate.getTime() - (answer === null ? DURATION * 1000 : 1000));
        validStartTime = adjustedStartDate.toISOString();
      }
      
      console.log('Answer submission data:', { 
        answer,
        startTime: validStartTime,
        endTime: validEndTime,
        timeRemaining: effectiveTimeLeft,
        pointsEarned,
        newScore: effectiveScore,
        isCorrect
      });
      
      const payload = {
        questionId: currentQuestion.id,
        sessionId: parseInt(sessionId),
        answer,
        startTime: validStartTime,
        endTime: validEndTime,
        walletAddress: address,
        isLastQuestion,
        timeRemaining: effectiveTimeLeft,
        finalStats: isLastQuestion ? {
          bestStreak: Math.max(gameBestStreak, currentStreak + (isCorrect ? 1 : 0)),
          finalScore: effectiveScore
        } : undefined
      };
      
      // Set up request with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
      
      // Retry logic for API calls
      let retries = 2;
      let response;
      let result;
      
      while (retries >= 0) {
        try {
          response = await fetch('/api/scores', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
          });
          
          // First check the response content type
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('text/html')) {
            // This is likely an error page, not JSON
            console.error('Received HTML response instead of JSON. Server may be returning an error page.');
            const htmlContent = await response.text();
            console.log('HTML error preview:', htmlContent.substring(0, 200) + '...');
            throw new Error('Server returned HTML instead of JSON. API endpoint may be unavailable.');
          }
          
          if (response.ok) {
            try {
              result = await response.json();
              break; // Success, exit retry loop
            } catch (jsonError) {
              console.error('JSON parsing error:', jsonError);
              throw new Error('Failed to parse server response');
            }
          } else {
            try {
              const errorData = await response.json();
              console.error(`API error (attempt ${2-retries}/2):`, errorData);
              retries--;
              if (retries < 0) {
                throw new Error(errorData.error || 'Failed to submit answer');
              }
            } catch (jsonError) {
              console.error('Failed to parse error response:', jsonError);
              // Still retry even if we can't parse the error
              retries--;
              if (retries < 0) {
                throw new Error('Server returned invalid JSON error response');
              }
            }
            // Wait before retrying
            await new Promise(res => setTimeout(res, 1000));
          }
        } catch (fetchError) {
          console.error(`Fetch error (attempt ${2-retries}/2):`, fetchError);
          retries--;
          if (retries < 0) {
            throw fetchError;
          }
          // Wait before retrying
          await new Promise(res => setTimeout(res, 1000));
        }
      }
      
      clearTimeout(timeoutId);
      
      if (!result) {
        throw new Error('Failed to get valid response from server');
      }
      
      const submitDuration = Date.now() - startSubmit;
      debugLog(`Answer submitted successfully in ${submitDuration}ms`);
      
      // Update local state with server response
      sessionResponses.current[currentQuestionIndex] = {
        isCorrect: result.isCorrect
      };
      
      // Use the points from the server if available, otherwise use our calculation
      const pointsFromServer = result.score?.points || pointsEarned;
      const newScore = score + pointsFromServer;
      
      console.log('Server response:', {
        isCorrect: result.isCorrect, 
        points: pointsFromServer,
        newScore
      });
      
      setScore(newScore);
      
      // Update streak
      const newCurrentStreak = result.isCorrect ? currentStreak + 1 : 0;
      setCurrentStreak(newCurrentStreak);
      setGameBestStreak(Math.max(gameBestStreak, newCurrentStreak));
      
      try {
        // Only move to next question after all processing is complete
        const moveDelay = Math.max(2000 - submitDuration, 1000); // At least 1 second delay
        debugLog(`Moving to next question in ${moveDelay}ms`);
        
        setTimeout(() => {
          if (isLastQuestion) {
            debugLog('Game ended, showing final stats');
            setGameEnded(true);
            const correctAnswers = sessionResponses.current.filter(r => r?.isCorrect).length;
            setFinalStats({
              correctAnswers,
              totalQuestions: questions.length,
              bestStreak: Math.max(gameBestStreak, newCurrentStreak),
              finalScore: newScore
            });
          } else {
            debugLog(`Moving to question ${currentQuestionIndex + 2}/${questions.length}`);
            // Move to next question
            if (currentQuestionIndex + 1 >= questions.length) {
              setGameEnded(true);
            } else {
              setCurrentQuestionIndex(prev => prev + 1);
              setRevealed(false);
              setSelectedAnswer(null);
              setTimeLeft(DURATION);
              setPotentialPoints(MAX_POINTS);
              setIsTimerActive(true);
              questionStartTime.current = new Date().toISOString();
            }
          }
        }, moveDelay);
      } catch (moveError) {
        console.error('Error during question transition:', moveError);
      }
    } catch (error) {
      console.error('Error submitting answer:', error);
      if (error.name === 'AbortError') {
        setError('Request timed out. Please try again.');
      } else {
        setError(error instanceof Error ? error.message : 'Failed to submit answer');
      }
    } finally {
      // Reset submission flag when done
      isSubmitting.current = false;
    }
  }, [address, currentQuestion, currentQuestionIndex, questions, sessionId, gameBestStreak, currentStreak, score, timeLeft]);
  
  // Handle timer updates with proper error handling and reduced update frequency
  const handleTimeUpdate = useCallback(({ remainingTime }: { remainingTime: number }) => {
    if (revealed) return; // Don't update if already revealed
    
    try {
      // Only update UI for whole number changes to avoid too many renders
      const roundedNew = Math.ceil(remainingTime);
      const roundedCurrent = Math.ceil(timeLeft);
      
      if (roundedNew !== roundedCurrent) {
        setPotentialPoints(Math.max(0, roundedNew));
      }
      
      // Always update actual timeLeft for accurate scoring
      setTimeLeft(Math.max(0, remainingTime));
    } catch (error) {
      console.error('Error updating time:', error);
    }
  }, [revealed, timeLeft]);
  
  // Handle timer expiration with improved error handling
  const handleTimeExpire = useCallback(() => {
    if (revealed) return;
    
    console.log('Timer expired, submitting null answer');
    setRevealed(true);
    setIsTimerActive(false);
    setTimeLeft(0);
    setPotentialPoints(0);
    
    try {
      // Submit a null answer immediately with no delay
      submitAnswer(null);
    } catch (error) {
      console.error('Error in timer expiration handler:', error);
      setError('Timer expiration error');
    }
  }, [revealed, submitAnswer]);
  
  // Handle selecting an answer with proper error handling
  const handleAnswerSelect = useCallback(async (answer: string) => {
    if (revealed || !isTimerActive || gameEnded || isSubmitting.current) return;
    
    try {
      // First update UI state
      setRevealed(true);
      setIsTimerActive(false);
      setSelectedAnswer(answer);
      
      // Then submit the answer
      await submitAnswer(answer);
    } catch (error) {
      console.error('Error selecting answer:', error);
      setError('Failed to submit answer');
    }
  }, [revealed, isTimerActive, gameEnded, submitAnswer]);
  
  const handleGameCompletion = useCallback(async () => {
    if (!isClosing.current && finalStats) {
      try {
        isClosing.current = true;
        debugLog('Completing game and processing achievements');
        
        if (address) {
          try {
            debugLog('Sending game completion request for wallet:', address);
            // Add timeout protection
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);
            
            // Explicitly save connection state before API call
            // This helps with mobile browsers that might lose connection after the call
            if (typeof window !== 'undefined') {
              try {
                const isMobile = window.innerWidth <= 768 || 
                                /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                
                if (isMobile) {
                  console.log('Mobile device detected, saving wallet state before completion API call');
                  // Get current wallet state from wagmi for more reliable state preservation
                  const wagmiState = window.localStorage.getItem('wagmi.store');
                  const wagmiData = wagmiState ? JSON.parse(wagmiState) : null;
                  
                  if (wagmiData?.state?.connections?.[0]?.accounts?.[0]) {
                    const connectedAccount = wagmiData.state.connections[0].accounts[0];
                    const chainId = wagmiData.state.connections[0].chains?.[0]?.id || 8453;
                    
                    // Import dynamically to avoid circular dependencies
                    const { saveConnectionState } = await import('@/utils/persistConnection');
                    saveConnectionState(connectedAccount, chainId);
                    console.log('Mobile wallet state saved before game completion:', connectedAccount.slice(0, 6) + '...');
                  }
                }
              } catch (stateErr) {
                console.error('Error saving wallet state before completion:', stateErr);
              }
            }
            
            // Use the dedicated game completion endpoint
            const completeResponse = await fetch('/api/game/complete', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
              },
              body: JSON.stringify({
                sessionId: sessionId,
                walletAddress: address,
                finalScore: finalStats.finalScore,
                correctAnswers: finalStats.correctAnswers,
                totalQuestions: finalStats.totalQuestions,
                bestStreak: finalStats.bestStreak
              }),
              signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            // Check for HTML response which indicates error
            const contentType = completeResponse.headers.get('content-type');
            if (contentType && contentType.includes('text/html')) {
              console.error('Received HTML response instead of JSON. Server may be returning an error page.');
              const htmlContent = await completeResponse.text();
              console.log('HTML error preview:', htmlContent.substring(0, 200) + '...');
              throw new Error('Server returned HTML instead of JSON');
            }
            
            if (completeResponse.ok) {
              const result = await completeResponse.json();
              debugLog('Game completion successful:', result);
              
              // Clear any cached stats to ensure fresh data
              if (typeof localStorage !== 'undefined') {
                const cacheKeys = Object.keys(localStorage);
                cacheKeys.forEach(key => {
                  if (key.startsWith('trivia-user-stats') || key.startsWith('trivia-leaderboard')) {
                    console.log('Clearing cached stats:', key);
                    localStorage.removeItem(key);
                  }
                });
              }
              
              // Force the app to refresh stats
              console.log('Triggering stats refresh after game completion');
              window.dispatchEvent(new CustomEvent('refreshWalletStats'));
            } else {
              console.warn('Game completion API returned error status:', completeResponse.status);
              // Continue even if completion API fails - we don't want to block the user
            }
          } catch (completeError) {
            // Log but don't block game completion if the API fails
            console.error('Error during game completion API call:', completeError);
          }
        }
        
        // Explicitly refresh leaderboard data before completing game
        try {
          console.log('Refreshing leaderboard data...');
          const leaderboardController = new AbortController();
          const leaderboardTimeoutId = setTimeout(() => leaderboardController.abort(), 5000);
          
          // Fetch leaderboard data to trigger a refresh
          await fetch('/api/scores/leaderboard', { 
            method: 'GET',
            headers: { 'Cache-Control': 'no-cache' },
            signal: leaderboardController.signal
          });
          
          clearTimeout(leaderboardTimeoutId);
          console.log('Leaderboard data refreshed');
        } catch (leaderboardError) {
          // Don't block game completion if leaderboard refresh fails
          console.warn('Failed to refresh leaderboard:', leaderboardError);
        }
        
        if (onGameComplete) {
          debugLog(`Submitting final score: ${finalStats.finalScore}`);
          await onGameComplete(finalStats.finalScore);
        }
        
        // Dispatch event to notify of game completion to preserve wallet connection
        if (typeof window !== 'undefined') {
          console.log('Dispatching gameCompleted event for connection persistence');
          window.dispatchEvent(new CustomEvent('gameCompleted', {
            detail: {
              finalScore: finalStats.finalScore,
              address: address,
              chainId: 8453,
              timestamp: Date.now()
            }
          }));
        }
        
        // Final mobile-specific wallet state persistence attempt
        try {
          if (typeof window !== 'undefined' && address) {
            const isMobile = window.innerWidth <= 768 || 
                          /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            
            if (isMobile) {
              // Dynamic import to avoid circular dependencies
              const { markConnectionRestored } = await import('@/utils/persistConnection');
              markConnectionRestored();
              
              // Additional mobile protection - save address in session storage with multiple methods
              sessionStorage.setItem('last_connected_address', address);
              sessionStorage.setItem('last_connection_time', Date.now().toString());
              
              // Add some app-specific details that may help with state reconstruction
              try {
                const mobileStateBackup = {
                  address: address,
                  timestamp: Date.now(),
                  appVersion: '1.0',
                  appName: 'TriviaBox',
                  lastAction: 'gameCompleted',
                  score: finalStats.finalScore
                };
                sessionStorage.setItem('triviabox_mobile_state', JSON.stringify(mobileStateBackup));
              } catch (sessionErr) {
                console.warn('Could not save additional mobile state backup', sessionErr);
              }
            }
          }
        } catch (mobileErr) {
          console.error('Error during mobile-specific connection handling:', mobileErr);
        }
        
        debugLog('Game completed successfully, closing modal');
        
        // Use a clean approach to reset the game state without forcing a page reload
        // This prevents the "Reload site?" message
        setTimeout(() => {
          // Reset the game state instead of forcing a page reload
          if (typeof window !== 'undefined') {
            // Dispatch event for state reset in parent components
            window.dispatchEvent(new CustomEvent('resetGameState'));
            // Call onClose without forcing a page reload
            onClose();
          }
        }, 300);
      } catch (error) {
        console.error('Error during game completion:', error);
        setError('Failed to complete game');
        isClosing.current = false;
      }
    }
  }, [address, finalStats, onClose, onGameComplete, sessionId]);
  
  // Update state when question changes
  useEffect(() => {
    if (!questions?.length || currentQuestionIndex >= questions.length) return;
    
    // Reset all question-related state
    setRevealed(false);
    setSelectedAnswer(null);
    setTimeLeft(DURATION);
    setIsTimerActive(true);
    setPotentialPoints(MAX_POINTS);
    isSubmitting.current = false; // Reset submission tracking
    questionStartTime.current = new Date().toISOString();
    
    // For debugging purposes - log that we're displaying a question
    debugLog(`Displaying question ${currentQuestionIndex + 1}/${questions.length}`);
    
    // Save current connection state during the game to help with mobile persistence
    if (address && typeof window !== 'undefined') {
      try {
        const isMobile = window.innerWidth <= 768 || 
                        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                        
        if (isMobile && currentQuestionIndex % 3 === 0) { // Every 3 questions for mobile
          import('@/utils/persistConnection').then(({ saveConnectionState }) => {
            saveConnectionState(address, 8453);
          }).catch(err => console.warn('Could not save connection state during game:', err));
        }
      } catch (err) {
        console.warn('Error checking for mobile device during game:', err);
      }
    }
    
    // Focus trap - ensure keyboard focus is within the game modal
    setTimeout(() => {
      if (modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length > 0) {
          (focusableElements[0] as HTMLElement).focus();
        }
      }
    }, 100);
  }, [currentQuestionIndex, questions, address]);
  
  useEffect(() => {
    if (!gameEnded) return;
    setIsTimerActive(false);
  }, [gameEnded]);
  
  // Early return if required props are missing
  if (!questions?.length || !sessionId) {
    console.warn('Required props missing for GameModal - Questions:', questions?.length, 'SessionID:', sessionId);
    return null;
  }
  
  // Log only once per session to avoid console spam
  if (!hasLoggedRender.current) {
    debugLog('Rendering GameModal with session:', sessionId, 'and questions:', questions.length);
    hasLoggedRender.current = true;
  }
  
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <motion.div
          key="game-modal-panel"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-5xl mt-8 mb-8 pt-8 md:pt-10 md:mt-24"
          ref={modalRef}
        >
          <div className="rounded-2xl bg-gradient-to-br from-gray-900/90 to-gray-800/90 p-8 border border-amber-500/20 overflow-hidden flex flex-col">
            {error ? (
              <div className="text-center p-8">
                <h2 className="text-xl font-bold mb-4 text-red-500">{error}</h2>
              </div>
            ) : gameEnded ? (
              <div className="text-center p-4">
                <h2 className="text-2xl font-bold text-white mb-6">Game Complete!</h2>
                
                {finalStats && (
                  <div className="space-y-4 mb-8">
                    <p className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-600">Final Score: {finalStats.finalScore}</p>
                    
                <div className="flex items-center justify-center gap-4 mb-4 flex-wrap sm:flex-nowrap">
                  <div className="sm:w-1/3 w-full p-4 rounded-xl border border-blue-500/30 bg-gradient-to-br from-blue-900/30 to-blue-800/20 hover:shadow-md hover:shadow-blue-500/10 transition-all mb-2 sm:mb-0">
                    <p className="text-gray-300 mb-1 text-center">Correct Answers</p>
                    <p className="text-xl font-bold text-white text-center">
                      {finalStats.correctAnswers}/{finalStats.totalQuestions}
                    </p>
                  </div>
                  <div className="sm:w-1/3 w-full p-4 rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-900/30 to-amber-800/20 hover:shadow-md hover:shadow-amber-500/10 transition-all mb-2 sm:mb-0">
                    <p className="text-gray-300 mb-1 text-center">Game Best Streak</p>
                    <p className="text-xl font-bold text-orange-400 text-center">
                      {finalStats.bestStreak}<span className="ml-1">🔥</span>
                    </p>
                  </div>
                  <div className="sm:w-1/3 w-full p-4 rounded-xl border border-green-500/30 bg-gradient-to-br from-green-900/30 to-green-800/20 hover:shadow-md hover:shadow-green-500/10 transition-all">
                    <p className="text-gray-300 mb-1 text-center">Points Earned</p>
                    <p className="text-xl font-bold text-green-400 text-center">
                      +{finalStats.finalScore}
                    </p>
                  </div>
                </div>
                  </div>
                )}
                
                <button
                  onClick={handleGameCompletion}
                  className="relative px-8 py-4 rounded-lg font-bold transition-all bg-gradient-to-r from-amber-600 to-orange-600 text-gray-900 shadow-lg shadow-amber-600/20 hover:transform hover:scale-105 hover:shadow-lg hover:shadow-amber-600/30 border border-amber-500/40"
                >
                  {/* Reflective highlight effect */}
                  <span className="absolute top-0 left-0 right-0 h-1/3 bg-gradient-to-b from-white/30 to-transparent pointer-events-none"></span>
                  <span className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/30 to-transparent pointer-events-none"></span>
                  <div className="flex items-center gap-2">
                    <ArrowRight className="h-5 w-5" />
                    <span>Continue</span>
                  </div>
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="text-sm xs:text-base text-gray-200 py-2 px-4 bg-gray-800/60 rounded-lg border border-gray-700/40 inline-block shadow-sm">
                  Question {currentQuestionIndex + 1} of {questions.length}
                </div>
                {!gameEnded && currentQuestion && (
                  <>
                    <div className="w-full xs:w-full mb-2">
                      <CyberTimer
                        timeLeft={timeLeft}
                        duration={DURATION}
                        isActive={isTimerActive}
                        onTimeUpdate={handleTimeUpdate}
                        onExpire={handleTimeExpire}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between mb-4 gap-2 flex-wrap sm:flex-nowrap">
                      <div className="sm:w-1/3 w-full mb-2 sm:mb-0">
                        <div className="text-gray-300 py-2 px-4 bg-green-900/20 rounded-lg border border-green-500/30 inline-block sm:text-sm text-xs">
                          Points Available: <span className="font-bold text-green-400">{potentialPoints}</span>
                        </div>
                      </div>
                      
                      {/* Score display - always visible and centered */}
                      <div className="sm:w-1/3 w-full mb-2 sm:mb-0 flex sm:justify-center justify-start">
                        <div className="text-gray-300 py-2 px-4 bg-blue-900/20 rounded-lg border border-blue-500/30 inline-block sm:text-sm text-xs">
                          Score: <span className="font-bold text-amber-400">{score}</span>
                        </div>
                      </div>
                      
                      {/* Show streak if present - always on the right, or empty placeholder */}
                      <div className="sm:w-1/3 w-full flex sm:justify-end justify-start">
                        {currentStreak > 0 && (
                          <div className="text-orange-400 font-bold flex items-center gap-1 py-2 px-4 bg-amber-900/20 rounded-lg border border-amber-500/30 sm:text-sm text-xs">
                            <span>Streak:</span> {currentStreak}<span className="ml-0.5">🔥</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="bg-gray-800/60 p-5 rounded-xl border border-gray-700/40 mb-4 md:mb-6 shadow-md">
                      <h3 className="text-base xs:text-lg md:text-xl text-white">{currentQuestion.content}</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-4">
                      {shuffledAnswers.map((answer, index) => (
                        <button
                          key={`${currentQuestionIndex}-${index}`}
                          onClick={() => handleAnswerSelect(answer)}
                          disabled={revealed}
                          className={`
                            w-full p-4 text-left rounded-xl transition-all duration-300 shadow-sm
                            ${revealed
                              ? answer === currentQuestion.correct_answer
                                ? 'bg-gradient-to-br from-green-600/80 to-green-700/80 text-white shadow-lg shadow-green-500/20 transform scale-105 border border-green-400/30'
                                : answer === selectedAnswer
                                  ? 'bg-gradient-to-br from-red-600/80 to-red-700/80 text-white shadow-lg shadow-red-500/20 border border-red-400/30'
                                  : 'bg-gray-800/60 text-gray-400 border border-gray-700/40'
                              : 'bg-gray-800/60 hover:bg-gray-700/60 hover:shadow-md hover:shadow-amber-500/5 hover:translate-y-[-2px] hover:scale-[1.01] text-gray-200 active:scale-[0.99] border border-gray-700/40 hover:border-gray-600/40'
                            }
                          `}
                        >
                          {answer}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}