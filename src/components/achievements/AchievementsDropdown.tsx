'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Trophy, X, Flame, Target, Medal, Star, Award } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Achievement, AchievementIcon } from '@/types/achievements';
import { cn } from '@/lib/utils';
import LoadingAnimation from '../ui/LoadingAnimation';

interface AchievementsDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  walletAddress: string;
}

const ICONS: Record<AchievementIcon, React.ReactNode> = {
  TROPHY: <Trophy className="w-5 h-5" />,
  FLAME: <Flame className="w-5 h-5" />,
  STAR: <Star className="w-5 h-5" />,
  TARGET: <Target className="w-5 h-5" />,
  MEDAL: <Medal className="w-5 h-5" />
};

// Map for category-specific gradient colors
const CATEGORY_GRADIENTS: Record<string, { from: string; to: string; border: string }> = {
  'MASTERY': { 
    from: 'from-blue-900/30', 
    to: 'to-blue-800/20', 
    border: 'border-blue-500/40' 
  },
  'STREAK': { 
    from: 'from-amber-900/30', 
    to: 'to-amber-800/20', 
    border: 'border-amber-500/40' 
  },
  'SPEED': { 
    from: 'from-red-900/30', 
    to: 'to-red-800/20', 
    border: 'border-red-500/40' 
  },
  'COLLECTION': { 
    from: 'from-green-900/30', 
    to: 'to-green-800/20', 
    border: 'border-green-500/40' 
  },
  'SPECIAL': { 
    from: 'from-purple-900/30', 
    to: 'to-purple-800/20', 
    border: 'border-purple-500/40' 
  }
};

// Map for category-specific background colors
const CATEGORY_ICON_GRADIENTS: Record<string, { from: string; to: string; text: string; border: string }> = {
  'MASTERY': { 
    from: 'from-blue-500/20', 
    to: 'to-blue-700/40', 
    text: 'text-blue-300',
    border: 'border-blue-500/30' 
  },
  'STREAK': { 
    from: 'from-amber-500/20', 
    to: 'to-amber-700/40', 
    text: 'text-amber-300',
    border: 'border-amber-500/30' 
  },
  'SPEED': { 
    from: 'from-red-500/20', 
    to: 'to-red-700/40', 
    text: 'text-red-300',
    border: 'border-red-500/30' 
  },
  'COLLECTION': { 
    from: 'from-green-500/20', 
    to: 'to-green-700/40', 
    text: 'text-green-300',
    border: 'border-green-500/30' 
  },
  'SPECIAL': { 
    from: 'from-purple-500/20', 
    to: 'to-purple-700/40', 
    text: 'text-purple-300',
    border: 'border-purple-500/30' 
  }
};

// Progress bar gradients by category
const PROGRESS_GRADIENTS: Record<string, string> = {
  'MASTERY': 'from-blue-600 via-blue-500 to-blue-400',
  'STREAK': 'from-amber-600 via-amber-500 to-amber-400',
  'SPEED': 'from-red-600 via-red-500 to-red-400',
  'COLLECTION': 'from-green-600 via-green-500 to-green-400',
  'SPECIAL': 'from-purple-600 via-purple-500 to-purple-400'
};

// Define multi-tier achievements and their thresholds
const ACHIEVEMENT_TIERS: Record<string, { name: string, thresholds: number[] }> = {
  'streak_3': { 
    name: 'Streak', 
    thresholds: [3, 5, 10] 
  },
  'streak_5': { 
    name: 'Streak', 
    thresholds: [3, 5, 10] 
  },
  'streak_master': { 
    name: 'Streak', 
    thresholds: [3, 5, 10] 
  },
  'science_master': { 
    name: 'Science', 
    thresholds: [10, 25, 50] 
  },
  'technology_master': { 
    name: 'Technology', 
    thresholds: [10, 25, 50] 
  },
  'popculture_master': { 
    name: 'Pop Culture', 
    thresholds: [10, 25, 50] 
  },
  'history_master': { 
    name: 'History', 
    thresholds: [10, 25, 50] 
  },
  'geography_master': { 
    name: 'Geography', 
    thresholds: [10, 25, 50] 
  },
  'sports_master': { 
    name: 'Sports', 
    thresholds: [10, 25, 50] 
  },
  'gaming_master': { 
    name: 'Gaming', 
    thresholds: [10, 25, 50] 
  },
  'speed_demon': { 
    name: 'Speed', 
    thresholds: [5, 10, 20] 
  },
  'random_master': { 
    name: 'Random', 
    thresholds: [10, 25, 50] 
  },
  'general_master': { 
    name: 'General Knowledge', 
    thresholds: [10, 25, 50] 
  },
  'internet_master': { 
    name: 'Internet', 
    thresholds: [10, 25, 50] 
  },
  'movies_master': { 
    name: 'Movies', 
    thresholds: [10, 25, 50] 
  },
  'music_master': { 
    name: 'Music', 
    thresholds: [10, 25, 50] 
  },
  'literature_master': { 
    name: 'Literature', 
    thresholds: [10, 25, 50] 
  }
};

// Check if an achievement has multiple tiers
function isMultiTierAchievement(code: string): boolean {
  // Normalize the code to lowercase for consistent lookups
  const normalizedCode = code.toLowerCase();
  return !!ACHIEVEMENT_TIERS[normalizedCode];
}

// Get tier thresholds for multi-tier achievements
function getTierThresholds(code: string): number[] {
  // Normalize the code to lowercase for consistent lookups
  const normalizedCode = code.toLowerCase();
  return ACHIEVEMENT_TIERS[normalizedCode]?.thresholds || [];
}

export default function AchievementsDropdown({ isOpen, onClose, walletAddress }: AchievementsDropdownProps) {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    const fetchAchievements = async () => {
      if (!isOpen || !walletAddress) return;
      
      setIsLoading(true);
      setError(null);
      
      try {
        console.log(`Fetching achievements for wallet: ${walletAddress}`);
        const response = await fetch(`/api/achievements?wallet=${walletAddress}`);
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`API response error: ${response.status} - ${errorText}`);
          throw new Error(`API error: ${response.status} - ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log(`Retrieved ${data.achievements?.length || 0} achievements:`);
        
        // Log a summary of achievements
        const achievedCount = data.achievements?.filter((a: any) => a.achieved).length || 0;
        const inProgressCount = data.achievements?.filter((a: any) => !a.achieved && a.progress > 0).length || 0;
        console.log(`Achieved: ${achievedCount}, In Progress: ${inProgressCount}`);
        
        // Log achieved achievements
        const achievedAchievements = data.achievements?.filter((a: any) => a.achieved) || [];
        console.log('Achieved achievements:', achievedAchievements.map((a: any) => `${a.code}: ${a.progress}/${a.total}`));
        
        // Log in-progress achievements
        const inProgressAchievements = data.achievements?.filter((a: any) => !a.achieved && a.progress > 0) || [];
        console.log('In-progress achievements:', inProgressAchievements.map((a: any) => `${a.code}: ${a.progress}/${a.total}`));
        
        if (data.achievements) {
          // Deduplicate achievements with the same name and description
          const uniqueMap = new Map<string, Achievement>();
          
          data.achievements.forEach((achievement: Achievement) => {
            // Use name+description as a unique key for deduplication
            const key = `${achievement.name}|${achievement.description}`;
            
            if (uniqueMap.has(key)) {
              const existing = uniqueMap.get(key)!;
              // Keep the achievement with higher progress percentage
              if ((achievement.progress / achievement.total) > (existing.progress / existing.total)) {
                uniqueMap.set(key, achievement);
              }
            } else {
              uniqueMap.set(key, achievement);
            }
          });
          
          // Convert back to array
          setAchievements(Array.from(uniqueMap.values()));
        } else {
          console.error('No achievements array in response:', data);
          setError('Failed to load achievements. Invalid response format.');
        }
      } catch (err) {
        console.error('Error fetching achievements:', err);
        setError('Failed to load achievements');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAchievements();
  }, [isOpen, walletAddress]);

  const filteredAndSortedAchievements = useMemo(() => {
    let result = [...achievements];
    
    // Filter by category if selected
    if (selectedCategory) {
      result = result.filter(a => a.category === selectedCategory);
    }
    
    // Always sort by category order first if no category filter is applied
    if (!selectedCategory) {
      const categoryOrder = ['MASTERY', 'STREAK', 'SPEED', 'COLLECTION', 'SPECIAL'];
      result.sort((a, b) => {
        const aIndex = categoryOrder.indexOf(a.category);
        const bIndex = categoryOrder.indexOf(b.category);
        return aIndex - bIndex;
      });
    }

    // Then sort by progress (completed achievements first, then by progress)
    result.sort((a, b) => {
      if (a.achieved && !b.achieved) return -1;
      if (!a.achieved && b.achieved) return 1;
      
      const aProgress = (a.progress / a.total) * 100;
      const bProgress = (b.progress / b.total) * 100;
      return bProgress - aProgress;
    });

    return result;
  }, [achievements, selectedCategory]);

  // Get unique categories for filter
  const categories = useMemo(() => {
    return [...new Set(achievements.map(a => a.category))];
  }, [achievements]);

  // Log when opening/closing for debugging
  useEffect(() => {
    console.log(`AchievementsDropdown isOpen changed to: ${isOpen}`);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50" data-testid="achievements-modal">
      <div className="flex min-h-screen items-center justify-center p-4">
        <motion.div
          key="achievements-panel"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-4xl mt-28 pt-16 md:pt-10 md:mt-24"
        >
          <div className="rounded-2xl bg-gradient-to-br from-gray-900/90 to-gray-800/90 p-6 backdrop-blur-lg border border-amber-500/20 max-h-[70vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="mb-2 flex items-center">
              <div className="flex items-center gap-3 justify-center w-full relative">
                <Award className="h-6 w-6 text-amber-400" />
                <h2 className="text-xl font-bold text-white">Achievements</h2>
              </div>
              <div className="absolute right-0 top-0">
                <button
                  onClick={() => onClose()}
                  className="rounded-lg p-1.5 text-amber-400 transition-colors hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Category Filter Tabs */}
            {!isLoading && !error && categories.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                <button
                  className={`px-3 py-1 rounded-full text-xs border transition-all ${
                    selectedCategory === null
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                      : 'border-gray-700/30 text-gray-400 hover:border-gray-600'
                  }`}
                  onClick={() => setSelectedCategory(null)}
                >
                  All
                </button>
                {categories.map(category => (
                  <button
                    key={category}
                    className={`px-3 py-1 rounded-full text-xs border transition-all ${
                      selectedCategory === category
                        ? `bg-amber-500/20 border-amber-500/40 text-amber-300`
                        : 'border-gray-700/30 text-gray-400 hover:border-gray-600'
                    }`}
                    onClick={() => setSelectedCategory(category)}
                  >
                    {category.charAt(0) + category.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            )}

            {/* Achievement Grid */}
            <div className="overflow-y-auto pr-2 pb-2 flex-1 custom-scrollbar">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {isLoading ? (
                  <div className="col-span-full py-12 flex justify-center">
                    <LoadingAnimation isLoading={isLoading} inline={true} />
                  </div>
                ) : error ? (
                  <div className="col-span-full py-8 text-center text-red-400 bg-red-900/20 backdrop-blur-md rounded-xl border border-red-500/20 p-4">
                    <div className="flex flex-col items-center space-y-2">
                      <X className="h-6 w-6" />
                      <span>{error}</span>
                      <button onClick={() => window.location.reload()} className="px-3 py-1 rounded-lg bg-red-800/20 hover:bg-red-800/40 border border-red-500/20 text-sm mt-2">
                        Retry
                      </button>
                    </div>
                  </div>
                ) : filteredAndSortedAchievements.length === 0 ? (
                  <div className="col-span-full py-8 text-center text-purple-300 bg-purple-900/20 backdrop-blur-md rounded-xl border border-purple-500/20 p-4">
                    <div className="flex flex-col items-center space-y-2">
                      <Trophy className="h-6 w-6 opacity-50" />
                      <span>No achievements found</span>
                      <span className="text-sm text-gray-400">Keep playing to unlock achievements!</span>
                    </div>
                  </div>
                ) : (
                  filteredAndSortedAchievements.map((achievement) => {
                    // Get category-specific styling
                    const categoryStyle = CATEGORY_GRADIENTS[achievement.category] || 
                      CATEGORY_GRADIENTS['STREAK'];
                    
                    const iconStyle = CATEGORY_ICON_GRADIENTS[achievement.category] || 
                      CATEGORY_ICON_GRADIENTS['STREAK'];
                    
                    const progressGradient = PROGRESS_GRADIENTS[achievement.category] || 
                      PROGRESS_GRADIENTS['STREAK'];
                    
                    // Check if this is a multi-tier achievement
                    const isMultiTier = isMultiTierAchievement(achievement.code);
                    const tierThresholds = isMultiTier ? getTierThresholds(achievement.code) : [];
                    
                    return (
                      <motion.div
                        key={achievement.code}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className={cn(
                          "group rounded-xl p-4 transition-all",
                          achievement.achieved ? 
                            `bg-gradient-to-br ${categoryStyle.from} ${categoryStyle.to} hover:opacity-90 border ${categoryStyle.border} hover:border-opacity-60 shadow-lg shadow-amber-500/10` : 
                            "bg-gradient-to-br from-gray-800/40 to-gray-900/30 hover:from-gray-800/50 hover:to-gray-900/40 border border-gray-700/20 hover:border-gray-700/40"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className={cn(
                            "rounded-lg p-2 transition-colors",
                            achievement.achieved ? 
                              `${iconStyle.text} bg-gradient-to-br ${iconStyle.from} ${iconStyle.to} backdrop-blur-sm border ${iconStyle.border} group-hover:border-opacity-40 animate-pulse` : 
                              "text-gray-400 bg-gray-800/30 group-hover:bg-gray-800/40 backdrop-blur-sm border border-gray-700/20 group-hover:border-gray-700/30"
                          )}>
                            {ICONS[achievement.icon]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-white">{achievement.name}</h4>
                            <p className="mt-1 text-sm text-gray-400">{achievement.description}</p>
                            
                            {/* Milestone indicators for multi-tier achievements */}
                            {isMultiTier && (
                              <div className="mt-2 flex items-center space-x-1">
                                {tierThresholds.map((threshold, idx) => (
                                  <div 
                                    key={idx} 
                                    className="relative group/milestone"
                                  >
                                    <div 
                                      className={`h-2 w-2 rounded-full ${
                                        achievement.progress >= threshold 
                                          ? `bg-gray-300 animate-pulse-slow` 
                                          : 'bg-gray-700'
                                      }`}
                                    />
                                    
                                    <div className="absolute bottom-full mb-1 left-1/2 transform -translate-x-1/2 opacity-0 group-hover/milestone:opacity-100 transition-opacity pointer-events-none z-10">
                                      <div className="bg-gray-900 text-xs text-white px-2 py-1 rounded shadow whitespace-nowrap">
                                        {threshold}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                            
                            <div className="mt-3 space-y-2">
                              <div className="h-1.5 rounded-full bg-gray-800/50 backdrop-blur-sm border border-gray-700/20 overflow-hidden">
                                <motion.div 
                                  className={cn(
                                    "h-full transition-colors",
                                    achievement.achieved ? 
                                      `bg-gradient-to-r ${progressGradient} animate-gradient-x` : 
                                      "bg-gradient-to-r from-gray-700 to-gray-600"
                                  )}
                                  initial={{ width: 0 }}
                                  animate={{ 
                                    width: `${Math.min((achievement.progress / achievement.total) * 100, 100)}%` 
                                  }}
                                  transition={{ duration: 0.5, ease: "easeOut" }}
                                />
                              </div>
                              <div className="flex justify-between text-xs">
                                <span className="text-gray-500">
                                  {achievement.progress} / {achievement.total}
                                </span>
                                {achievement.achieved && (
                                  <span className="bg-gray-800/40 text-gray-300 px-2 py-0.5 rounded-full text-xs border border-gray-700/40 shadow-sm animate-pulse">
                                    Completed! 🎉
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 -z-10 bg-black/70 backdrop-blur-sm"
              onClick={() => onClose()}
            />
          </div>
        </motion.div>
      </div>
    </div>
  );
}