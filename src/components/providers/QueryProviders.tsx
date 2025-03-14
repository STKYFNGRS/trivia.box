'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState, useRef } from 'react';
import { WagmiConfig } from 'wagmi';
import { config } from '@/config/wagmi';
import { getAppKit } from '@reown/appkit/react';
import { modal } from '@/config/appkit';
import { isMobileDevice } from '@/utils/deviceDetect';
import { saveConnectionState, shouldRestoreConnection, markConnectionRestored, getSavedConnectionDetails } from '@/utils/persistConnection';

// Create a QueryClient with settings optimized for wallet connection and ENS
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1, // Reduce retries to improve load time
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes for better caching
      gcTime: 1000 * 60 * 60, // 1 hour
    },
  },
});

// Define properly typed window interface to avoid any types
interface TriviaBoxConfig {
  enableSIWE: boolean;
  persistWalletState: boolean;
  environment: 'development' | 'production';
}

interface WindowWithTriviaBox extends Window {
  __SIWE_ALWAYS_ENABLED?: boolean;
  __TRIVIA_BOX_CONFIG?: TriviaBoxConfig;
  __restoreWalletConnection?: () => Promise<void>;
  __saveWalletStateOnGameCompletion?: (address: string, chainId?: number) => void;
  __dispatchGameCompletedEvent?: (address: string, chainId?: number) => void;
  triggerGameCompleted?: (address: string, chainId?: number) => void;
}

// Set up global error handler to capture and log unhandled errors
if (typeof window !== 'undefined') {
  window.addEventListener('error', function(event) {
    console.error('Global error caught:', event.error);
    
    // Log error for diagnostics
    try {
      localStorage.setItem('last_error', JSON.stringify({
        message: event.error?.message || 'Unknown error',
        stack: event.error?.stack,
        timestamp: new Date().toISOString(),
        url: window.location.href
      }));
    } catch (e) {
      // Ignore storage errors
    }
  });
  
  window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection:', event.reason);
    
    // Log for diagnostics
    try {
      localStorage.setItem('last_promise_error', JSON.stringify({
        message: event.reason?.message || 'Unknown promise error',
        stack: event.reason?.stack,
        timestamp: new Date().toISOString(),
        url: window.location.href
      }));
    } catch (e) {
      // Ignore storage errors
    }
  });
}

// Don't initialize AppKit until component mounts
// This prevents issues during static rendering

export default function QueryProviders({ children }: { children: ReactNode }) {
  const [reconnectionAttempted, setReconnectionAttempted] = useState(false);
  const [lastSaveTimestamp, setLastSaveTimestamp] = useState(0);
  const isRestoringConnection = useRef<boolean>(false);
  
  // Define missing utilities that were removed from deleted files
  
  // Simple function to save wallet state on game completion
  const saveWalletStateOnGameCompletion = (address: string, chainId?: number): void => {
    try {
      // Call the existing persistence function
      saveConnectionState(address, chainId);
      
      // Set additional game completion specific flags
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('game_completed_address', address);
          localStorage.setItem('game_completed_timestamp', Date.now().toString());
          
          if (isMobileDevice()) {
            sessionStorage.setItem('game_completed_address', address);
            sessionStorage.setItem('game_completed_timestamp', Date.now().toString());
          }
        } catch (e) {
          console.warn('Error setting game completion flags:', e);
        }
      }
      
      console.log(`Game completion wallet state saved for ${address.slice(0, 6)}...`);
    } catch (error) {
      console.error('Error saving wallet state on game completion:', error);
    }
  };

  // Simplified function for forced wallet reconnection
  const forceWalletReconnection = async (): Promise<boolean> => {
    try {
      if (!isMobileDevice()) return false;
      
      const { address } = getSavedConnectionDetails();
      if (!address) return false;
      
      console.log(`Attempting to force reconnection for address ${address.slice(0, 6)}...`);
      
      // Set flags to force reconnection
      try {
        localStorage.setItem('wallet_force_restored', 'true');
        localStorage.setItem('wallet_last_connected', address);
      } catch (e) {
        console.warn('Error setting reconnection flags:', e);
      }
      
      // Mark as restored
      markConnectionRestored();
      return true;
    } catch (error) {
      console.error('Error forcing wallet reconnection:', error);
      return false;
    }
  };

  // Simple wrapper for dispatching game completed events
  const dispatchGameCompletedEvent = (address: string, chainId = 8453): void => {
    try {
      // Save the state first
      saveWalletStateOnGameCompletion(address, chainId);
      
      // Then dispatch the event
      if (typeof window !== 'undefined') {
        try {
          const event = new CustomEvent('gameCompleted', {
            detail: { address, chainId, timestamp: Date.now() }
          });
          window.dispatchEvent(event);
          console.log(`Game completed event dispatched for ${address.slice(0, 6)}...`);
        } catch (e) {
          console.warn('Error dispatching game completed event:', e);
        }
      }
    } catch (error) {
      console.error('Error dispatching game completed event:', error);
    }
  };
  
  // Initialize AppKit on client-side only after component mounts
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        // Check if in development mode
        const isDevelopment = typeof window !== 'undefined' && 
                          (window.location.hostname === 'localhost' || 
                           window.location.hostname === '127.0.0.1');

        // Before initializing AppKit, force window settings to ensure SIWE is enabled
        if (typeof window !== 'undefined') {
          try {
            // Override any built-in checks that might disable SIWE
            const extWindow = window as unknown as WindowWithTriviaBox;
            extWindow.__SIWE_ALWAYS_ENABLED = true;
            extWindow.__TRIVIA_BOX_CONFIG = {
              enableSIWE: true,
              persistWalletState: true,
              environment: isDevelopment ? 'development' : 'production'
            };
            console.info(`[AppKit] Setting explicit SIWE flag for ${isDevelopment ? 'development' : 'production'} mode`);
          } catch (e) {
            console.warn('Error configuring SIWE flags:', e);
          }
        }

        // Initialize AppKit with our config - with error handling
        try {
          getAppKit(modal);
          console.log(`[AppKit] Initialized successfully in ${isDevelopment ? 'development' : 'production'} mode`);
        } catch (appkitError) {
          console.error('[AppKit] Error initializing AppKit:', appkitError);
        }
        
        // Always enable SIWE for better wallet persistence on all platforms
        console.info(`[AppKit] Running in ${isDevelopment ? 'development' : 'production'} mode - SIWE ENABLED for better wallet persistence`);
        
        // For mobile devices, set special flag to ensure persistence is honored
        if (isMobileDevice()) {
          try {
            // Create a global marker that this is a mobile device with persistence
            window.localStorage.setItem('mobile_persistence_enabled', 'true');
            window.sessionStorage.setItem('mobile_persistence_enabled', 'true');
            console.info('[AppKit] Mobile device detected - enhancing wallet persistence');
          } catch (e) {
            console.warn('[AppKit] Could not set mobile persistence flag:', e);
          }
        }
      } catch (error) {
        console.error('[AppKit] Failed to initialize:', error);
      }
    }
  }, []);
  
  // Handle connection persistence across refreshes with enhanced mobile support
  useEffect(() => {
    // Safety check for window object
    if (typeof window === 'undefined') return;
    
    // Detect mobile device - with error handling
    const isMobile = (() => {
      try {
        return isMobileDevice();
      } catch (err) {
        console.warn('[QueryProviders] Error detecting device type:', err);
        return false;
      }
    })();
    
    // Save connection state more frequently on mobile
    const setupPeriodicSaving = () => {
      if (isMobile) {
        // Every 15 seconds for mobile, to catch unexpected refreshes
        const interval = setInterval(() => {
          try {
            // Get current wallet state from wagmi - with additional error handling
            try {
              const wagmiState = window.localStorage.getItem('wagmi.store');
              if (!wagmiState) return; // Skip if no data
              
              const wagmiData = JSON.parse(wagmiState);
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
            } catch (parseError) {
              console.warn('Error parsing wagmi store during periodic save:', parseError);
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
        // Get current wallet state with added error handling
        try {
          const wagmiState = window.localStorage.getItem('wagmi.store');
          if (!wagmiState) {
            // Fallback if no wagmi state
            saveConnectionState();
            return;
          }
          
          const wagmiData = JSON.parse(wagmiState);
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
        } catch (parseError) {
          console.warn('Error getting wallet state before unload:', parseError);
          // Fallback without parse
          saveConnectionState();
        }
      } catch (err) {
        console.error('Error saving connection before unload:', err);
        try {
          saveConnectionState(); // Fallback
        } catch (e) {
          // Last resort - ignore
        }
      }
    };
    
    // Handle connection restoration - now with improved approach and error handling
    const restoreConnection = async () => {
      if (reconnectionAttempted) return; // Prevent multiple attempts
      
      // Try consolidated mobile data first (most reliable)
      try {
        // Run this inside a try-catch to prevent client-side exceptions
        setReconnectionAttempted(true);
        
        // For mobile, use our enhanced force reconnection first
        if (isMobile) {
          try {
            const reconnected = await forceWalletReconnection();
            if (reconnected) {
              console.log('Successfully forced wallet reconnection on mobile');
              return;
            }
          } catch (reconnectError) {
            console.warn('Error during force reconnection:', reconnectError);
          }
        }
        
        // Wrap all wallet operations in error handling
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
      } catch (e) {
        console.warn('Error in restoreConnection:', e);
      }
    };
    
    // Handle game completion events - improved implementation with better error handling
    const handleGameCompletion = (event: Event) => {
      // Safe access with optional chaining and type guards
      try {
        const customEvent = event as CustomEvent;
        const detail = customEvent?.detail;
        
        if (!detail) {
          console.warn('Game completion event without details');
          return;
        }
        
        const address = detail.address;
        const chainId = detail.chainId || 8453; // Default to Base chain
        
        console.log(`Game completion detected, saving wallet state (${isMobile ? 'mobile' : 'desktop'})`);
        
        if (address) {
          // Use our function for game completion
          saveWalletStateOnGameCompletion(address, chainId);
        } else {
          console.warn('Game completion event missing address');
        }
      } catch (err) {
        console.error('Error handling game completion:', err);
      }
    };
    
    // Set up event listeners
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('gameCompleted', handleGameCompletion);
    
    // Add visibility change listener for mobile
    const handleVisibilityChange = () => {
      try {
        if (isMobile && document.visibilityState === 'visible') {
          if (shouldRestoreConnection() && !reconnectionAttempted) {
            console.log('Page visibility changed - checking connection');
            restoreConnection();
          }
        }
      } catch (err) {
        console.warn('Error in visibility change handler:', err);
      }
    };
    
    if (isMobile) {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    
    // Restore connection on initial load - with delay for React hydration
    const initialRestoreTimeout = setTimeout(() => {
      try {
        restoreConnection();
        
        // On mobile, check more aggressively for reconnection opportunities
        if (isMobile) {
          // Add a second, later check for mobile to handle slower loading
          const secondaryTimeout = setTimeout(() => {
            try {
              if (!reconnectionAttempted || shouldRestoreConnection()) {
                console.log('Secondary mobile connection check running...');
                restoreConnection();
                
                // For mobile Safari, add an additional check after animation frame
                // This catches cases where the DOM has fully rendered
                requestAnimationFrame(() => {
                  const finalTimeout = setTimeout(() => {
                    try {
                      if (shouldRestoreConnection()) {
                        console.log('Final mobile connection check on RAF...');
                        restoreConnection();
                      }
                    } catch (e) {
                      console.warn('Error in RAF mobile connection check:', e);
                    }
                  }, 1000);
                  
                  // Cleanup timeout if component unmounts
                  return () => clearTimeout(finalTimeout);
                });
              }
            } catch (e) {
              console.warn('Error in secondary mobile connection check:', e);
            }
          }, 3000);
          
          // Cleanup timeout if component unmounts
          return () => clearTimeout(secondaryTimeout);
        }
      } catch (err) {
        console.error('Error during initial connection restoration:', err);
      }
    }, 1000);
    
    // Set up periodic saving for mobile
    const savingInterval = setupPeriodicSaving();
    
    // Cleanup all timeouts and event listeners
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('gameCompleted', handleGameCompletion);
      
      if (isMobile) {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      
      if (savingInterval) {
        clearInterval(savingInterval);
      }
      
      clearTimeout(initialRestoreTimeout);
    };
  }, [reconnectionAttempted, lastSaveTimestamp]);
  
  // Create a function to manually handle reconnection (without modal)
  const manuallyRestoreConnection = async () => {
    try {
      if (shouldRestoreConnection() && !isRestoringConnection.current) {
        console.log('Manual wallet restoration requested - no modal approach');
        
        try {
          isRestoringConnection.current = true;
          
          // Try force reconnection for mobile first
          if (isMobileDevice()) {
            const reconnected = await forceWalletReconnection();
            if (reconnected) {
              console.log('Manual reconnection completed with force reconnection');
              isRestoringConnection.current = false;
              return;
            }
          }
          
          // Just mark the connection as restored without showing a modal
          markConnectionRestored();
          console.log('Manual reconnection completed silently');
        } catch (err) {
          console.error('Error in manual reconnection:', err);
        } finally {
          isRestoringConnection.current = false;
        }
      }
    } catch (err) {
      console.error('Error in manuallyRestoreConnection:', err);
    }
  };
  
  // Expose wallet functions to window for game completion integration
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        // Add functions to the window object
        const extWindow = window as unknown as WindowWithTriviaBox;
        
        extWindow.__restoreWalletConnection = manuallyRestoreConnection;
        extWindow.__saveWalletStateOnGameCompletion = saveWalletStateOnGameCompletion;
        extWindow.__dispatchGameCompletedEvent = dispatchGameCompletedEvent;
        
        // Legacy function for backwards compatibility
        extWindow.triggerGameCompleted = (address: string, chainId = 8453) => {
          try {
            saveWalletStateOnGameCompletion(address, chainId);
            
            // Legacy event dispatch
            try {
              const event = new CustomEvent('gameCompleted', {
                detail: { address, chainId, timestamp: Date.now() }
              });
              window.dispatchEvent(event);
            } catch (e) {
              console.warn('Error dispatching legacy game completed event:', e);
            }
          } catch (error) {
            console.error('Error in triggerGameCompleted:', error);
          }
        };
      } catch (err) {
        console.warn('Error exposing wallet functions to window:', err);
      }
    }
    
    // No cleanup needed for this effect
  }, []);
  
  // Wrap in a try/catch to prevent provider initialization errors from crashing the app
  try {
    return (
      <WagmiConfig config={config}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </WagmiConfig>
    );
  } catch (error) {
    console.error('Error initializing providers:', error);
    // Fallback to just rendering children without providers
    // This allows the app to at least render something instead of a blank screen
    return <>{children}</>;
  }
}