'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { cleanupWalletConnections, preventAutoConnection } from '@/utils/cleanupConnection';
import { useAccount } from 'wagmi';
import { useGameState } from '@/hooks/useGameState';
import dynamic from 'next/dynamic';
import GameOptions from '@/components/game/GameOptions';
import CustomConnectButton from '@/components/shared/CustomConnectButton';
import Header from '@/components/shared/Header';
import LoadingAnimation from '@/components/ui/LoadingAnimation';
import Footer from '@/components/shared/Footer';
import GameModalFallback from '@/components/game/GameModalFallback';

// Helper function for debouncing
function debounce(func, wait) {
  let timeout;
  const debounced = function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
  debounced.cancel = function() {
    clearTimeout(timeout);
  };
  return debounced;
}

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
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [isAchievementsOpen, setIsAchievementsOpen] = useState(false);
  const { address, isConnected, chainId } = useAccount();
  const { gameState, initGame, isLoading, error, isMobile, refreshStats, refreshLeaderboard } = useGameState();
  const [initializationAttempts, setInitializationAttempts] = useState(0);
  
  // Reference to track if we've attempted connection restoration
  const connectionAttempted = useRef(false);
  
  // Initial load checks - fix for mobile refresh issue
  const initialLoadDone = useRef(false);

  // Handle initial page load to prevent unnecessary loading screen
  useEffect(() => {
    if (!initialLoadDone.current) {
      initialLoadDone.current = true;

      // Check if we have an active game session or recently completed a game
      // If so, don't clear the wallet connection state
      const hasCompletedGame = localStorage.getItem('game_completed_address') || 
                             sessionStorage.getItem('game_completed_address');
      const hasActiveWallet = localStorage.getItem('walletConnectionState') === 'connected';
      
      // Check for stored mobile connection
      const hasMobileWallet = isMobile && (
        localStorage.getItem('mobile_walletConnection') ||
        sessionStorage.getItem('mobile_walletConnection') ||
        localStorage.getItem('mobile_wallet_backup') ||
        sessionStorage.getItem('mobile_wallet_backup')
      );
      
      // Only clean up wallet connections if we don't have a completed game or active wallet
      if (!hasCompletedGame && !hasActiveWallet && !hasMobileWallet) {
        // Clean up any existing wallet connections to prevent auto-connect
        cleanupWalletConnections();
        preventAutoConnection();
        
        // Also try to disconnect using the modal directly
        setTimeout(() => {
          try {
            import('@/config/appkit').then(({ modal }) => {
              modal.disconnect().catch(() => {});
            }).catch(() => {});
          } catch {
            // Ignore errors
          }
        }, 100);
      } else {
        console.log('Detected completed game or active wallet connection - preserving wallet state');
        
        if (hasMobileWallet) {
          console.log('📱 Detected stored mobile wallet - preserving connection');
        }
      }
      
      // Short delay to allow component to fully render and hydrate
      const timer = setTimeout(() => {
        // We're ready
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isMobile]);

  // Enhanced mobile initialization - fix for mobile refresh issues
  useEffect(() => {
    // Mark initial load as complete first
    initialLoadDone.current = true;

    // Special Samsung Note 8 handling - works around Chrome issues on this device
    if (isMobile && typeof window !== 'undefined') {
      const userAgent = window.navigator.userAgent.toLowerCase();
      const isSamsungDevice = userAgent.includes('sm-n9');
      
      // Every mobile device needs a reconnection check first, but we need to ensure hydration is complete
      const checkAndReconnectMobile = async () => {
        try {
          // Prevent any errors during hydration by wrapping in try/catch
          try {
            // Check if we should be reconnecting
            const { shouldRestoreConnection } = await import('@/utils/persistConnection');
            const shouldReconnect = await shouldRestoreConnection();
            
            if (shouldReconnect && !isConnected) {
              console.log('📱 Mobile device detected with stored wallet data - attempting reconnection');
              
              try {
                // Try to force wallet reconnection
                import('@/utils/persistConnection').then(({ getSavedConnectionDetails, markConnectionRestored }) => {
                  // Get the connection details
                  const connectionDetails = getSavedConnectionDetails();
                  if (connectionDetails.address) {
                    console.log('📱 Found saved connection details, attempting to restore');
                    markConnectionRestored();
                    
                    // Dispatch wallet refresh event
                    setTimeout(() => {
                      window.dispatchEvent(new CustomEvent('refreshWalletStats'));
                    }, 1000);
                  }
                });
              } catch (e) {
                console.warn('📱 Error during mobile wallet reconnection:', e);
              }
            }
          } catch (e) {
            console.warn('📱 Error checking mobile connection status:', e);
          }
        } catch (err) {
          // Catch any top-level errors to prevent client-side exception
          console.error('📱 Critical error in mobile reconnection:', err);
        }
      };
      
      // Delay mobile reconnection checks to ensure hydration is complete
      const reconnectionTimer = setTimeout(() => {
        checkAndReconnectMobile();
      }, 1500); // Increased delay for safer hydration

      // Fix for the landing page appearing on refresh issue
      if (isSamsungDevice) {
        // Wait just a moment to let React hydration complete
        setTimeout(() => {
          // Get wallet state directly
          try {
            const wagmiStore = localStorage.getItem('wagmi.store');
            if (wagmiStore) {
              try {
                const wagmiData = JSON.parse(wagmiStore);
                const hasAccount = wagmiData?.state?.connections?.[0]?.accounts?.[0];

                // Force a wallet state refresh if we've got an account but don't appear connected
                if (hasAccount && !isConnected) {
                  console.log('🔄 Samsung device detected with wallet data but no active connection - forcing refresh');
                  if (window.location.href.includes('#')) {
                    // Remove hash to ensure full reload
                    window.location.href = window.location.href.split('#')[0];
                  } else {
                    window.location.reload();
                  }
                }
              } catch {
                // Ignore parse errors
              }
            }
          } catch {
            // Ignore storage errors
          }
        }, 500);
      }

      return () => {
        clearTimeout(reconnectionTimer);
      };
    }
  }, [isMobile, isConnected]);

  // Handle beforeunload event differently on mobile vs desktop
  useEffect(() => {
    // Only set up if we have an active game
    if (gameState) {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        // On mobile, we want to allow refreshes (which will restore state)
        // On desktop, we show the confirmation dialog
        if (!isMobile) {
          // Desktop behavior - show confirmation dialog
          e.preventDefault();
          e.returnValue = '';
          return '';
        } else {
          // Mobile behavior - just let it refresh naturally
          // No need to show confirmation dialog
          console.log('🎮 ClientPage: Page refresh on mobile detected, state will be restored');

          // For mobile, explicitly try to save connection state before unload
          try {
            if (address) {
              import('@/utils/persistConnection').then(module => {
                module.saveConnectionState(address, chainId || 8453);
                console.log('📱 ClientPage: Mobile wallet state saved before refresh');
              }).catch(err => {
                console.warn('📱 ClientPage: Error saving mobile wallet state:', err);
              });
            }
          } catch (err) {
            console.warn('📱 ClientPage: Error saving mobile wallet state:', err);
          }
        }
      };

      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }
  }, [gameState, isMobile, address, chainId]);

  // Enhanced debugging for game state changes
  useEffect(() => {
    console.log('🎲 ClientPage: Game state updated:', gameState ? 'YES' : 'NO');

    if (gameState) {
      console.log('🎲 ClientPage: Game state details:', {
        sessionId: gameState.sessionId,
        questionCount: gameState.questions?.length,
        timestamp: new Date().toISOString()
      });
    }
  }, [gameState]);

  // Debug effect for error and loading state changes
  useEffect(() => {
    console.log(`🎲 ClientPage: isLoading=${isLoading}, error=${error || 'none'}`);
  }, [isLoading, error]);

  // Enhanced mobile-specific connection restoration
  useEffect(() => {
    // Only on mobile and only run this once per page load
    if (isMobile && !connectionAttempted.current && typeof window !== 'undefined') {
      connectionAttempted.current = true;

      // Check if we might need to restore connection
      const checkMobileConnection = async () => {
        try {
          console.log('📱 ClientPage: Checking if mobile wallet connection needs restoration');

          // First, check wagmi store directly as a reliable source of connected state
          const wagmiStore = window.localStorage.getItem('wagmi.store');
          let hasActiveConnection = false;

          if (wagmiStore) {
            try {
              const wagmiData = JSON.parse(wagmiStore);
              if (wagmiData?.state?.connections?.[0]?.accounts?.[0]) {
                console.log('📱 ClientPage: Found active connection in wagmi store');
                hasActiveConnection = true;
              }
            } catch (err) {
              console.warn('Error checking wagmi store:', err);
            }
          }

          // Checking for any connection persistence markers
          const persistFlag = localStorage.getItem('prevent_disconnect') === 'true' || 
                            localStorage.getItem('walletConnectionState') === 'connected';

          if (persistFlag) {
            console.log('📱 ClientPage: Found wallet persistence flag');
          }

          // Always check for any saved connection, even if wagmi doesn't show it
          try {
            // Use setTimeout to delay execution and prevent React hydration errors
            setTimeout(async () => {
              const shouldRestore = hasActiveConnection || persistFlag || await import('@/utils/persistConnection')
                .then(module => module.shouldRestoreConnection())
                .catch(() => false);

              if (shouldRestore && !isConnected) {
                console.log('📱 ClientPage: Mobile device needs wallet reconnection');
                
                // Attempt to save any existing connection data to prevent it from being lost
                if (address) {
                  try {
                    import('@/utils/persistConnection').then(module => {
                      module.saveConnectionState(address, chainId || 8453);
                      console.log('📱 ClientPage: Reinforcing existing mobile connection');
                    }).catch(err => {
                      console.warn('📱 ClientPage: Error saving mobile wallet state:', err);
                    });
                  } catch (err) {
                    console.warn('📱 ClientPage: Error saving mobile wallet state:', err);
                  }
                }

                // Keep monitoring for successful connection
                const checkWalletConnected = setInterval(() => {
                  // Check if we're now connected
                  const wagmiState = window.localStorage.getItem('wagmi.store');
                  if (wagmiState) {
                    try {
                      const parsedState = JSON.parse(wagmiState);
                      if (parsedState?.state?.connections?.[0]?.accounts?.[0]) {
                        console.log('📱 ClientPage: Wallet successfully reconnected');
                        clearInterval(checkWalletConnected);

                        // Force refresh stats
                        window.dispatchEvent(new CustomEvent('refreshWalletStats'));
                      }
                    } catch (err) {
                      console.warn('Error parsing wagmi state:', err);
                    }
                  }
                }, 1000);

                // Safety timeout after 10 seconds
                setTimeout(() => {
                  clearInterval(checkWalletConnected);
                }, 10000);
              }
            }, 800);
          } catch (err) {
            console.error('📱 ClientPage: Error in delayed connection check:', err);
          }
        } catch (err) {
          console.error('📱 ClientPage: Error checking mobile connection state:', err);
        }
      };

      // Wait a moment for page to fully load
      const mobileCheckTimer = setTimeout(() => {
        checkMobileConnection();
      }, 1500); // Increased delay to ensure hydration is complete

      return () => {
        clearTimeout(mobileCheckTimer);
      };
    }
  }, [isMobile, isConnected, address, chainId]);

  // Handle the start game callback with detailed error handling
  const handleStartGame = (options: { questionCount: number; category: string; difficulty: string }) => {
    console.log('🎲 ClientPage: handleStartGame called with:', options);

    try {
      // Track initialization attempts
      setInitializationAttempts(prev => prev + 1);

      // Create a custom event for analytics/debugging
      const eventDetail = {
        ...options,
        attempt: initializationAttempts + 1,
        timestamp: new Date().toISOString()
      };

      // Dispatch a custom event that can be caught by browser devtools
      const gameStartEvent = new CustomEvent('game_start_attempt', { detail: eventDetail });
      window.dispatchEvent(gameStartEvent);

      // Make sure we're initializing with the correct options
      console.log('🎲 ClientPage: Calling initGame function...');
      initGame(options);

      console.log('🎲 ClientPage: initGame function called successfully');
    } catch (error) {
      console.error('🛑 ClientPage: Error in handleStartGame:', error);
    }
  };

  // Force a re-render of the GameModal component when game state changes
  // This helps ensure the component is properly mounted
  const gameModalKey = gameState ? `game-modal-${gameState.sessionId}-${Date.now()}` : 'no-game';

  // Listen for resetGameState events from GameModal
  useEffect(() => {
    const handleResetGameState = () => {
      console.log('Resetting game state from event');
    };

    window.addEventListener('resetGameState', handleResetGameState);
    return () => window.removeEventListener('resetGameState', handleResetGameState);
  }, []);

  // Add a flag to prevent multiple cleanups
  const cleanupInProgress = useRef(false);

  // Add a function to manually refresh stats and leaderboard with debouncing
  const refreshGameData = useCallback(() => {
    console.log('📊 ClientPage: Manually refreshing game stats and leaderboard (debounced)');
    if (refreshStats) refreshStats(); 
    if (refreshLeaderboard) refreshLeaderboard();
  }, [refreshStats, refreshLeaderboard]);
  
  // Listen for refreshWalletStats events with debouncing
  useEffect(() => {
    const handleRefreshStats = debounce(() => {
      console.log('📊 ClientPage: Refreshing stats from event (debounced)');
      refreshGameData();
    }, 300);

    window.addEventListener('refreshWalletStats', handleRefreshStats);
    return () => {
      window.removeEventListener('refreshWalletStats', handleRefreshStats);
      handleRefreshStats.cancel(); // Clear any pending debounced calls
    };
  }, [refreshGameData]);

  // Add listener for gameClose and gameCompletion events to properly clean up and refresh stats
  useEffect(() => {
    const handleGameClose = () => {
      if (cleanupInProgress.current) {
        console.log('Game cleanup already in progress, skipping redundant call');
        return;
      }
      
      cleanupInProgress.current = true;
      console.log('Game close event received, cleaning up game state');
      
      try {
        // Refresh wallet stats when returning to main screen - with debounce built in
        console.log('Refreshing wallet stats after game close');
        window.dispatchEvent(new CustomEvent('refreshWalletStats', { 
          detail: { forceRefresh: true } 
        }));

        // For mobile, ensure wallet connection is maintained
        if (isMobile && address) {
          try {
            console.log('Reinforcing mobile wallet connection after game close');
            import('@/utils/persistConnection').then(({ saveConnectionState }) => {
              saveConnectionState(address, chainId || 8453);
            }).catch(err => console.warn('Error saving connection during game close:', err));
          } catch (err) {
            console.warn('Error during mobile wallet preservation:', err);
          }
        }

        // Ensure game settings are shown
        window.dispatchEvent(new CustomEvent('showGameSettings'));

        // Clear cleanup flag after a slight delay
        setTimeout(() => {
          cleanupInProgress.current = false;
        }, 500);
      } catch (error) {
        console.error('Error during game state cleanup:', error);
        cleanupInProgress.current = false;
      }
    };

    const handleGameCompletion = (event: CustomEvent) => {
      // Immediately update any UI that needs to show the new score
      if (event.detail && event.detail.finalScore) {
        console.log(`Game completed with score: ${event.detail.finalScore}`);
      }
      
      // Always ensure stats and leaderboard are updated after game completion
      setTimeout(() => refreshGameData(), 500);
    };

    window.addEventListener('gameClose', handleGameClose);
    window.addEventListener('gameCompleted', handleGameCompletion as EventListener);

    return () => {
      window.removeEventListener('gameClose', handleGameClose);
      window.removeEventListener('gameCompleted', handleGameCompletion as EventListener);
    };
  }, [isMobile, address, chainId, refreshGameData]);

  // Consider connected when wallet is connected and on Base chain
  const isFullyConnected = isConnected && chainId === 8453;

  // Log render info outside JSX
  if (gameState && gameState.questions && gameState.questions.length > 0) {
    console.log('🎲 ClientPage: Rendering GameModal with', gameState.questions.length, 'questions and sessionId:', gameState.sessionId);
  }

  return (
    <div className="flex flex-col min-h-screen">
      <ParticleBackground gameLoading={isLoading} />
      
      <LoadingAnimation isLoading={isLoading && initialLoadDone.current} />
      
      {/* Mobile session restore notification removed as requested */}
      
      {isFullyConnected && (
        <Header 
          onAchievementsClick={() => {
            // First close leaderboard (if open)
            if (isLeaderboardOpen) {
              setIsLeaderboardOpen(false);
            }
            // Then open achievements - this is the source of truth
            setIsAchievementsOpen(true);
            // Prevent game options from showing
            window.dispatchEvent(new CustomEvent('hideGameSettings'));
          }} 
          onLeaderboardOpen={(isOpen) => {
            // Update leaderboard state
            setIsLeaderboardOpen(isOpen);
            // If opening leaderboard, make sure achievements are closed
            if (isOpen && isAchievementsOpen) {
              setIsAchievementsOpen(false);
            }
          }}
        />
      )}
      
      <main className={`flex-1 flex flex-col ${isFullyConnected ? 'pt-12' : ''} relative z-10`}>
        {isFullyConnected ? (
          <div className="flex-1 container mx-auto px-4 py-8">
            <div className={(gameState || isAchievementsOpen || isLoading || isLeaderboardOpen) ? 'invisible' : 'visible'}>
              <GameOptions onStartGame={handleStartGame} />
            </div>
            
            {isAchievementsOpen && address && (
              <AchievementsDropdown
                isOpen={isAchievementsOpen}
                onClose={() => {
                  console.log('ClientPage: AchievementsDropdown onClose called');
                  // First set state to false
                  setIsAchievementsOpen(false);
                  // Then show game settings
                  window.dispatchEvent(new CustomEvent('showGameSettings'));
                }}
                walletAddress={address}
              />
            )}
            
            {/* Use explicit conditional check without console.log in JSX */}
            {gameState && gameState.questions && gameState.questions.length > 0 && (
              <div key={gameModalKey} className="game-modal-container">
                <GameModal
                questions={gameState.questions}
                sessionId={gameState.sessionId}
                onClose={() => {
                  console.log('Game closing from onClose handler');
                  
                  // Force a refresh of stats and leaderboard
                  if (refreshStats) refreshStats();
                  if (refreshLeaderboard) refreshLeaderboard();
                  
                  // Dispatch gameClose event to trigger full state reset
                  // This will be caught by the listener we set up earlier
                  setTimeout(() => {
                    if (typeof window !== 'undefined') {
                      window.dispatchEvent(new CustomEvent('gameClose'));
                    }
                  }, 50);
                }}
                onGameComplete={async (score) => {
                  console.log('Game completed with score:', score);
                  
                  // Force immediate stats refresh
                  if (refreshStats) refreshStats();
                  if (refreshLeaderboard) refreshLeaderboard();
                  
                  // For mobile, make sure to preserve wallet connection on completion
                  if (isMobile && address) {
                    try {
                      console.log('Preserving mobile wallet connection after game completion');
                      const { saveConnectionState } = await import('@/utils/persistConnection');
                      saveConnectionState(address, chainId || 8453);
                    } catch (err) {
                      console.warn('Error preserving wallet connection:', err);
                    }
                  }
                }}
              />
              </div>
            )}
            
            {/* Display error if something fails */}
            {error && !isLoading && !gameState && (
              <div className="fixed inset-0 flex items-center justify-center z-50">
                <div className="bg-red-900/90 p-6 rounded-xl border border-red-500/50 text-white max-w-md">
                  <h3 className="text-xl font-bold mb-2">Error Starting Game</h3>
                  <p className="mb-4">{error}</p>
                  <button 
                    onClick={() => window.location.reload()}
                    className="bg-red-700 hover:bg-red-600 px-4 py-2 rounded-lg font-medium transition-colors"
                  >
                    Reload Page
                  </button>
                </div>
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
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-600 to-amber-700 flex items-center justify-center mb-3 shadow-lg shadow-amber-600/20">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-amber-600 mb-1">Test Your Knowledge</h3>
                  <p className="text-sm text-gray-300">Challenge yourself with diverse trivia across multiple categories and difficulty levels.</p>
                </div>
                
                <div className="bg-gradient-to-br from-gray-900/90 to-gray-800/90 backdrop-blur-md p-4 rounded-xl border border-amber-600/20 hover:border-amber-600/40 transition-all group card-glow">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-600 to-amber-700 flex items-center justify-center mb-3 shadow-lg shadow-amber-600/20">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-amber-600 mb-1">Compete Globally</h3>
                  <p className="text-sm text-gray-300">Climb the leaderboard and compare your scores with players worldwide.</p>
                </div>
                
                <div className="bg-gradient-to-br from-gray-900/90 to-gray-800/90 backdrop-blur-md p-4 rounded-xl border border-amber-600/20 hover:border-amber-600/40 transition-all group card-glow">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-600 to-amber-700 flex items-center justify-center mb-3 shadow-lg shadow-amber-600/20">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-amber-600 mb-1">Win Rewards</h3>
                  <p className="text-sm text-gray-300">Earn tokens and NFTs for your knowledge and fast responses.</p>
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