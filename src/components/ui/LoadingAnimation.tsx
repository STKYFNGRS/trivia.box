'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface LoadingAnimationProps {
  isLoading: boolean;
}

export default function LoadingAnimation({ isLoading, inline = false }: { isLoading: boolean; inline?: boolean }) {
  // This component displays an animated loading screen with:
  // 1. Fixed position "Loading..." text where only the dots animate
  // 2. Orbital rings that rotate on different planes
  // 3. Transparent background to show existing app background
  const [dots, setDots] = useState("");
  
  // Animated dots with fixed position
  useEffect(() => {
    if (!isLoading) return;
    
    const interval = setInterval(() => {
      setDots(prev => {
        // Use functional update to prevent closure issues
        const nextCount = (prev.length % 3) + 1;
        return ".".repeat(nextCount);
      });
    }, 400);
    
    // Hide header and game settings when loading (only for full-screen mode)
    if (isLoading && !inline) {
      document.body.classList.add('loading-active');
      // Dispatch custom event to hide game settings
      window.dispatchEvent(new Event('hideGameSettings'));
    }
    
    return () => {
      clearInterval(interval);
      if (!inline) {
        document.body.classList.remove('loading-active');
      }
    };
  }, [isLoading, inline]);

  return (
    <AnimatePresence>
      {isLoading && (
        <motion.div 
          className={`${inline ? '' : 'fixed inset-0'} z-[100] flex items-center justify-center pointer-events-none`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* No background overlay to allow existing background to show through */}
          
          <motion.div 
            className="relative z-10 flex flex-col items-center"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ 
              type: "spring", 
              stiffness: 260, 
              damping: 20,
              delay: 0.2 
            }}
          >
            <div className="w-32 h-32 relative mb-8">
              {/* Improved rotating outer rings with different planes */}
              <div className="absolute inset-0 rounded-full border-t-4 border-b-4 border-amber-600/30 animate-spin-slow transform rotate-0"></div>
              <div className="absolute inset-2 rounded-full border-r-4 border-l-4 border-amber-500/40 animate-spin-reverse-slow transform rotate-45"></div>
              <div className="absolute inset-4 rounded-full border-t-4 border-orange-500/50 animate-spin-medium transform rotate-90"></div>
              
              {/* Central pulsing core */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 animate-pulse-strong flex items-center justify-center">
                  <span className="text-3xl font-bold text-white">?</span>
                </div>
              </div>
              
              {/* Enhanced orbiting particles - first ring */}
              <div className="absolute h-full w-full animate-spin-reverse" style={{animationDuration: '7.5s'}}>
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-orange-500 shadow-glow-orange"></div>
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-3 h-3 rounded-full bg-orange-500 shadow-glow-orange"></div>
                <div className="absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-orange-500 shadow-glow-orange"></div>
                <div className="absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-orange-500 shadow-glow-orange"></div>
              </div>
              
              {/* Second ring */}
              <div className="absolute h-full w-full animate-spin" style={{animationDuration: '10s'}}>
                <div className="absolute top-[25%] right-[25%] translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-amber-400 shadow-glow-amber"></div>
                <div className="absolute bottom-[25%] left-[25%] -translate-x-1/2 translate-y-1/2 w-2.5 h-2.5 rounded-full bg-amber-400 shadow-glow-amber"></div>
                <div className="absolute top-[25%] left-[25%] -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-amber-400 shadow-glow-amber"></div>
                <div className="absolute bottom-[25%] right-[25%] translate-x-1/2 translate-y-1/2 w-2.5 h-2.5 rounded-full bg-amber-400 shadow-glow-amber"></div>
              </div>
              
              {/* Third ring */}
              <div className="absolute h-full w-full animate-spin-reverse" style={{animationDuration: '12s', transform: 'rotate(45deg)'}}>
                <div className="absolute top-[15%] right-[15%] translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-yellow-300 shadow-glow-yellow"></div>
                <div className="absolute bottom-[15%] left-[15%] -translate-x-1/2 translate-y-1/2 w-2 h-2 rounded-full bg-yellow-300 shadow-glow-yellow"></div>
                <div className="absolute top-[15%] left-[15%] -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-yellow-300 shadow-glow-yellow"></div>
                <div className="absolute bottom-[15%] right-[15%] translate-x-1/2 translate-y-1/2 w-2 h-2 rounded-full bg-yellow-300 shadow-glow-yellow"></div>
              </div>
            </div>
            
            <motion.div
              className="text-center mt-6"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              <div className="flex items-center justify-center">
                <h3 className="text-2xl md:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-600 whitespace-nowrap">
                  Loading
                </h3>
                <div className="w-12 inline-block text-2xl md:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-600">
                  {dots}
                </div>
              </div>
            
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}