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
          
          if (response.ok) {
            result = await response.json();
            break; // Success, exit retry loop
          } else {
            const errorData = await response.json();
            console.error(`API error (attempt ${2-retries}/2):`, errorData);
            retries--;
            if (retries < 0) {
              throw new Error(errorData.error || 'Failed to submit answer');
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
        
        // Verify achievements before game completion
        if (address) {
          try {
            debugLog('Verifying achievements for wallet:', address);
            // Add timeout protection
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            const verifyResponse = await fetch(`/api/verify-achievements?wallet=${address}`, {
              signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (verifyResponse.ok) {
              const verifyResult = await verifyResponse.json();
              debugLog('Achievement verification result:', verifyResult);
            } else {
              console.warn('Failed to verify achievements during game completion');
            }
          } catch (verifyError) {
            // Don't block game completion if achievement verification fails
            console.error('Error verifying achievements:', verifyError);
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
        
        debugLog('Game completed successfully, closing modal');
        
        // Short delay to ensure all data is processed before closing
        setTimeout(() => {
          onClose();
        }, 300);
      } catch (error) {
        console.error('Error during game completion:', error);
        setError('Failed to complete game');
        isClosing.current = false;
      }
    }
  }, [address, finalStats, onClose, onGameComplete]);
  
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
  }, [currentQuestionIndex, questions?.length]);
  
  // Initialize the game session as soon as the component mounts
  useEffect(() => {
    if (!sessionId || !questions?.length) return;
    
    debugLog(`Game modal initialized with session ID: ${sessionId}`);
    debugLog(`Starting game with ${questions.length} questions`);
    
    // Set the initial timer and first question immediately
    questionStartTime.current = new Date().toISOString();
    
    // Force a state update to ensure the component renders properly
    setTimeLeft(DURATION);
    setPotentialPoints(MAX_POINTS);
    
    // Make sure component is visible in DOM
    setTimeout(() => {
      const modalElement = document.querySelector('.fixed.inset-0.z-50');
      if (modalElement) {
        debugLog('Game modal element is in DOM and visible');
        modalElement.classList.add('force-visible');
      } else {
        console.warn('Game modal element not found in DOM');
      }
    }, 300);
  }, [sessionId, questions?.length]);
  
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
        >
          <div className="rounded-2xl bg-gray-900/90 p-8 border border-amber-500/20 overflow-hidden flex flex-col">
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
                    
                    <div className="flex items-center justify-center gap-4 mb-4">
                      <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/20 p-4 rounded-xl border border-blue-500/40 hover:shadow-md hover:shadow-blue-500/10 transition-all w-1/3">
                        <p className="text-gray-300 mb-1 text-center">Correct Answers</p>
                        <p className="text-xl font-bold text-white text-center">
                          {finalStats.correctAnswers}/{finalStats.totalQuestions}
                        </p>
                      </div>
                      <div className="bg-gradient-to-br from-amber-900/30 to-amber-800/20 p-4 rounded-xl border border-amber-500/40 hover:shadow-md hover:shadow-amber-500/10 transition-all w-1/3">
                        <p className="text-gray-300 mb-1 text-center">Game Best Streak</p>
                        <p className="text-xl font-bold text-orange-400 text-center">
                          {finalStats.bestStreak}<span className="ml-1">🔥</span>
                        </p>
                      </div>
                      <div className="bg-gradient-to-br from-green-900/30 to-green-800/20 p-4 rounded-xl border border-green-500/40 hover:shadow-md hover:shadow-green-500/10 transition-all w-1/3">
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
                <div className="text-sm xs:text-base text-gray-200 py-1 px-3 bg-gray-800/50 rounded-full border border-gray-700/40 inline-block">
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
                    
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-1/3">
                        <div className="text-gray-300 py-1 px-3 bg-green-900/20 rounded-full border border-green-500/30 inline-block">
                          Points Available: <span className="font-bold text-green-400">{potentialPoints}</span>
                        </div>
                      </div>
                      
                      {/* Score display - always visible and centered */}
                      <div className="w-1/3 flex justify-center">
                        <div className="text-gray-300 py-1 px-3 bg-blue-900/20 rounded-full border border-blue-500/30 inline-block">
                          Score: <span className="font-bold text-amber-400">{score}</span>
                        </div>
                      </div>
                      
                      {/* Show streak if present - always on the right, or empty placeholder */}
                      <div className="w-1/3 flex justify-end">
                        {currentStreak > 0 && (
                          <div className="text-orange-400 font-bold flex items-center gap-1 py-1 px-3 bg-amber-900/20 rounded-full border border-amber-500/30">
                            <span>Streak:</span> {currentStreak}<span className="ml-0.5">🔥</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="bg-gray-800/50 p-4 rounded-xl border border-blue-500/20 mb-4 md:mb-6">
                      <h3 className="text-base xs:text-lg md:text-xl text-gray-200">{currentQuestion.content}</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-4">
                      {shuffledAnswers.map((answer, index) => (
                        <button
                          key={`${currentQuestionIndex}-${index}`}
                          onClick={() => handleAnswerSelect(answer)}
                          disabled={revealed}
                          className={`
                            w-full p-4 text-left rounded-xl transition-all duration-300
                            ${revealed
                              ? answer === currentQuestion.correct_answer
                                ? 'bg-gradient-to-br from-green-600/80 to-green-700/80 text-white shadow-lg shadow-green-500/20 transform scale-105 border border-green-400/30'
                                : answer === selectedAnswer
                                  ? 'bg-gradient-to-br from-red-600/80 to-red-700/80 text-white shadow-lg shadow-red-500/20 border border-red-400/30'
                                  : 'bg-gray-800/50 text-gray-400 border border-gray-700/20'
                              : 'bg-gray-800/50 hover:bg-gray-800/70 hover:shadow-lg hover:shadow-amber-500/10 hover:translate-y-[-2px] hover:scale-[1.01] text-gray-300 active:scale-[0.99] border border-gray-700/20 hover:border-gray-700/30'
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