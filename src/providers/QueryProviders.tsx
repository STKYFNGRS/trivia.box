'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState, useRef, useCallback } from 'react';
import { WagmiConfig } from 'wagmi';
import { config } from '@/config/wagmi';
import { getAppKit } from '@reown/appkit/react';
import { modal } from '@/config/appkit';
import { isMobileDevice } from '@/utils/deviceDetect';
import { 
  saveConnectionState, 
  shouldRestoreConnection, 
  markConnectionRestored,
  getSavedConnectionDetails
} from '@/utils/persistConnection';
import { logger } from '@/utils/logger';
import { createSafeMessageSender } from '@/utils/messageChannelHandler';

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

// Don't initialize AppKit until component mounts
// This prevents issues during static rendering

export default function QueryProviders({ children }: { children: ReactNode }) {
  const [reconnectionAttempted, setReconnectionAttempted] = useState(false);
  const [lastSaveTimestamp, setLastSaveTimestamp] = useState(0);
  const safeParentMessageSender = useRef<ReturnType<typeof createSafeMessageSender> | null>(null);
  
  // Create safe parent message sender for iframe scenarios
  useEffect(() => {
    if (typeof window !== 'undefined' && window.parent !== window) {
      try {
        safeParentMessageSender.current = createSafeMessageSender(window.parent, 5000);
        logger.info('Created safe parent window message sender', { component: 'QueryProviders' });
      } catch (err) {
        logger.warn('Failed to create parent message sender', { 
          component: 'QueryProviders',
          meta: { error: err instanceof Error ? err.message : String(err) }
        });
      }
    }
  }, []);
  
  // Initialize AppKit on client-side only after component mounts
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        // Check if in development mode
        const isDevelopment = typeof window !== 'undefined' && 
                          (window.location.hostname === 'localhost' || 
                           window.location.hostname === '127.0.0.1');

        // Initialize AppKit with our config
        getAppKit(modal);
        logger.info(`AppKit initialized successfully in ${isDevelopment ? 'development' : 'production'} mode`, 
          { component: 'AppKit' });
        
        if (isDevelopment) {
          logger.info('Running in development mode - SIWE is disabled to avoid local verification issues', 
            { component: 'AppKit' });
        }
      } catch (error) {
        logger.error('Failed to initialize AppKit', { 
          component: 'AppKit',
          meta: { error: error instanceof Error ? error.message : String(error) }
        });
      }
    }
  }, []);
  
  // Safe function to send messages to parent if in iframe
  const notifyParentWindow = useCallback((messageType: string, data?: Record<string, unknown>) => {
    if (typeof window !== 'undefined' && window.parent !== window && safeParentMessageSender.current) {
      try {
        safeParentMessageSender.current({ type: messageType, data });
      } catch (err) {
        logger.warn(`Failed to send ${messageType} to parent`, { 
          component: 'QueryProviders',
          meta: { error: err instanceof Error ? err.message : String(err) }
        });
      }
    }
  }, []);
  
  // Handle connection persistence across refreshes with enhanced mobile support
  useEffect(() => {
    // Detect mobile device - with error handling
    const isMobile = (() => {
      try {
        return isMobileDevice();
      } catch (err) {
        logger.warn('Error detecting device type', { 
          component: 'QueryProviders',
          meta: { error: err instanceof Error ? err.message : String(err) }
        });
        return false;
      }
    })();
    
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
                logger.debug('Periodic connection state saved for mobile', { component: 'QueryProviders' });
              }
            }
          } catch (err) {
            logger.error('Error during periodic connection save', { 
              component: 'QueryProviders',
              meta: { error: err instanceof Error ? err.message : String(err) }
            });
          }
        }, 15000);
        
        return interval;
      }
      return undefined;
    };
    
    // Capture refresh events
    const handleBeforeUnload = () => {
      logger.info('Page is about to unload, saving wallet state...', { component: 'QueryProviders' });
      
      try {
        // Get current wallet state
        const wagmiState = window.localStorage.getItem('wagmi.store');
        const wagmiData = wagmiState ? JSON.parse(wagmiState) : null;
        const account = wagmiData?.state?.connections?.[0]?.accounts?.[0];
        const chainId = wagmiData?.state?.connections?.[0]?.chains?.[0]?.id;
        
        if (account) {
          saveConnectionState(account, chainId);
          logger.info(`Connection saved before unload with account: ${account.slice(0, 6)}...`, 
            { component: 'QueryProviders' });
          
          // For mobile, set additional flags
          if (isMobile) {
            try {
              sessionStorage.setItem('wallet_explicit_save', 'true');
              sessionStorage.setItem('wallet_save_timestamp', Date.now().toString());
            } catch (e) {
              logger.error('Could not set wallet flags', { 
                component: 'QueryProviders',
                meta: { error: e instanceof Error ? e.message : String(e) }
              });
            }
          }
          
          // Notify parent window if in iframe
          notifyParentWindow('WALLET_BEFORE_UNLOAD', { 
            address: account, 
            chainId, 
            timestamp: Date.now() 
          });
        } else {
          // Fallback without specific details
          saveConnectionState();
        }
      } catch (err) {
        logger.error('Error saving connection before unload', { 
          component: 'QueryProviders',
          meta: { error: err instanceof Error ? err.message : String(err) }
        });
        saveConnectionState(); // Fallback
      }
    };
    
    // Handle connection restoration - now with NO MODAL approach
    const restoreConnection = async () => {
      if (reconnectionAttempted) return; // Prevent multiple attempts
      
      // Try consolidated mobile data first (most reliable)
      try {
        // Run this inside a try-catch to prevent client-side exceptions
        setReconnectionAttempted(true);
        
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
                logger.info('Found active wagmi connection on mobile, session restored', 
                  { component: 'QueryProviders' });
                
                // Notify parent window if in iframe
                notifyParentWindow('CONNECTION_RESTORED_AUTOMATIC', { 
                  address, 
                  source: 'wagmi.store',
                  autoRestored: true
                });
                
                return;
              }
            } catch (e) {
              logger.warn('Error parsing wagmi store', { 
                component: 'QueryProviders',
                meta: { error: e instanceof Error ? e.message : String(e) }
              });
            }
          }
          
          // Mark as restored even if there's no specific data - just in case
          if (shouldRestoreConnection()) {
            markConnectionRestored();
            logger.info('Connection marked as restored based on persistence check', 
              { component: 'QueryProviders' });
            
            // Get any connection details that might be available
            const details = getSavedConnectionDetails();
            if (details.address) {
              notifyParentWindow('CONNECTION_RESTORED_AUTOMATIC', { 
                ...details, 
                source: 'persistence_check',
                autoRestored: true
              });
            }
          }
        } catch (e) {
          logger.warn('Error during mobile connection restoration', { 
            component: 'QueryProviders',
            meta: { error: e instanceof Error ? e.message : String(e) }
          });
        }
      } catch (e) {
        logger.warn('Error in restoreConnection', { 
          component: 'QueryProviders',
          meta: { error: e instanceof Error ? e.message : String(e) }
        });
      }
    };
    
    // Handle game completion events - simpler implementation
    const handleGameCompletion = (event: Event) => {
      // Safe access with optional chaining and type guards
      try {
        const detail = (event as CustomEvent)?.detail;
        const address = detail?.address;
        const chainId = detail?.chainId || 8453; // Default to Base chain
        
        logger.info(`Game completion detected, saving wallet state (${isMobile ? 'mobile' : 'desktop'})`, 
          { component: 'QueryProviders' });
        
        if (address) {
          // Save for both desktop and mobile
          saveConnectionState(address, chainId);
          
          // Additional storage for mobile
          if (isMobile) {
            try {
              // Store in both types for redundancy
              localStorage.setItem('game_completed_address', address);
              localStorage.setItem('game_completed_timestamp', Date.now().toString());
              sessionStorage.setItem('game_completed_address', address);
              sessionStorage.setItem('game_completed_timestamp', Date.now().toString());
            } catch (e) {
              logger.error('Error saving game completion data', { 
                component: 'QueryProviders',
                meta: { error: e instanceof Error ? e.message : String(e) }
              });
            }
          }
          
          // Notify parent window if in iframe
          notifyParentWindow('GAME_COMPLETED', { address, chainId });
        }
      } catch (err) {
        logger.error('Error handling game completion', { 
          component: 'QueryProviders',
          meta: { error: err instanceof Error ? err.message : String(err) }
        });
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
            logger.info('Page visibility changed - checking connection', { component: 'QueryProviders' });
            restoreConnection();
          }
        }
      } catch (err) {
        logger.warn('Error in visibility change handler', { 
          component: 'QueryProviders',
          meta: { error: err instanceof Error ? err.message : String(err) }
        });
      }
    };
    
    if (isMobile) {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    
    // Restore connection on initial load - with delay for React hydration
    setTimeout(() => {
      try {
        restoreConnection();
      } catch (err) {
        logger.error('Error during initial connection restoration', { 
          component: 'QueryProviders',
          meta: { error: err instanceof Error ? err.message : String(err) }
        });
      }
    }, 1000);
    
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
  }, [reconnectionAttempted, lastSaveTimestamp, notifyParentWindow]);

  return (
    <WagmiConfig config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiConfig>
  );
}