import React, { useState, useEffect } from 'react';
import { Cog, Play } from 'lucide-react';
import { motion } from 'framer-motion';

interface GameOptionsProps {
  onStartGame: (options: { questionCount: number; category: string; difficulty: string }) => void;
  isVisible?: boolean;
}

export default function GameOptions({ onStartGame, isVisible = true }: GameOptionsProps) {
  const [selectedCount, setSelectedCount] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<string | null>(null);
  const [internallyVisible, setInternallyVisible] = useState(isVisible);

  // Handle hiding game settings when leaderboard is shown
  useEffect(() => {
    const handleHideGameSettings = () => {
      setInternallyVisible(false);
    };
    
    window.addEventListener('hideGameSettings', handleHideGameSettings);
    return () => {
      window.removeEventListener('hideGameSettings', handleHideGameSettings);
    };
  }, []);

  // Handle showing game settings when other modals are closed
  useEffect(() => {
    const handleShowGameSettings = () => {
      setInternallyVisible(true);
    };
    
    window.addEventListener('showGameSettings', handleShowGameSettings);
    return () => {
      window.removeEventListener('showGameSettings', handleShowGameSettings);
    };
  }, []);

  // Reset internal visibility when parent visibility changes
  useEffect(() => {
    setInternallyVisible(isVisible);
  }, [isVisible]);

  const questionCounts = [10, 20, 40];
  const categories = [
    { id: 'random', name: 'Random' },
    { id: 'technology', name: 'Technology' },
    { id: 'pop_culture', name: 'Pop Culture' },
    { id: 'science', name: 'Science' },
    { id: 'history', name: 'History' },
    { id: 'geography', name: 'Geography' },
    { id: 'sports', name: 'Sports' },
    { id: 'gaming', name: 'Gaming' },
    { id: 'literature', name: 'Literature' },
    { id: 'internet', name: 'Internet' },
    { id: 'movies', name: 'Movies' },
    { id: 'music', name: 'Music' }
  ];
  
  const difficulties = [
    { id: 'mixed', name: 'Mixed' },
    { id: 'easy', name: 'Easy' },
    { id: 'medium', name: 'Medium' },
    { id: 'hard', name: 'Hard' }
  ];

  const handleStartGame = () => {
    if (selectedCount && selectedCategory && selectedDifficulty) {
      onStartGame({
        questionCount: selectedCount,
        category: selectedCategory,
        difficulty: selectedDifficulty
      });
    }
  };

  if (!internallyVisible || !isVisible) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="flex min-h-screen items-center justify-center p-4">
        <motion.div
          key="game-options-panel"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-4xl mt-28 pt-16 md:pt-10 md:mt-24"
        >
          {/* Added max-h for mobile and overflow-y-auto to make content scrollable */}
          <div className="rounded-2xl bg-gradient-to-br from-gray-900/90 to-gray-800/90 p-6 backdrop-blur-lg border border-amber-500/20 max-h-[70vh] overflow-y-auto">
            {/* Header */}
            <div className="mb-6 flex items-center sticky top-0 z-10 bg-gradient-to-br from-gray-900/95 to-gray-800/95 py-2 -mx-2 px-2 backdrop-blur-md">
              <div className="flex items-center gap-3 justify-center w-full relative">
                <Cog className="h-6 w-6 text-amber-400" />
                <h2 className="text-xl font-bold text-white">Choose Your Game Settings</h2>
              </div>
            </div>

            {/* Game Options */}
            <div className="space-y-6 pb-4">
              {/* Question Count - Always in one row on all screen sizes */}
              <div className="space-y-3">
                <div className="text-base font-medium text-gray-200">
                  Number of Questions:
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {questionCounts.map(count => (
                    <button
                      key={count}
                      onClick={() => setSelectedCount(count)}
                      className={`px-4 py-3 rounded-lg font-medium transition-all ${
                        selectedCount === count
                          ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-gray-900 shadow-lg shadow-amber-600/20 transform scale-105 border border-amber-500/40'
                          : 'bg-gray-800/60 text-gray-300 hover:bg-gray-800/80 border border-gray-700/40 hover:border-amber-600/40 hover:transform hover:scale-105 hover:shadow-md hover:shadow-amber-600/10'
                      }`}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>

              {/* Difficulty */}
              <div className="space-y-3">
                <div className="text-base font-medium text-gray-200">
                  Difficulty:
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {difficulties.map(difficulty => (
                    <button
                      key={difficulty.id}
                      onClick={() => setSelectedDifficulty(difficulty.id)}
                      className={`px-3 py-3 rounded-lg font-medium transition-all ${
                        selectedDifficulty === difficulty.id
                          ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-gray-900 shadow-lg shadow-amber-600/20 transform scale-105 border border-amber-500/40'
                          : 'bg-gray-800/60 text-gray-300 hover:bg-gray-800/80 border border-gray-700/40 hover:border-amber-600/40 hover:transform hover:scale-105 hover:shadow-md hover:shadow-amber-600/10'
                      }`}
                    >
                      {difficulty.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category - 2x6 grid on mobile, 3x4 on larger screens */}
              <div className="space-y-3">
                <div className="text-base font-medium text-gray-200">
                  Category:
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {categories.map(category => (
                    <button
                      key={category.id}
                      onClick={() => setSelectedCategory(category.id)}
                      className={`px-2 py-3 rounded-lg font-medium transition-all text-sm ${
                        selectedCategory === category.id
                          ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-gray-900 shadow-lg shadow-amber-600/20 transform scale-105 border border-amber-500/40'
                          : 'bg-gray-800/60 text-gray-300 hover:bg-gray-800/80 border border-gray-700/40 hover:border-amber-600/40 hover:transform hover:scale-105 hover:shadow-md hover:shadow-amber-600/10'
                      }`}
                    >
                      {category.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Start Game Button - Sticky at bottom for mobile */}
            <div className="sticky bottom-0 pt-4 pb-2 bg-gradient-to-t from-gray-900/95 via-gray-900/95 to-gray-900/80 backdrop-blur-md -mx-2 px-2 flex justify-center">
              <button
                onClick={handleStartGame}
                disabled={!selectedCount || !selectedCategory || !selectedDifficulty}
                className={`relative px-8 py-4 rounded-lg font-bold transition-all w-full sm:w-auto ${
                  selectedCount && selectedCategory && selectedDifficulty
                    ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-gray-900 shadow-lg shadow-amber-600/20 hover:transform hover:scale-105 hover:shadow-lg hover:shadow-amber-600/30 border border-amber-500/40'
                    : 'bg-gray-800/60 text-gray-400 border border-gray-700/40 cursor-not-allowed'
                }`}
              >
                {selectedCount && selectedCategory && selectedDifficulty && (
                  <>
                    {/* Reflective highlight effect */}
                    <span className="absolute top-0 left-0 right-0 h-1/3 bg-gradient-to-b from-white/30 to-transparent pointer-events-none"></span>
                    <span className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/30 to-transparent pointer-events-none"></span>
                  </>
                )}
                <div className="flex items-center justify-center gap-2">
                  <Play className="h-5 w-5" />
                  <span>Start Game</span>
                </div>
              </button>
            </div>

            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 -z-10 bg-black/70 backdrop-blur-sm"
            />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
