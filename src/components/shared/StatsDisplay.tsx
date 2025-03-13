import React, { memo, useEffect } from 'react';
import { log } from '@/utils/logger';
import { Hash, Flame, Target, Trophy } from 'lucide-react';
import SkeletonLoader from '../ui/SkeletonLoader';
import { cn } from '@/lib/utils';

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
  isMobile?: boolean;
}

const StatsDisplay = memo(function StatsDisplay({ 
  stats, 
  isLoading = false, 
  onRankClick, 
  hasLeaderboard = false,
  isMobile = false
}: StatsDisplayProps) {
  // Add debug logging to see what stats are really being received
  useEffect(() => {
    if (stats) {
      log.debug('StatsDisplay received stats:', { component: 'StatsDisplay', meta: stats });
      log.debug(`Best streak value: ${stats.bestStreak}`, { component: 'StatsDisplay' });
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
    <div className={cn(
      "bg-[#171923] rounded-xl border border-amber-600/20",
      isMobile ? "p-3" : "p-2" // Larger padding for mobile
    )}>
      <div className="flex items-center justify-around">
        {/* Total Score */}
        <div className="text-center flex flex-col items-center px-1">
          <Hash className={cn(
            "text-amber-500 mb-0.5",
            isMobile ? "w-5 h-5" : "w-4 h-4" // Larger icon for mobile
          )} />
          <span className={cn(
            "text-amber-500 font-bold",
            isMobile ? "text-base" : "text-sm md:text-base" // Always show larger text on mobile
          )}>
            {stats.totalPoints}
          </span>
          <span className={cn(
            "text-gray-400 text-xs",
            isMobile ? "block text-[10px]" : "hidden md:block" // Always show label on mobile
          )}>
            Total
          </span>
        </div>
        
        {/* Best Streak - Complete overhaul to force proper rendering */}
        <div className="text-center flex flex-col items-center px-1">
          <Flame className={cn(
            "text-orange-500 mb-0.5",
            isMobile ? "w-5 h-5" : "w-4 h-4" // Larger icon for mobile
          )} />
          {/* Use a custom key to force react to re-render this component */}
          <div 
            key={`streak-value-${stats.bestStreak}`}
            className={cn(
              "text-orange-500 font-bold",
              isMobile ? "text-base" : "text-sm md:text-base" // Always show larger text on mobile
            )}
            data-testid="player-best-streak"
          >
            {(() => {
              // Use a function to ensure the value is dynamically computed
              const streakValue = typeof stats.bestStreak === 'number' ? stats.bestStreak : 0;
              log.debug(`Rendering streak value: ${streakValue}`, { component: 'StatsDisplay' });
              return streakValue;
            })()}
          </div>
          <span className={cn(
            "text-gray-400 text-xs",
            isMobile ? "block text-[10px]" : "hidden md:block" // Always show label on mobile
          )}>
            Streak
          </span>
        </div>
        
        {/* Games Played */}
        <div className="text-center flex flex-col items-center px-1">
          <Target className={cn(
            "text-teal-500 mb-0.5",
            isMobile ? "w-5 h-5" : "w-4 h-4" // Larger icon for mobile
          )} />
          <span className={cn(
            "text-teal-500 font-bold",
            isMobile ? "text-base" : "text-sm md:text-base" // Always show larger text on mobile
          )}>
            {stats.gamesPlayed}
          </span>
          <span className={cn(
            "text-gray-400 text-xs",
            isMobile ? "block text-[10px]" : "hidden md:block" // Always show label on mobile
          )}>
            Games
          </span>
        </div>
        
        {/* Rank */}
        <div 
          className={cn(
            "text-center flex flex-col items-center px-1 transition-opacity",
            hasLeaderboard ? "cursor-pointer hover:opacity-80" : "",
            isMobile && hasLeaderboard ? "active:opacity-60" : "" // Better touch feedback
          )}
          onClick={hasLeaderboard ? onRankClick : undefined}
          role={hasLeaderboard ? "button" : undefined}
          tabIndex={hasLeaderboard ? 0 : undefined}
          onKeyDown={hasLeaderboard && onRankClick ? (e) => e.key === 'Enter' && onRankClick() : undefined}
          title={hasLeaderboard ? "View Leaderboard" : ""}
        >
          <Trophy className={cn(
            "text-amber-500 mb-0.5",
            isMobile ? "w-5 h-5" : "w-4 h-4" // Larger icon for mobile
          )} />
          <span className={cn(
            "text-amber-500 font-bold",
            isMobile ? "text-base" : "text-sm md:text-base" // Always show larger text on mobile
          )}>
            {stats.rank || 1}
          </span>
          <span className={cn(
            "text-gray-400 text-xs",
            isMobile ? "block text-[10px]" : "hidden md:block" // Always show label on mobile
          )}>
            Rank
          </span>
        </div>
      </div>
    </div>
  );
});

export default StatsDisplay;