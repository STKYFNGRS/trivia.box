'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect } from 'react';
import { WagmiConfig } from 'wagmi';
import { config } from '@/config/wagmi';
import { getAppKit } from '@reown/appkit/react';
import { modal } from '@/config/appkit';
import { isMobileDevice } from '@/utils/deviceDetect';
import { saveConnectionState, shouldRestoreConnection, clearConnectionState, getSavedConnectionDetails, markConnectionRestored } from '@/utils/persistConnection';

// Create a QueryClient with settings optimized for wallet connection and ENS
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1, // Reduce retries to improve load time
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes for better caching
      gcTime: 1000 * 60 * 60, // 1 hour
      refetchOnMount: false, // Don't refetch on mount to speed up initial load
      refetchOnReconnect: false // Don't refetch on reconnect
      // Note: cacheTime was renamed to gcTime in React Query v5
    }
  }
});

// Initialize AppKit before provider render
if (typeof window !== 'undefined') {
  getAppKit(modal);
}

export default function QueryProviders({ children }: { children: ReactNode }) {
  // Handle connection persistence across refreshes on mobile
  useEffect(() => {
    // Check if this is a mobile device
    const isMobile = isMobileDevice();
    
    // Capture refresh events
    const handleBeforeUnload = () => {
      // Always try to save the wallet state on any device
      // This helps with game completion reconnection as well
      try {
        // Get current wallet state from wagmi
        const wagmiState = window.localStorage.getItem('wagmi.store');
        const wagmiData = wagmiState ? JSON.parse(wagmiState) : null;
        const account = wagmiData?.state?.connections?.[0]?.accounts?.[0];
        const chainId = wagmiData?.state?.connections?.[0]?.chains?.[0]?.id;
        
        if (account) {
          saveConnectionState(account, chainId);
        }
      } catch (err) {
        console.error('Error accessing wagmi state:', err);
        // Fallback to basic connection saving
        saveConnectionState();
      }
    };

    // Restore connection after refresh
    const checkSavedConnection = () => {
      if (shouldRestoreConnection()) {
        console.log('Found recent connection state, reconnecting wallet');
        
        // Get saved details
        const savedDetails = getSavedConnectionDetails();
        console.log('Saved connection details:', savedDetails);
        
        // Trigger wallet reconnect after a short delay
        setTimeout(() => {
          try {
            modal.open().catch(err => console.error('Error reopening connection modal:', err));
            // Mark as restored but don't clear yet
            markConnectionRestored();
          } catch (err) {
            console.error('Error reconnecting wallet:', err);
            // Only clear on failure
            clearConnectionState();
          }
        }, 1000);
      }
    };

    // Add event listeners
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // Check for saved connection on page load
    checkSavedConnection();
    
    // Also listen for game completion events
    const handleGameCompletion = () => {
      console.log('Game completion detected, ensuring connection persistence');
      handleBeforeUnload();
    };
    
    window.addEventListener('gameCompleted', handleGameCompletion);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('gameCompleted', handleGameCompletion);
    };
  }, []);
  
  return (
    <WagmiConfig config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiConfig>
  );
}
