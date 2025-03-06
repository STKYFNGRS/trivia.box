'use client';

import React, { useState, useEffect, Suspense, lazy } from 'react';
import { useAccount } from 'wagmi';
import { useGameState } from '@/hooks/useGameState';
import dynamic from 'next/dynamic';
import GameOptions from '@/components/game/GameOptions';
import CustomConnectButton from '@/components/shared/CustomConnectButton';
import Header from '@/components/shared/Header';
import LoadingAnimation from '@/components/ui/LoadingAnimation';
import FeatureIcons from '@/components/FeatureIcons';
import Footer from '@/components/shared/Footer';
import GameModalFallback from '@/components/game/GameModalFallback';

// Configuration
const DEBUG_MODE = false; // Set to false to disable debug logging

// Debug logger - only logs when DEBUG_MODE is true
const debugLog = (...args: any[]) => {
  if (DEBUG_MODE) {
    console.log(...args);
  }
};

// Dynamically import heavy components with better loading experience
const GameModal = dynamic(() => import('@/components/game/GameModal'), {
  loading: () => <GameModalFallback />,
  ssr: false // Disable server-side rendering for game components
});

const AchievementsDropdown = dynamic(() => import('@/components/achievements/AchievementsDropdown'), {
  ssr: false
});

const AchievementNotifications = dynamic(() => import('@/components/achievements/AchievementNotifications'), {
  ssr: false
});

const ParticleBackground = dynamic(() => import('@/components/ui/ParticleBackground'), {
  ssr: false
});

export default function ClientPage() {
  const [isAchievementsOpen, setIsAchievementsOpen] = useState(false);
  const { address, isConnected, chainId } = useAccount();
  const { gameState, initGame, isLoading } = useGameState();
  const [shouldRenderGame, setShouldRenderGame] = useState(false);
  
  // Enhanced debugging for game state changes
  useEffect(() => {
    if (gameState) {
      debugLog('[Debug] ClientPage: Game state set with questions:', gameState.questions?.length);
      debugLog('[Debug] ClientPage: Game session ID:', gameState.sessionId);
      
      // Set a flag to ensure we render the game modal
      setShouldRenderGame(true);
    } else {
      setShouldRenderGame(false);
    }
  }, [gameState]);
  
  // Force a re-render of the GameModal component when game state changes
  // This helps ensure the component is properly mounted
  const gameModalKey = gameState ? `game-modal-${gameState.sessionId}-${Date.now()}` : 'no-game';
  
  // Consider connected when wallet is connected and on Base chain
  const isFullyConnected = isConnected && chainId === 8453;
  
  return (
    <div className="flex flex-col min-h-screen">
      <ParticleBackground gameLoading={isLoading} />
      <LoadingAnimation isLoading={isLoading} />
      
      {isFullyConnected && (
        <Header onAchievementsClick={() => setIsAchievementsOpen(true)} />
      )}
      
      <main className={`flex-1 flex flex-col ${isFullyConnected ? 'pt-12' : ''} relative z-10`}>
        {isFullyConnected ? (
          <div className="flex-1 container mx-auto px-4 py-8">
            <div className={(gameState || isAchievementsOpen || isLoading) ? 'invisible' : 'visible'}>
              <GameOptions onStartGame={initGame} />
            </div>
            
            {isAchievementsOpen && address && (
              <AchievementsDropdown
                isOpen={isAchievementsOpen}
                onClose={() => setIsAchievementsOpen(false)}
                walletAddress={address}
              />
            )}
            
            {/* Use shouldRenderGame flag and a unique key to ensure proper rendering */}
            {shouldRenderGame && gameState && gameState.questions && gameState.questions.length > 0 && (
              <div key={gameModalKey} className="game-modal-container">
                <GameModal
                  questions={gameState.questions}
                  sessionId={gameState.sessionId}
                  onClose={() => window.location.reload()}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center py-4 px-2">
            <div className="max-w-4xl mx-auto text-center space-y-4">
              <div className="space-y-3">
                <div className="inline-block mb-1 px-3 py-1 bg-gray-900/80 backdrop-blur-sm rounded-full border border-amber-600/30">
                  <span className="text-sm font-medium text-amber-600">Beta Version 1.0</span>
                </div>
                
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-600 to-orange-600 leading-tight glow-text">
                  Test Your Knowledge & Earn Rewards
                </h1>
                
                <p className="text-md md:text-lg text-gray-300 animate-fadeIn max-w-2xl mx-auto" style={{ animationDelay: '0.3s' }}>
                  Join the ultimate web3 trivia game. Challenge yourself, compete globally, and earn real rewards.
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fadeIn" style={{ animationDelay: '0.4s' }}>
                <div className="bg-gradient-to-br from-gray-900/90 to-gray-800/90 backdrop-blur-md p-4 rounded-xl border border-amber-600/20 hover:border-amber-600/40 transition-all group card-glow">
                  <div className="w-10 h-10 bg-gradient-to-r from-amber-600 to-orange-600 rounded-lg mb-3 flex items-center justify-center group-hover:scale-110 transition-transform shadow-md icon-glow">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-amber-600 mb-1">Daily Challenges</h3>
                  <p className="text-sm text-gray-300">Fresh trivia questions every day across multiple categories.</p>
                </div>
                <div className="bg-gradient-to-br from-gray-900/90 to-gray-800/90 backdrop-blur-md p-4 rounded-xl border border-amber-600/20 hover:border-amber-600/40 transition-all group card-glow">
                  <div className="w-10 h-10 bg-gradient-to-r from-amber-600 to-orange-600 rounded-lg mb-3 flex items-center justify-center group-hover:scale-110 transition-transform shadow-md icon-glow">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-amber-600 mb-1">Win Rewards</h3>
                  <p className="text-sm text-gray-300">Earn tokens and NFTs for your knowledge and fast responses.</p>
                </div>
                <div className="bg-gradient-to-br from-gray-900/90 to-gray-800/90 backdrop-blur-md p-4 rounded-xl border border-amber-600/20 hover:border-amber-600/40 transition-all group card-glow">
                  <div className="w-10 h-10 bg-gradient-to-r from-amber-600 to-orange-600 rounded-lg mb-3 flex items-center justify-center group-hover:scale-110 transition-transform shadow-md icon-glow">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-amber-600 mb-1">Global Rankings</h3>
                  <p className="text-sm text-gray-300">Compete with players worldwide and climb the leaderboard.</p>
                </div>
              </div>
              
              <div className="pt-12 pb-12 animate-fadeIn" style={{ animationDelay: '0.7s' }}>
                <div className="flex flex-col items-center space-y-3">
                  <CustomConnectButton />
                  <p className="text-sm text-gray-400">
                    Open Beta - Join now and be among the first to play!
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
      
      {!isFullyConnected && (
        <div className="mt-auto mb-2">
          <Footer />
        </div>
      )}
      {/* Achievement notifications will always be shown when unlocked */}
      <AchievementNotifications />
    </div>
  );
}