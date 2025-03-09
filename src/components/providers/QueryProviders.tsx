'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
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
  const [reconnectionAttempted, setReconnectionAttempted] = useState(false);
  const [lastSaveTimestamp, setLastSaveTimestamp] = useState(0);
  
  // Handle connection persistence across refreshes with enhanced mobile support
  useEffect(() => {
    // Detect mobile device
    const isMobile = isMobileDevice();
    
    // Save connection state more frequently on mobile
    const setupPeriodicSaving = () => {
      if (isMobile) {
        // Every 15 seconds for mobile, to catch unexpected refreshes
        const interval = setInterval(() => {
          try {
            // Get current wallet state from wagmi
            const wagmiState = window.localStorage.getItem('wagmi.store');
            const wagmiData = wagmiState ? JSON.parse(wagmiState) : null;
            const account = wagmiData?.state?.connections?.[0]?.accounts?.[0];
            const chainId = wagmiData?.state?.connections?.[0]?.chains?.[0]?.id;
            
            if (account) {
              const now = Date.now();
              // Only save if enough time has passed (avoid excessive writes)
              if (now - lastSaveTimestamp > 10000) { // 10 seconds
                saveConnectionState(account, chainId);
                setLastSaveTimestamp(now);
                console.log('Periodic connection state saved for mobile');
              }
            }
          } catch (err) {
            console.error('Error during periodic connection save:', err);
          }
        }, 15000);
        
        return interval;
      }
      return undefined;
    };
    
    // Capture refresh events
    const handleBeforeUnload = () => {
      console.log('Page is about to unload, saving wallet state...');
      
      // More aggressive saving attempt for mobile
      if (isMobile) {
        try {
          // Save multiple times with different strategies for mobile
          // Immediate save with current state
          const wagmiState = window.localStorage.getItem('wagmi.store');
          const wagmiData = wagmiState ? JSON.parse(wagmiState) : null;
          const account = wagmiData?.state?.connections?.[0]?.accounts?.[0];
          const chainId = wagmiData?.state?.connections?.[0]?.chains?.[0]?.id;
          
          if (account) {
            // Use enhanced saving for mobile
            saveConnectionState(account, chainId);
            console.log('Mobile connection saved before unload with account:', account.slice(0, 6) + '...');
          } else {
            // Fallback without specific details
            saveConnectionState();
            console.log('Mobile connection saved without account details (fallback)');
          }
        } catch (mobileErr) {
          console.error('Error saving mobile connection before unload:', mobileErr);
          saveConnectionState(); // Last resort fallback
        }
      } else {
        // Standard desktop behavior
        try {
          const wagmiState = window.localStorage.getItem('wagmi.store');
          const wagmiData = wagmiState ? JSON.parse(wagmiState) : null;
          const account = wagmiData?.state?.connections?.[0]?.accounts?.[0];
          const chainId = wagmiData?.state?.connections?.[0]?.chains?.[0]?.id;
          
          if (account) {
            saveConnectionState(account, chainId);
            console.log('Desktop connection saved before unload with account:', account.slice(0, 6) + '...');
          } else {
            saveConnectionState();
          }
        } catch (err) {
          console.error('Error saving connection before unload:', err);
          saveConnectionState(); // Fallback
        }
      }
    };
    
    // Handle connection restore with more resilience for mobile
    const restoreConnection = async () => {
      if (reconnectionAttempted) return; // Prevent multiple attempts
      
      if (shouldRestoreConnection()) {
        console.log('Found recent connection state, reconnecting wallet...');
        setReconnectionAttempted(true);
        
        // Get saved details
        const savedDetails = getSavedConnectionDetails();
        console.log('Saved connection details:', savedDetails.address ? 
          `${savedDetails.address.slice(0, 6)}...` : 'No address');
        
        // For mobile, use a staged approach with multiple attempts if needed
        if (isMobile) {
          let reconnectSuccess = false;
          
          // First attempt - immediate
          try {
            await modal.open();
            console.log('First reconnection attempt completed');
            reconnectSuccess = true;
          } catch (firstErr) {
            console.warn('First reconnection attempt failed:', firstErr);
          }
          
          // Second attempt after delay if needed
          if (!reconnectSuccess) {
            try {
              console.log('Trying reconnection again after delay...');
              
              // Short delay before second attempt
              await new Promise(resolve => setTimeout(resolve, 1500));
              
              await modal.open();
              console.log('Second reconnection attempt completed');
              reconnectSuccess = true;
            } catch (secondErr) {
              console.error('Second reconnection attempt failed:', secondErr);
            }
          }
          
          // Mark as restored but keep state for future attempts
          if (reconnectSuccess) {
            markConnectionRestored();
            console.log('Mobile connection successfully restored');
          } else {
            // Only clear on complete failure after all attempts
            console.error('All reconnection attempts failed on mobile');
          }
        } else {
          // Standard desktop behavior
          try {
            await modal.open();
            markConnectionRestored();
            console.log('Desktop connection restored');
          } catch (err) {
            console.error('Error reconnecting wallet on desktop:', err);
            clearConnectionState();
          }
        }
      }
    };
    
    // Handle game completion events
    const handleGameCompletion = (event: Event) => {
      console.log('Game completion detected, ensuring connection persistence');
      // Extract any details from the event if available
      const detail = (event as CustomEvent)?.detail;
      const address = detail?.address;
      const chainId = detail?.chainId || 8453; // Default to Base chain
      
      if (address) {
        saveConnectionState(address, chainId);
      } else {
        handleBeforeUnload();
      }
    };
    
    // Set up event listeners
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('gameCompleted', handleGameCompletion);
    
    // Restore connection on initial load
    restoreConnection();
    
    // Set up periodic saving for mobile
    const savingInterval = setupPeriodicSaving();
    
    // Cleanup
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('gameCompleted', handleGameCompletion);
      
      if (savingInterval) {
        clearInterval(savingInterval);
      }
    };
  }, [reconnectionAttempted, lastSaveTimestamp]);
  
  return (
    <WagmiConfig config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiConfig>
  );
}
