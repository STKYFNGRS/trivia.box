import { useState, useEffect, useCallback, useRef } from 'react';
import { log } from '@/utils/logger';
import WalletDataService, { WalletData } from '@/services/wallet/WalletDataService';

// Default state for when no wallet is connected or data is loading
const DEFAULT_DATA: WalletData = {
  ensName: null,
  ensAvatar: null,
  stats: {
    totalPoints: 0,
    rank: 1,
    bestStreak: 0,
    gamesPlayed: 0,
    trivia_achievements: []
  },
  leaderboard: [],
  isLoading: false,
  error: null
};

export function useWalletData(address: string | undefined) {
  const [data, setData] = useState<WalletData>({
    ...DEFAULT_DATA,
    isLoading: !!address
  });
  
  const isMounted = useRef(true);
  const hasInitiallyFetched = useRef(false);
  const dataFetchedOnce = useRef(false);
  
  // Use singleton service
  const walletService = WalletDataService.getInstance();
  
  // Reset/update data when address changes
  useEffect(() => {
    if (address) {
      setData(prev => ({
        ...DEFAULT_DATA,
        isLoading: true
      }));
      dataFetchedOnce.current = false;
    }
  }, [address]);
  
  // Optimized fetch data function
  const fetchData = useCallback(async () => {
    if (!address || !isMounted.current) return;
    
    // Only show loading state on first fetch
    if (!dataFetchedOnce.current) {
      setData(prev => ({
        ...prev,
        isLoading: true
      }));
    }
    
    try {
      const walletData = await walletService.fetchWalletData(address);
      
      // Debug log to check what's coming back from the API
      log.debug('Wallet data received:', { component: 'useWalletData', meta: {
        ensName: walletData.ensName,
        ensAvatar: walletData.ensAvatar ? 'Avatar present' : 'No avatar',
        stats: walletData.stats ? {
          totalPoints: walletData.stats.totalPoints,
          rank: walletData.stats.rank,
          bestStreak: walletData.stats.bestStreak,
          gamesPlayed: walletData.stats.gamesPlayed
        } : null,
        leaderboardCount: walletData.leaderboard?.length || 0
      }});
      if (walletData.stats) {
        log.debug(`Best streak from API: ${walletData.stats.bestStreak}`, { component: 'useWalletData' });
      }
      
      if (isMounted.current) {
        // Performance optimization: only update state with the values that changed
        setData(prev => {
          // First fetch: replace all with new data
          if (!dataFetchedOnce.current) {
            dataFetchedOnce.current = true;
            return {
              ...walletData,
              isLoading: false
            };
          }
          
          // Subsequent fetches: only update what changed
          const updates: Partial<WalletData> = { isLoading: false };
          
          if (walletData.ensName !== prev.ensName) {
            updates.ensName = walletData.ensName;
          }
          
          if (walletData.ensAvatar !== prev.ensAvatar) {
            updates.ensAvatar = walletData.ensAvatar;
          }
          
          if (walletData.stats && JSON.stringify(walletData.stats) !== JSON.stringify(prev.stats)) {
            updates.stats = walletData.stats;
          }
          
          if (walletData.leaderboard.length && JSON.stringify(walletData.leaderboard) !== JSON.stringify(prev.leaderboard)) {
            updates.leaderboard = walletData.leaderboard;
          }
          
          return {...prev, ...updates};
        });
      }
    } catch (error) {
      console.error('Error in useWalletData:', error);
      
      if (isMounted.current) {
        setData(prev => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error : new Error('Failed to fetch wallet data')
        }));
      }
    }
  }, [address, walletService]);
  
  // Refresh function for external triggers
  const refresh = useCallback(() => {
    if (address) {
      fetchData();
    }
  }, [address, fetchData]);
  
  // Effect to fetch data when address changes
  useEffect(() => {
    isMounted.current = true;
    
    // Set environment type first
    if (typeof window !== 'undefined') {
      const isDevelopment = window.location.hostname === 'localhost' || 
                           window.location.hostname === '127.0.0.1';
      (window as any).ENV_TYPE = isDevelopment ? 'development' : 'production';
      log.info(`Setting environment to ${isDevelopment ? 'development' : 'production'} mode before fetch`, { component: 'useWalletData' });
    }
    
    if (address && !hasInitiallyFetched.current) {
      hasInitiallyFetched.current = true;
      // Give a brief delay to ensure environment setting has propagated
      setTimeout(() => {
        if (isMounted.current) {
          log.info('Starting initial fetch with environment type set', { component: 'useWalletData' });
          fetchData();
        }
      }, 100);
    }
    
    return () => {
      isMounted.current = false;
    };
  }, [address, fetchData]);
  
  // Listen for ENS avatar updates from async resolution
  useEffect(() => {
    const handleEnsAvatarUpdate = (event: CustomEvent) => {
      if (event.detail && event.detail.address === address && event.detail.avatar) {
        setData(prev => ({
          ...prev,
          ensAvatar: event.detail.avatar
        }));
      }
    };
    
    window.addEventListener('ensAvatarUpdated', handleEnsAvatarUpdate as EventListener);
    
    return () => {
      window.removeEventListener('ensAvatarUpdated', handleEnsAvatarUpdate as EventListener);
    };
  }, [address]);
  
  // Effect to handle refresh events with enhanced force refresh option
  useEffect(() => {
    const handleRefresh = (event: any) => {
      if (address && isMounted.current) {
        // Check if this is a force refresh request
        const forceRefresh = event?.detail?.forceRefresh === true;
        
        if (forceRefresh) {
          // For force refresh, clear cache first
          if (walletService && walletService.invalidateCache) {
            log.info('Force refreshing wallet data due to game completion', { component: 'useWalletData' });
            walletService.invalidateCache(address);
          }
          
          // Set to loading state to show visual indicator that refresh is happening
          setData(prev => ({
            ...prev,
            isLoading: true
          }));
        }
        
        // Delay slightly to ensure UI updates before fetch begins
        setTimeout(() => {
          refresh();
        }, forceRefresh ? 10 : 100);
      }
    };
    
    // Listen for both standard refreshWalletStats event and preGameCompletion event
    window.addEventListener('refreshWalletStats', handleRefresh);
    window.addEventListener('preGameCompletion', (event) => {
      // When we get a preGameCompletion event, update immediately with estimated score
      if (event.detail && event.detail.finalScore && data.stats) {
        // Update the stats immediately with the known final score
        const updatedStats = {
          ...data.stats,
          totalPoints: (data.stats.totalPoints || 0) + event.detail.finalScore
        };
        
        // Update state with optimistic data
        setData(prev => ({
          ...prev,
          stats: updatedStats
        }));
        
        // Also force a refresh to get official data
        handleRefresh({ detail: { forceRefresh: true } });
      }
    });
    
    return () => {
      window.removeEventListener('refreshWalletStats', handleRefresh);
      window.removeEventListener('preGameCompletion', handleRefresh);
    };
  }, [address, refresh, walletService, data.stats]);
  
  return {
    ...data,
    refresh
  };
}

export default useWalletData;