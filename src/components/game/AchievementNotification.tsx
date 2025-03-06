import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface AchievementNotificationProps {
  achievement: {
    type: string;
    title: string;
    description: string;
  } | null;
  onClose: () => void;
}

export default function AchievementNotification({ achievement, onClose }: AchievementNotificationProps) {
  return (
    <AnimatePresence onExitComplete={onClose}>
      {achievement && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          className="fixed bottom-4 right-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white p-4 rounded-lg shadow-lg z-50"
        >
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-bold text-lg mb-1">{achievement.title}</h3>
              <p>{achievement.description}</p>
            </div>
            <button 
              onClick={onClose}
              className="ml-4 text-white/80 hover:text-white"
            >
              ✕
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}