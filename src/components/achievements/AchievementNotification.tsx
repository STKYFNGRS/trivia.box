'use client';
import React, { useEffect, useState } from 'react';
import { Trophy, X, Flame, Target, Medal, Star } from 'lucide-react';
import { AchievementIcon, AchievementDisplay } from '@/types/achievements';

interface AchievementNotificationProps {
  achievement: AchievementDisplay & {
    progress?: number;
    total?: number;
  };
  onClose: () => void;
}

const ICONS: Record<AchievementIcon, React.ReactNode> = {
  TROPHY: <Trophy className="w-6 h-6" />,
  FLAME: <Flame className="w-6 h-6" />,
  STAR: <Star className="w-6 h-6" />,
  TARGET: <Target className="w-6 h-6" />,
  MEDAL: <Medal className="w-6 h-6" />
};

export default function AchievementNotification({ achievement, onClose }: AchievementNotificationProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Play sound effect
    const audio = new Audio('/achievement.mp3');
    audio.volume = 0.5;
    audio.play().catch(() => {}); // Ignore autoplay restrictions

    // Fade in with slight delay for dramatic effect
    setTimeout(() => setIsVisible(true), 100);

    // Auto dismiss after 5 seconds
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300); // Wait for fade out animation
    }, 5000);

    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className={`
        fixed top-4 right-4 max-w-sm bg-gradient-to-br from-gray-900/95 to-gray-800/90 border border-amber-500/50
        rounded-xl shadow-lg shadow-amber-500/20 backdrop-blur-xl transition-all duration-300
        transform-gpu scale-100 hover:scale-102
        ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-[-1rem]'}
      `}
    >
      <div className="p-4">
        <button
          onClick={() => {
            setIsVisible(false);
            setTimeout(onClose, 300);
          }}
          className="absolute top-2 right-2 text-gray-400 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start space-x-4">
          <div className="flex-shrink-0">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/30 to-orange-500/20 border border-amber-500/40 flex items-center justify-center animate-pulse-subtle">
              {ICONS[achievement.icon]}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              <p className="text-sm font-medium text-amber-300 animate-bounce">Achievement Unlocked! 🎉</p>
              <div className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
                <span className="text-xs text-amber-300">+500 XP</span>
              </div>
            </div>

            <h3 className="mt-1 text-lg font-bold text-white bg-gradient-to-r from-amber-400 via-orange-400 to-amber-300 bg-clip-text text-transparent">
              {achievement.name}
            </h3>
            <p className="mt-1 text-sm text-gray-300">{achievement.description}</p>
            
            {achievement.category && (
              <div className="mt-2">
                <span className="inline-block px-2 py-1 text-xs font-medium rounded-full bg-gradient-to-r from-amber-600/20 to-orange-600/20 border border-amber-500/30 text-amber-200">
                  {achievement.category}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar for auto-dismiss */}
      <div className="h-1 bg-gray-800 rounded-b-xl overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-400 animate-gradient-x transition-all duration-[5000ms] ease-linear"
          style={{ width: isVisible ? '0%' : '100%' }}
        />
      </div>
    </div>
  );
}