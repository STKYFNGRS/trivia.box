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

// Initialize AppKit before provider render
if (typeof window !== 'undefined') {
  getAppKit(modal);
}

export default function QueryProviders({ children }: { children: ReactNode }) {
  const [reconnectionAttempted, setReconnectionAttempted] = useState(false);
  const [lastSaveTimestamp, setLastSaveTimestamp] = useState(0);
  const reconnectAttemptCount = useRef(0);
  const reconnectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectLastCall = useRef<number>(0);
  
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
            
            // For mobile, we set a flag to indicate this was an explicit save
            // This helps with reconnection after refresh
            try {
              sessionStorage.setItem('wallet_explicit_save', 'true');
              sessionStorage.setItem('wallet_save_timestamp', Date.now().toString());
            } catch (e) {
              console.error('Could not set mobile wallet explicit save flag:', e);
            }
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
    
    // Enhanced mobile reconnection with staged approach
    const performMobileReconnection = async () => {
      // For safety, don't try too many reconnects
      const maxAttempts = 3;
      if (reconnectAttemptCount.current >= maxAttempts) {
        console.log('Maximum reconnection attempts reached');
        return false;
      }
      
      // Rate limit reconnection attempts
      const now = Date.now();
      if (now - reconnectLastCall.current < 2000) {
        console.log('Reconnection attempts being made too quickly, throttling');
        return false;
      }
      reconnectLastCall.current = now;
      
      try {
        reconnectAttemptCount.current++;
        console.log(`Mobile reconnection attempt ${reconnectAttemptCount.current}/${maxAttempts}`);
        
        // Get saved connection details
        const { address } = getSavedConnectionDetails();
        
        // Clear any previous pending reconnection
        if (reconnectionTimeoutRef.current) {
          clearTimeout(reconnectionTimeoutRef.current);
          reconnectionTimeoutRef.current = null;
        }
        
        // Check for cached wagmi state before trying to open the modal
        const wagmiState = window.localStorage.getItem('wagmi.store');
        if (wagmiState) {
          try {
            // If state contains connection data, we might not need to reconnect
            const wagmiData = JSON.parse(wagmiState);
            const hasConnectedAccount = wagmiData?.state?.connections?.[0]?.accounts?.[0];
            
            if (hasConnectedAccount) {
              console.log('Found existing wagmi connection, may not need to reconnect');
              // Mark as restored since connection exists
              markConnectionRestored();
              return true;
            }
          } catch (e) {
            console.error('Error checking wagmi state:', e);
          }
        }
        
        // Attempt to open connection dialog
        await modal.open();
        console.log('Mobile reconnection attempt succeeded');
        markConnectionRestored();
        return true;
      } catch (error) {
        console.error('Mobile reconnection attempt failed:', error);
        
        // Schedule another attempt if we haven't reached the limit
        if (reconnectAttemptCount.current < maxAttempts) {
          console.log(`Scheduling reconnection attempt ${reconnectAttemptCount.current + 1}/${maxAttempts}...`);
          reconnectionTimeoutRef.current = setTimeout(() => {
            performMobileReconnection();
          }, 2000); // Increased delay between attempts
        }
        
        return false;
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
        
        // For mobile, use enhanced staged approach
        if (isMobile) {
          // Reset attempt counter
          reconnectAttemptCount.current = 0;
          
          // Start the mobile-specific reconnection process
          const success = await performMobileReconnection();
          
          if (success) {
            console.log('Mobile connection successfully restored');
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
      
      // For mobile, set specific values to assist with reconnection
      if (isMobile && address) {
        try {
          sessionStorage.setItem('game_completed_address', address);
          sessionStorage.setItem('game_completed_timestamp', Date.now().toString());
        } catch (e) {
          console.error('Error saving game completion data:', e);
        }
      }
    };
    
    // Special handler for mobile page visibility changes
    const handleVisibilityChange = () => {
      if (isMobile && document.visibilityState === 'visible') {
        console.log('Mobile page became visible again, checking connection');
        
        // If we have a saved connection, verify it's still active
        if (shouldRestoreConnection() && !reconnectionAttempted) {
          console.log('Page visibility changed - attempting reconnection');
          restoreConnection();
        }
      }
    };
    
    // Set up event listeners
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('gameCompleted', handleGameCompletion);
    
    // Add visibility change listener for mobile devices
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
      
      if (reconnectionTimeoutRef.current) {
        clearTimeout(reconnectionTimeoutRef.current);
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
