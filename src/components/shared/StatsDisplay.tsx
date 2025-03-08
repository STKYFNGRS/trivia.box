import React, { memo, useEffect } from 'react';
import { Hash, Flame, Target, Trophy } from 'lucide-react';
import SkeletonLoader from '../ui/SkeletonLoader';

interface StatsDisplayProps {
  stats: {
    totalPoints: number;
    bestStreak: number;
    gamesPlayed: number;
    rank?: number;
  } | null;
  isLoading?: boolean;
  onRankClick?: () => void;
  hasLeaderboard?: boolean;
}

const StatsDisplay = memo(function StatsDisplay({ stats, isLoading = false, onRankClick, hasLeaderboard = false }: StatsDisplayProps) {
  // Add debug logging to see what stats are really being received
  useEffect(() => {
    if (stats) {
      console.log('StatsDisplay received stats:', JSON.stringify(stats, null, 2));
      console.log('Best streak value:', stats.bestStreak);
    }
  }, [stats]);
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
        
        {/* Best Streak - Complete overhaul to force proper rendering */}
        <div className="text-center flex flex-col items-center px-1">
          <Flame className="w-4 h-4 text-orange-500 mb-0.5" />
          {/* Use a custom key to force react to re-render this component */}
          <div 
            key={`streak-value-${stats.bestStreak}`}
            className="text-orange-500 font-bold text-sm md:text-base"
            data-testid="player-best-streak"
          >
            {(() => {
              // Use a function to ensure the value is dynamically computed
              const streakValue = typeof stats.bestStreak === 'number' ? stats.bestStreak : 0;
              console.log('Rendering streak value:', streakValue);
              return streakValue;
            })()}
          </div>
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
        
        {/* Rank */}
        <div 
          className="text-center flex flex-col items-center px-1 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={hasLeaderboard ? onRankClick : undefined}
          role={hasLeaderboard ? "button" : undefined}
          tabIndex={hasLeaderboard ? 0 : undefined}
          onKeyDown={hasLeaderboard && onRankClick ? (e) => e.key === 'Enter' && onRankClick() : undefined}
          title={hasLeaderboard ? "View Leaderboard" : ""}
        >
          <Trophy className="w-4 h-4 text-amber-500 mb-0.5" />
          <span className="text-amber-500 font-bold text-sm md:text-base">
            {stats.rank || 1}
          </span>
          <span className="text-gray-400 text-xs hidden md:block">Rank</span>
        </div>
      </div>
    </div>
  );
});

export default StatsDisplay;