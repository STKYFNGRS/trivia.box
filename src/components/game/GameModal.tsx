'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAccount, useDisconnect } from 'wagmi';

interface CyberTimerProps {
  timeLeft: number;
  duration: number;
}

const CyberTimer = ({ timeLeft, duration }: CyberTimerProps) => {
  const progress = (timeLeft / duration) * 100;
  const isLowTime = timeLeft <= 5;

  return (
    <div className="relative w-full h-1 mt-2 bg-black/20 rounded-full overflow-hidden">
      <div 
        className={`absolute left-0 top-0 h-full rounded-full transition-all duration-200 
          ${isLowTime ? 'bg-gradient-to-r from-red-500 via-orange-500 to-red-500 animate-pulse' : 'bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500'}
          ${isLowTime ? 'shadow-[0_0_15px_rgba(239,68,68,0.5)]' : 'shadow-[0_0_15px_rgba(59,130,246,0.5)]'}`}
        style={{ width: `${progress}%` }}
      />
    </div>
  );
};

interface CyberButtonProps {
  children: React.ReactNode;
  selected: boolean;
  correct: boolean;
  revealed: boolean;
  onClick: () => void;
}

const CyberButton = ({ children, selected, correct, revealed, onClick }: CyberButtonProps) => {
  let buttonClass = "w-full text-left px-4 sm:px-6 py-3 sm:py-4 rounded-lg relative overflow-hidden transition-all duration-300 ";
  let glowClass = "";
  let borderClass = "border border-white/10 hover:border-cyan-500/50 group";

  if (selected && !revealed) {
    buttonClass += "bg-cyan-500/10 ";
    glowClass = "shadow-[0_0_20px_rgba(6,182,212,0.3)] ";
    borderClass = "border border-cyan-500/50";
  } else if (revealed) {
    if (correct) {
      buttonClass += "bg-green-500/10 ";
      glowClass = "shadow-[0_0_20px_rgba(34,197,94,0.3)] ";
      borderClass = "border border-green-500/50";
    } else if (selected) {
      buttonClass += "bg-red-500/10 ";
      glowClass = "shadow-[0_0_20px_rgba(239,68,68,0.3)] ";
      borderClass = "border border-red-500/50";
    }
  }

  return (
    <button 
      onClick={onClick}
      className={`${buttonClass} ${glowClass} ${borderClass}`}
      disabled={revealed}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000" />
      <div className="relative z-10 flex items-center">
        <div className="flex-grow">
          <span className="text-base sm:text-lg font-medium text-white/90">{children}</span>
        </div>
        {revealed && correct && (
          <div className="text-green-400">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
        {revealed && selected && !correct && (
          <div className="text-red-400">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        )}
      </div>
    </button>
  );
};

interface ScoreIndicatorProps {
  score: number;
}

const ScoreIndicator = ({ score }: ScoreIndicatorProps) => (
  <div className="flex items-center gap-2 text-sm">
    <svg className="w-5 h-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
        d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
    <div className="bg-gradient-to-r from-yellow-500 to-orange-500 bg-clip-text text-transparent font-bold">
      {score} Points
    </div>
  </div>
);

export default function GameModal() {
  const { isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const [isOpen, setIsOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setTimeLeft(30);
    setSelectedAnswer(null);
    setRevealed(false);
    setScore(0);
    setCombo(0);
    disconnect();
  }, [disconnect]);

  useEffect(() => {
    if (isConnected) {
      setIsOpen(true);
      setTimeLeft(30);
      setSelectedAnswer(null);
      setRevealed(false);
    } else {
      handleClose();
    }
  }, [isConnected, handleClose]);

  useEffect(() => {
    if (!isOpen || revealed) return;
    
    let tickStarted = false;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 6 && !tickStarted) {
          tickStarted = true;
        }
        if (prev <= 1) {
          clearInterval(timer);
          setRevealed(true);
          setSelectedAnswer(null);
          setCombo(0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [isOpen, revealed]);

  const handleAnswer = (answer: string) => {
    if (revealed) return;
    setSelectedAnswer(answer);
    setRevealed(true);
    
    if (answer === correctAnswer) {
      const timeBonus = Math.floor(timeLeft * 3.33);
      const newCombo = combo + 1;
      const comboBonus = Math.floor(newCombo * 10);
      setScore(prev => prev + 100 + timeBonus + comboBonus);
      setCombo(newCombo);
    } else {
      setCombo(0);
    }
  };

  if (!isOpen) return null;

  const DURATION = 30;
  const correctAnswer = "Base";

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-40 p-2 sm:p-4">
      <div className="bg-[#0D1117]/90 w-full max-w-2xl rounded-2xl overflow-hidden border border-white/10">
        {/* Question Header */}
        <div className="relative px-4 sm:px-6 py-3 sm:py-4 border-b border-white/10 bg-gradient-to-r from-black/50 via-cyan-500/10 to-black/50">
          <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent" />
          <div className="relative flex justify-between items-center">
            <h3 className="text-base sm:text-lg font-semibold text-white/90">Daily Challenge</h3>
            <button 
              onClick={handleClose}
              className="text-white/50 hover:text-white/90 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <CyberTimer timeLeft={timeLeft} duration={DURATION} />
        </div>

        {/* Question Content */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
          <div className="space-y-2">
            <div className="text-sm text-cyan-400/80 uppercase tracking-wider font-medium">Question:</div>
            <p className="text-base sm:text-lg text-white/90">Which layer 2 blockchain is this game built on?</p>
          </div>

          <div className="grid gap-3">
            {["Arbitrum", "Optimism", "Base", "Polygon"].map((answer) => (
              <CyberButton
                key={answer}
                selected={selectedAnswer === answer}
                correct={answer === correctAnswer}
                revealed={revealed}
                onClick={() => handleAnswer(answer)}
              >
                {answer}
              </CyberButton>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-white/10 bg-gradient-to-r from-black/50 via-purple-500/10 to-black/50">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm">
                <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-cyan-400">
                  {timeLeft}s
                </div>
              </div>
              {combo > 1 && (
                <div className="flex items-center gap-2 text-sm">
                  <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                  </svg>
                  <div className="bg-gradient-to-r from-orange-400 to-red-400 bg-clip-text text-transparent font-bold">
                    {combo}x Combo!
                  </div>
                </div>
              )}
            </div>
            <ScoreIndicator score={score} />
          </div>
        </div>
      </div>
    </div>
  );
}