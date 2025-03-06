'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { createElement } from 'react';
import { Trophy, Flame, Star, Target, Medal } from 'lucide-react';
import type { AchievementDisplay } from '@/types/achievements';

type AchievementEvent = {
  type: string;
  display: AchievementDisplay;
  userId: number;
};

// Map achievement icons to components
const IconMap = {
  TROPHY: Trophy,
  FLAME: Flame,
  STAR: Star,
  TARGET: Target,
  MEDAL: Medal,
};

// Map category to gradient colors for more visual distinction
const CategoryGradientMap = {
  'MASTERY': 'from-blue-500/30 to-indigo-500/20',
  'STREAK': 'from-amber-500/30 to-orange-500/20',
  'SPEED': 'from-red-500/30 to-pink-500/20',
  'COLLECTION': 'from-green-500/30 to-emerald-500/20',
  'SPECIAL': 'from-purple-500/30 to-violet-500/20'
};

// Map category to text colors
const CategoryTextGradientMap = {
  'MASTERY': 'from-blue-400 via-indigo-400 to-blue-300',
  'STREAK': 'from-amber-400 via-orange-400 to-amber-300',
  'SPEED': 'from-red-400 via-pink-400 to-red-300',
  'COLLECTION': 'from-green-400 via-emerald-400 to-green-300',
  'SPECIAL': 'from-purple-400 via-violet-400 to-purple-300'
};

function createToastContent(achievement: AchievementEvent) {
  const IconComponent = IconMap[achievement.display.icon as keyof typeof IconMap] || Trophy;
  const category = achievement.display.category;
  
  // Get appropriate gradients based on category
  const iconGradient = CategoryGradientMap[category as keyof typeof CategoryGradientMap] || 'from-amber-500/30 to-orange-500/20';
  const textGradient = CategoryTextGradientMap[category as keyof typeof CategoryTextGradientMap] || 'from-amber-400 via-orange-400 to-amber-300';
  
  return createElement('div', { className: 'flex items-center gap-3' },
    createElement('div', { className: `p-2 bg-gradient-to-br ${iconGradient} rounded-lg border border-amber-500/30 animate-pulse-subtle` },
      createElement(IconComponent, { className: 'w-5 h-5 text-amber-300' })
    ),
    createElement('div', {},
      createElement('div', { className: `font-medium text-white bg-gradient-to-r ${textGradient} bg-clip-text text-transparent` }, achievement.display.name),
      createElement('div', { className: 'text-sm text-gray-400' }, achievement.display.description)
    )
  );
}

function showAchievementUnlock(achievement: AchievementEvent): void {
  // Use different toast styles based on achievement category
  const toastStyle = getToastStyleByCategory(achievement.display.category);
  
  // Show toast with the achievement content
  toast(createToastContent(achievement), {
    duration: 5000,
    className: toastStyle,
  });
  
  // Play appropriate sound based on achievement category
  playAchievementSound(achievement.display.category);
}

function getToastStyleByCategory(category: string): string {
  switch (category) {
    case 'MASTERY':
      return "bg-gradient-to-br from-gray-900/95 to-gray-800/90 border border-blue-500/50 shadow-md shadow-blue-500/20";
    case 'STREAK':
      return "bg-gradient-to-br from-gray-900/95 to-gray-800/90 border border-amber-500/50 shadow-md shadow-amber-500/20";
    case 'SPEED':
      return "bg-gradient-to-br from-gray-900/95 to-gray-800/90 border border-red-500/50 shadow-md shadow-red-500/20";
    case 'COLLECTION':
      return "bg-gradient-to-br from-gray-900/95 to-gray-800/90 border border-green-500/50 shadow-md shadow-green-500/20";
    case 'SPECIAL':
      return "bg-gradient-to-br from-gray-900/95 to-gray-800/90 border border-purple-500/50 shadow-md shadow-purple-500/20";
    default:
      return "bg-gradient-to-br from-gray-900/95 to-gray-800/90 border border-amber-500/50 shadow-md shadow-amber-500/20";
  }
}

function playAchievementSound(category: string): void {
  try {
    // Use sounds based on achievement type for better feedback
    // Note: You'll need to add these sound files to your public folder
    let soundPath = '/sounds/achievement.mp3';
    
    switch (category) {
      case 'MASTERY':
        soundPath = '/sounds/achievement-mastery.mp3';
        break;
      case 'STREAK':
        soundPath = '/sounds/achievement-streak.mp3';
        break;
      case 'SPEED':
        soundPath = '/sounds/achievement-speed.mp3';
        break;
      case 'COLLECTION':
        soundPath = '/sounds/achievement-collection.mp3';
        break;
      case 'SPECIAL':
        soundPath = '/sounds/achievement-special.mp3';
        break;
    }
    
    // Try to play the category-specific sound
    const audio = new Audio(soundPath);
    audio.volume = 0.5;
    audio.play().catch((err) => {
      console.warn(`Could not play sound ${soundPath}, falling back to default:`, err);
      // Fall back to default sound if the specific one fails
      try {
        const fallbackAudio = new Audio('/sounds/achievement.mp3');
        fallbackAudio.volume = 0.5;
        fallbackAudio.play().catch(() => {
          // If even the fallback fails, try one more generic approach
          const genericAudio = new Audio('/achievement.mp3');
          genericAudio.volume = 0.5;
          genericAudio.play().catch(() => {});
        });
      } catch (error) {
        console.error('Could not play any achievement sound:', error);
      }
    });
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