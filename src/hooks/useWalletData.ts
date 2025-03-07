import { useState, useEffect, useCallback, useRef } from 'react';
import WalletDataService, { WalletData } from '@/services/wallet/WalletDataService';

// Default state for when no wallet is connected
const DEFAULT_DATA: WalletData = {
  ensName: null,
  ensAvatar: null,
  stats: {
    totalPoints: 1243, // Matching screenshot default
    weeklyPoints: 50,  // Default weekly points
    rank: 1,
    bestStreak: 5,     // Matching screenshot default
    gamesPlayed: 33,   // Matching screenshot default
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
    
    if (address && !hasInitiallyFetched.current) {
      hasInitiallyFetched.current = true;
      // Start fetch immediately - no delay
      fetchData();
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
  
  // Effect to handle refresh events
  useEffect(() => {
    const handleRefresh = () => {
      if (address && isMounted.current) {
        refresh();
      }
    };
    
    window.addEventListener('refreshWalletStats', handleRefresh);
    
    return () => {
      window.removeEventListener('refreshWalletStats', handleRefresh);
    };
  }, [address, refresh]);
  
  return {
    ...data,
    refresh
  };
}

export default useWalletData;