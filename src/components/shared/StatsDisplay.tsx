import React, { memo } from 'react';
import { Hash, Flame, Target, Trophy } from 'lucide-react';
import SkeletonLoader from '../ui/SkeletonLoader';

interface StatsDisplayProps {
  stats: {
    totalPoints: number;
    bestStreak: number;
    gamesPlayed: number;
  } | null;
  isLoading?: boolean;
}

const StatsDisplay = memo(function StatsDisplay({ stats, isLoading = false }: StatsDisplayProps) {
  // Loading state
  if (isLoading) {
    return (
      <div className="bg-[#171923] rounded-xl border border-amber-600/20 p-2">
        <div className="flex items-center justify-around h-16">
          <SkeletonLoader height={40} width={45} rounded="rounded-lg" />
          <SkeletonLoader height={40} width={45} rounded="rounded-lg" />
          <SkeletonLoader height={40} width={45} rounded="rounded-lg" />
          <SkeletonLoader height={40} width={45} rounded="rounded-lg" />
        </div>
      </div>
    );
  }
  
  // Fallback if no stats
  if (!stats) return null;
  
  return (
    <div className="bg-[#171923] rounded-xl border border-amber-600/20 p-2">
      <div className="flex items-center justify-around">
        {/* Total Score */}
        <div className="text-center flex flex-col items-center px-1">
          <Hash className="w-4 h-4 text-amber-500 mb-0.5" />
          <span className="text-amber-500 font-bold text-sm md:text-base">
            {stats.totalPoints}
          </span>
          <span className="text-gray-400 text-xs hidden md:block">Total</span>
        </div>
        
        {/* Best Streak */}
        <div className="text-center flex flex-col items-center px-1">
          <Flame className="w-4 h-4 text-orange-500 mb-0.5" />
          <span className="text-orange-500 font-bold text-sm md:text-base">
            {stats.bestStreak}
          </span>
          <span className="text-gray-400 text-xs hidden md:block">Streak</span>
        </div>
        
        {/* Games Played */}
        <div className="text-center flex flex-col items-center px-1">
          <Target className="w-4 h-4 text-teal-500 mb-0.5" />
          <span className="text-teal-500 font-bold text-sm md:text-base">
            {stats.gamesPlayed}
          </span>
          <span className="text-gray-400 text-xs hidden md:block">Games</span>
        </div>
        
        {/* Weekly Points */}
        <div className="text-center flex flex-col items-center px-1">
          <Trophy className="w-4 h-4 text-amber-500 mb-0.5" />
          <span className="text-amber-500 font-bold text-sm md:text-base">
            {stats.totalPoints}
          </span>
          <span className="text-gray-400 text-xs hidden md:block">Weekly</span>
        </div>
      </div>
    </div>
  );
});

export default StatsDisplay;