'use client';
import React, { useEffect, useRef } from 'react';

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

  useEffect(() => {
    // Reset expired flag when timer is reset
    if (timeLeft >= duration - 0.1) {
      hasExpired.current = false;
    }
  }, [timeLeft, duration]);

  useEffect(() => {
    // Clear any existing timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Don't set a new timer if inactive or time is up
    if (!isActive || timeLeft <= 0) {
      return;
    }

    // Set a new timer
    timerRef.current = setInterval(() => {
      const newTime = Math.max(0, timeLeft - 0.1);
      onTimeUpdate({ remainingTime: newTime });
      
      // Check if time is up
      if (newTime <= 0 && !hasExpired.current) {
        hasExpired.current = true;
        
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        
        console.log("Timer expired in CyberTimer");
        onExpire();
      }
    }, 100);

    // Cleanup on unmount
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [timeLeft, isActive, onTimeUpdate, onExpire]);

  // Calculate progress percentage
  const progress = Math.max(0, Math.min(100, (timeLeft / duration) * 100));

  return (
    <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
      <div 
        className="h-full bg-gradient-to-r from-yellow-500 to-orange-500 transition-all ease-linear duration-100"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
