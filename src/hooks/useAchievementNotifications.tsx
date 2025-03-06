'use client';
import React from 'react';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { Trophy, Flame, Star, Target, Medal } from 'lucide-react';
import type { AchievementDisplay, AchievementIcon } from '../types/achievements';

type AchievementEvent = {
  type: string;
  display: AchievementDisplay;
  userId: number;
};

// Map icons to components
const IconComponents: Record<AchievementIcon, React.ElementType> = {
  TROPHY: Trophy,
  FLAME: Flame,
  STAR: Star,
  TARGET: Target,
  MEDAL: Medal
};

function showAchievementUnlock(achievement: AchievementEvent): void {
  const IconComponent = IconComponents[achievement.display.icon] || Trophy;
  
  const toastContent = (
    <div className="flex items-center gap-3">
      <div className="p-2 bg-gradient-to-br from-amber-500/30 to-orange-500/20 rounded-lg border border-amber-500/30 animate-pulse-subtle">
        <IconComponent className="w-5 h-5 text-amber-300" />
      </div>
      <div>
        <div className="font-medium bg-gradient-to-r from-amber-400 via-orange-400 to-amber-300 bg-clip-text text-transparent">
          {achievement.display.name}
        </div>
        <div className="text-sm text-gray-400">{achievement.display.description}</div>
      </div>
    </div>
  );

  toast(toastContent, {
    duration: 5000,
    className: "bg-gradient-to-br from-gray-900/95 to-gray-800/90 border border-amber-500/50 shadow-md shadow-amber-500/20",
  });
  
  // Play sound if available
  try {
    const audio = new Audio('/achievement.mp3');
    audio.volume = 0.5;
    audio.play().catch(() => {});
  } catch (error) {
    console.error('Could not play achievement sound:', error);
  }
}

export function useAchievementNotifications(): void {
  useEffect(() => {
    const handleAchievementUnlock = (event: CustomEvent<AchievementEvent>) => {
      console.log('Achievement unlocked:', event.detail);
      showAchievementUnlock(event.detail);
    };

    window.addEventListener('achievementUnlocked', handleAchievementUnlock as EventListener);
    return () => window.removeEventListener('achievementUnlocked', handleAchievementUnlock as EventListener);
  }, []);
}