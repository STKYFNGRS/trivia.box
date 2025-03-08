'use client';
import React, { useEffect, useRef, useState } from 'react';

interface CyberTimerProps {
  timeLeft: number;
  duration: number;
  isActive: boolean;
  onTimeUpdate: (data: { remainingTime: number }) => void;
  onExpire: () => void;
}

export default function CyberTimer({ timeLeft, duration, isActive, onTimeUpdate, onExpire }: CyberTimerProps) {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const hasExpired = useRef(false);
  const [initialDelay, setInitialDelay] = useState(true);

  // Clear any previous timer and setup new one
  useEffect(() => {
    // Handle initial delay
    if (initialDelay && isActive) {
      const delayTimeout = setTimeout(() => {
        setInitialDelay(false);
      }, 250); // Reduced from 1000ms to 250ms (0.25 seconds)
      
      return () => clearTimeout(delayTimeout);
    }
    
    // Don't run timer during delay or if not active
    if (initialDelay || !isActive) {
      return;
    }
    
    // Clear any existing timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    
    // Don't start new timer if time is already up
    if (timeLeft <= 0) {
      if (!hasExpired.current) {
        hasExpired.current = true;
        onExpire();
      }
      return;
    }
    
    // Start new countdown timer
    timerRef.current = setInterval(() => {
      // Decrement time
      const newTimeLeft = Math.max(0, timeLeft - 0.1);
      onTimeUpdate({ remainingTime: newTimeLeft });
      
      // Check for expiration
      if (newTimeLeft <= 0 && !hasExpired.current) {
        hasExpired.current = true;
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
        onExpire();
      }
    }, 100);
    
    // Cleanup function
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [timeLeft, isActive, onTimeUpdate, onExpire, initialDelay]);
  
  // Reset expired flag when question changes
  useEffect(() => {
    if (timeLeft >= duration - 0.1) {
      hasExpired.current = false;
      setInitialDelay(true);
    }
  }, [timeLeft, duration]);

  // Calculate progress percentage
  const progress = initialDelay 
    ? 100 
    : Math.max(0, Math.min(100, (timeLeft / duration) * 100));

  return (
    <div className="w-full h-2 bg-gray-800/80 rounded-full overflow-hidden border border-amber-500/10 shadow-sm">
      <div 
        className="h-full bg-gradient-to-r from-yellow-500 to-orange-500 transition-all ease-linear duration-100"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}