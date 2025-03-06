import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ScoreIndicatorProps {
  score: number;
  streak: number;
  potentialPoints: number;
}

export default function ScoreIndicator({ 
  score, 
  streak, 
  potentialPoints 
}: ScoreIndicatorProps) {
  const streakBonus = Math.min(streak * 10, 50); // Cap at 50%

  return (
    <div className="flex flex-col gap-2">
      <motion.div 
        className="flex items-center gap-2"
        initial={false}
      >
        <div className="text-sm text-cyan-400/80 uppercase tracking-wider font-medium">
          Score:
        </div>
        <motion.div 
          key={score}
          initial={{ scale: 1.5, y: -10, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          className="text-lg font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent"
        >
          {score}
        </motion.div>
      </motion.div>

      <AnimatePresence mode="wait">
        {streak > 1 ? (
          <motion.div
            key="streak"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="text-orange-400 text-sm"
          >
            <motion.div
              animate={{ 
                scale: [1, 1.1, 1],
                transition: { duration: 0.5, repeat: Infinity, repeatType: "reverse" }
              }}
            >
              Next answer bonus: +{streakBonus}%
            </motion.div>
          </motion.div>
        ) : potentialPoints < 15 && (
          <motion.div
            key="potential"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="text-cyan-400/60 text-sm"
          >
            Potential points: {potentialPoints}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}