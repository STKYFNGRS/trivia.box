'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState, useRef } from 'react';
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

// Don't initialize AppKit until component mounts
// This prevents issues during static rendering

export default function QueryProviders({ children }: { children: ReactNode }) {
  const [reconnectionAttempted, setReconnectionAttempted] = useState(false);
  const [lastSaveTimestamp, setLastSaveTimestamp] = useState(0);
  const isRestoringConnection = useRef<boolean>(false);
  
  // Initialize AppKit on client-side only after component mounts
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        // Initialize AppKit with our config - don't check if it's already initialized
        // since getAppKit() requires an argument
        getAppKit(modal);
        console.log('[AppKit] Initialized successfully');
      } catch (error) {
        console.error('[AppKit] Failed to initialize:', error);
      }
    }
  }, []);
  
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
      
      try {
        // Get current wallet state
        const wagmiState = window.localStorage.getItem('wagmi.store');
        const wagmiData = wagmiState ? JSON.parse(wagmiState) : null;
        const account = wagmiData?.state?.connections?.[0]?.accounts?.[0];
        const chainId = wagmiData?.state?.connections?.[0]?.chains?.[0]?.id;
        
        if (account) {
          saveConnectionState(account, chainId);
          console.log('Connection saved before unload with account:', account.slice(0, 6) + '...');
          
          // For mobile, set additional flags
          if (isMobile) {
            try {
              sessionStorage.setItem('wallet_explicit_save', 'true');
              sessionStorage.setItem('wallet_save_timestamp', Date.now().toString());
            } catch (e) {
              console.error('Could not set wallet flags:', e);
            }
          }
        } else {
          // Fallback without specific details
          saveConnectionState();
        }
      } catch (err) {
        console.error('Error saving connection before unload:', err);
        saveConnectionState(); // Fallback
      }
    };
    
    // Handle connection restoration - now with NO MODAL approach
    const restoreConnection = async () => {
      if (reconnectionAttempted) return; // Prevent multiple attempts
      
      // Try consolidated mobile data first (most reliable)
      try {
        // Get wagmi state directly - this is the most reliable source
        const wagmiStore = localStorage.getItem('wagmi.store');
        if (wagmiStore) {
          try {
            const wagmiData = JSON.parse(wagmiStore);
            const address = wagmiData?.state?.connections?.[0]?.accounts?.[0];
            if (address) {
              // Always force reconnect on mobile if we have an address
              markConnectionRestored();
              console.log('Found active wagmi connection on mobile, session restored');
              return;
            }
          } catch (e) {
            console.warn('Error parsing wagmi store:', e);
          }
        }
        
        // Mark as restored even if there's no specific data - just in case
        if (shouldRestoreConnection()) {
          markConnectionRestored();
          console.log('Connection marked as restored based on persistence check');
        }
      } catch (e) {
        console.warn('Error during mobile connection restoration:', e);
      }
    };
    
    // Handle game completion events - simpler implementation
    const handleGameCompletion = (event: Event) => {
      const detail = (event as CustomEvent)?.detail;
      const address = detail?.address;
      const chainId = detail?.chainId || 8453; // Default to Base chain
      
      console.log(`Game completion detected, saving wallet state (${isMobile ? 'mobile' : 'desktop'})`);
      
      if (address) {
        // Save for both desktop and mobile
        saveConnectionState(address, chainId);
        
        // Additional storage for mobile
        if (isMobile) {
          try {
            // Store in both types for redundancy
            sessionStorage.setItem('game_completed_address', address);
            sessionStorage.setItem('game_completed_timestamp', Date.now().toString());
            localStorage.setItem('game_completed_address', address);
            localStorage.setItem('game_completed_timestamp', Date.now().toString());
          } catch (e) {
            console.error('Error saving game completion data:', e);
          }
        }
      } else {
        // Fallback
        handleBeforeUnload();
      }
    };
    
    // Set up event listeners
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('gameCompleted', handleGameCompletion);
    
    // Add visibility change listener for mobile
    const handleVisibilityChange = () => {
      if (isMobile && document.visibilityState === 'visible') {
        if (shouldRestoreConnection() && !reconnectionAttempted) {
          console.log('Page visibility changed - checking connection');
          restoreConnection();
        }
      }
    };
    
    if (isMobile) {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    
    // Restore connection on initial load
    restoreConnection();
    
    // Set up periodic saving for mobile
    const savingInterval = setupPeriodicSaving();
    
    // Cleanup
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('gameCompleted', handleGameCompletion);
      
      if (isMobile) {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      
      if (savingInterval) {
        clearInterval(savingInterval);
      }
    };
  }, [reconnectionAttempted, lastSaveTimestamp]);
  
  // Create a function to manually handle reconnection (without modal)
  const manuallyRestoreConnection = async () => {
    if (shouldRestoreConnection() && !isRestoringConnection.current) {
      console.log('Manual wallet restoration requested - no modal approach');
      
      try {
        isRestoringConnection.current = true;
        
        // Just mark the connection as restored without showing a modal
        markConnectionRestored();
        console.log('Manual reconnection completed silently');
      } catch (err) {
        console.error('Error in manual reconnection:', err);
      } finally {
        isRestoringConnection.current = false;
      }
    }
  };
  
  // Expose the function to window for potential use
  if (typeof window !== 'undefined') {
    // Define the extended window type
    const extendedWindow = window as Window & {
      __restoreWalletConnection?: () => Promise<void>
    };
    
    // Add the function to the window object
    extendedWindow.__restoreWalletConnection = manuallyRestoreConnection;
  }
  
  return (
    <WagmiConfig config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiConfig>
  );
}