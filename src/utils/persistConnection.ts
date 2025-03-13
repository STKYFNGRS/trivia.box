/**
 * Utility functions for persisting wallet connection state
 * Especially useful for mobile browsers that lose connection state on refresh
 */

import { isMobileDevice } from './deviceDetect';
import { logger } from './logger';
import { createSafeMessageSender } from './messageChannelHandler';

// Storage keys
const CONNECTION_STATE_KEY = 'walletConnectionState';
const CONNECTION_TIMESTAMP_KEY = 'connectionTimestamp';
const CONNECTION_ADDRESS_KEY = 'connectedAddress';
const CONNECTION_CHAIN_ID_KEY = 'connectedChainId';

// Mobile-specific settings
const MOBILE_CONNECTION_KEY = 'mobile_walletConnection';
const MOBILE_BACKUP_KEY = 'mobile_wallet_backup';

/**
 * Save wallet connection state before unload or game completion
 * Enhanced for mobile with additional storage methods
 */
export function saveConnectionState(address?: string, chainId?: number): void {
  try {
    logger.info(`Saving connection state ${address ? `for ${address.slice(0, 6)}...` : '(no address)'}`);
    
    // Primary storage (localStorage)
    localStorage.setItem(CONNECTION_STATE_KEY, 'connected');
    localStorage.setItem(CONNECTION_TIMESTAMP_KEY, Date.now().toString());
    
    // Store address and chain ID if provided
    if (address) {
      localStorage.setItem(CONNECTION_ADDRESS_KEY, address);
    }
    
    if (chainId) {
      localStorage.setItem(CONNECTION_CHAIN_ID_KEY, chainId.toString());
    }
    
    // Additional persistence methods for mobile
    if (isMobileDevice()) {
      try {
        // Use sessionStorage as backup
        sessionStorage.setItem(CONNECTION_STATE_KEY, 'connected');
        sessionStorage.setItem(CONNECTION_TIMESTAMP_KEY, Date.now().toString());
        
        if (address) {
          sessionStorage.setItem(CONNECTION_ADDRESS_KEY, address);
        }
        
        if (chainId) {
          sessionStorage.setItem(CONNECTION_CHAIN_ID_KEY, chainId?.toString() || '');
        }
        
        // Create a consolidated mobile connection object for more reliable storage
        const connectionData = {
          state: 'connected',
          timestamp: Date.now(),
          address: address || '',
          chainId: chainId || 0,
          lastUpdated: new Date().toISOString(),
          mobilePersisted: true,
          appVersion: '1.1',  // Track version for future migrations
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 day expiration
        };
        
        // Store in both localStorage and sessionStorage for redundancy
        const connectionString = JSON.stringify(connectionData);
        localStorage.setItem(MOBILE_CONNECTION_KEY, connectionString);
        sessionStorage.setItem(MOBILE_CONNECTION_KEY, connectionString);
        
        // Create additional backup copies with different keys to avoid issues
        // with certain mobile browsers that might clear specific keys
        localStorage.setItem(MOBILE_BACKUP_KEY, connectionString);
        sessionStorage.setItem(MOBILE_BACKUP_KEY, connectionString);
        
        // Set cookie backup method for Safari
        try {
          if (address) {
            // Use cookie as a backup method for iOS Safari
            const expiration = new Date();
            expiration.setTime(expiration.getTime() + (2 * 60 * 60 * 1000)); // 2 hours
            
            document.cookie = `mobile_wallet_address=${address}; path=/; expires=${expiration.toUTCString()}; SameSite=Strict`;
            document.cookie = `mobile_wallet_timestamp=${Date.now()}; path=/; expires=${expiration.toUTCString()}; SameSite=Strict`;
            
            // Also set special flags for preventing sign prompts
            localStorage.setItem('prevent_disconnect', 'true');
            sessionStorage.setItem('prevent_disconnect', 'true');
            
            // Store in wallet-specific formats that might be recognized by various libraries
            localStorage.setItem('wallet_connected', 'true');
            sessionStorage.setItem('wallet_connected', 'true');
            localStorage.setItem('wallet_last_connected', address);
            sessionStorage.setItem('wallet_last_connected', address);
          }
        } catch (cookieErr) {
          console.warn('Error setting connection cookies:', cookieErr);
        }
        
        console.log('Mobile connection state saved successfully with additional methods');
      } catch (mobileErr) {
        console.warn('Additional mobile persistence failed', mobileErr);
      }
    }

    // If in an iframe context, notify parent safely
    if (typeof window !== 'undefined' && window.parent !== window) {
      try {
        const safeSend = createSafeMessageSender(window.parent);
        safeSend({ 
          type: 'CONNECTION_SAVED', 
          data: { address, chainId }
        });
      } catch (err) {
        logger.warn('Failed to notify parent window of connection save', { 
          component: 'persistConnection',
          meta: { error: String(err) } 
        });
      }
    }
  } catch (err) {
    logger.error('Error saving connection state:', { 
      component: 'persistConnection',
      meta: { error: String(err) }
    });
  }
}

/**
 * Check if we need to restore connection after refresh
 * Enhanced with multiple storage checks for mobile
 */
export function shouldRestoreConnection(): boolean {
  try {
    const isMobile = isMobileDevice();
    const deviceType = isMobile ? 'Mobile' : 'Desktop';
    
    // SIMPLER MOBILE DETECTION:
    // For mobile devices, ALWAYS try to restore if we have any connection data
    // This is more permissive but fixes issues with mobile reconnection
    if (isMobile) {
      // Check for ANY connection data in ANY storage medium
      const hasAnyConnectionData = [        
        // Check wallet activation flags first (most common)
        localStorage.getItem('prevent_disconnect'),
        sessionStorage.getItem('prevent_disconnect'),
        localStorage.getItem('wallet_connected'),
        sessionStorage.getItem('wallet_connected'),
        localStorage.getItem('wallet_last_connected'),
        sessionStorage.getItem('wallet_last_connected'),
        localStorage.getItem('mobile_wallet_address'),
        sessionStorage.getItem('mobile_wallet_address'),
        localStorage.getItem('mobile_last_connected'),
        localStorage.getItem('mobile_last_connection_time'),

        // Check SIWE/AppKit storage 
        localStorage.getItem('trivia-box-siwe-mobile-v1'),
        sessionStorage.getItem('trivia-box-siwe-mobile-v1'),
        localStorage.getItem('mobile_wallet_session_backup'),
        sessionStorage.getItem('mobile_wallet_session_backup'),
        
        // Check wagmi store - the most reliable source
        localStorage.getItem('wagmi.store'),
        localStorage.getItem('mobile_wagmi_persistence'),
        
        // Check our custom storage keys
        localStorage.getItem(MOBILE_CONNECTION_KEY),
        sessionStorage.getItem(MOBILE_CONNECTION_KEY),
        localStorage.getItem(MOBILE_BACKUP_KEY),
        sessionStorage.getItem(MOBILE_BACKUP_KEY),
        localStorage.getItem(CONNECTION_STATE_KEY),
        sessionStorage.getItem(CONNECTION_STATE_KEY),
        localStorage.getItem(CONNECTION_ADDRESS_KEY),
        sessionStorage.getItem(CONNECTION_ADDRESS_KEY),
        
        // Check game completion flags
        localStorage.getItem('game_completed_address'),
        sessionStorage.getItem('game_completed_address')
      ].some(item => item && item !== 'null' && item !== 'undefined');
      
      console.log(`${deviceType} restore check: ${hasAnyConnectionData ? 'WILL RESTORE' : 'No connection data found'}`);
      return hasAnyConnectionData;
    }
    
    // For desktop, keep existing more restrictive logic but with a longer timeout
    // Desktop devices should only restore in specific cases
    if (!isMobile) {
      // Check only if there are explicit connection keys and the wallet was definitely connected
      const hasConnectionState = localStorage.getItem(CONNECTION_STATE_KEY) === 'connected';
      const hasAddress = localStorage.getItem(CONNECTION_ADDRESS_KEY) !== null;
      
      // Also check for recent game completion flags
      const hasCompletedGame = localStorage.getItem('game_completed_address') || 
                              sessionStorage.getItem('game_completed_address');
      
      // Log for desktop
      logger.info(`${deviceType} restore check - Connection state: ${hasConnectionState}, Address: ${hasAddress ? 'present' : 'missing'}, Game completed: ${hasCompletedGame ? 'yes' : 'no'}`);
      
      // If we have game completion data or an active wallet session, always restore
      // This is critical for maintaining wallet state on refresh
      const hasActiveSession = localStorage.getItem('trivia-box-siwe-mobile-v1') || 
                            localStorage.getItem('trivia-box-siwe-v8');
                            
      if (hasCompletedGame || hasActiveSession) {
        logger.info(`${deviceType} detected completed game or active wallet connection - preserving wallet state`);
        
        // Safely notify parent if in iframe
        if (typeof window !== 'undefined' && window.parent !== window) {
          try {
            const safeSend = createSafeMessageSender(window.parent);
            const address = hasAddress ? localStorage.getItem(CONNECTION_ADDRESS_KEY) : null;
            safeSend({ 
              type: 'CONNECTION_RESTORED', 
              data: { address, source: 'game_completion' }
            });
          } catch (err) {
            logger.warn('Failed to notify parent of connection restoration', { 
              component: 'persistConnection',
              meta: { error: String(err) }
            });
          }
        }
        
        return true;
      }
      
      // Only return true for desktop if both conditions are met
      if (hasConnectionState && hasAddress) {
        const connectionTimestamp = localStorage.getItem(CONNECTION_TIMESTAMP_KEY);
        if (connectionTimestamp) {
          const timestamp = parseInt(connectionTimestamp, 10);
          const now = Date.now();
          const ageInMinutes = Math.round((now - timestamp) / (60 * 1000));
          // Extend the restoration window to 30 minutes (from 5 minutes)
          const shouldRestore = ageInMinutes < 30; // 30 minutes
          
          console.log(`${deviceType} connection age: ${ageInMinutes} minutes, will ${shouldRestore ? '' : 'NOT '}restore`);
          return shouldRestore;
        }
      }
      
      console.log(`${deviceType} restore check - Will NOT restore connection`);
      return false; // Default to not restoring on desktop
    }
    
    return false;
  } catch (err) {
    logger.error('Error checking connection state:', { 
      component: 'persistConnection',
      meta: { error: String(err) }
    });
    return false;
  }
}

/**
 * Get the saved connection details
 * Enhanced with multiple storage checks for mobile
 */
export function getSavedConnectionDetails(): { address?: string; chainId?: number } {
  try {
    // For mobile, try consolidated data first
    if (isMobileDevice()) {
      try {
        // Try SIWE storage first
        const siweData = localStorage.getItem('trivia-box-siwe-mobile-v1') || 
                        sessionStorage.getItem('trivia-box-siwe-mobile-v1');
        
        if (siweData) {
          try {
            const parsed = JSON.parse(siweData);
            if (parsed && parsed.session && parsed.session.address) {
              console.log('Retrieved connection details from SIWE storage');
              return { 
                address: parsed.session.address,
                chainId: 8453 // Default to Base chain for SIWE connections
              };
            }
          } catch (e) {
            console.warn('Error parsing SIWE data:', e);
          }
        }
        
        // Try all possible storage locations
        const mobileDataStr = 
          localStorage.getItem(MOBILE_CONNECTION_KEY) || 
          sessionStorage.getItem(MOBILE_CONNECTION_KEY) ||
          localStorage.getItem(MOBILE_BACKUP_KEY) ||
          sessionStorage.getItem(MOBILE_BACKUP_KEY) ||
          localStorage.getItem('mobile_wallet_session_backup') ||
          sessionStorage.getItem('mobile_wallet_session_backup');
        
        if (mobileDataStr) {
          const mobileData = JSON.parse(mobileDataStr);
          if (mobileData.address) {
            console.log('Retrieved connection details from mobile-enhanced storage');
            return { 
              address: mobileData.address, 
              chainId: mobileData.chainId || 8453 // Default to Base chain
            };
          }
        }
        
        // Check cookies as fallback (iOS Safari)
        if (document.cookie) {
          const addressMatch = document.cookie.match(/mobile_wallet_address=([^;]+)/);
          if (addressMatch && addressMatch[1]) {
            console.log('Retrieved connection address from cookie:', addressMatch[1]);
            return { address: addressMatch[1], chainId: 8453 };
          }
        }
        
        // Check for game completion data in both storage types
        const gameCompletionAddress = 
          localStorage.getItem('game_completed_address') ||
          sessionStorage.getItem('game_completed_address') ||
          localStorage.getItem('wallet_last_connected') ||
          sessionStorage.getItem('wallet_last_connected') ||
          localStorage.getItem('mobile_wallet_address') ||
          sessionStorage.getItem('mobile_wallet_address');
          
        if (gameCompletionAddress) {
          console.log('Retrieved connection address from game completion or wallet flags:', gameCompletionAddress);
          return { address: gameCompletionAddress, chainId: 8453 };
        }
        
        // Check for wagmi store directly as a last resort
        try {
          // First try mobile persistence key
          const mobilePersistence = localStorage.getItem('mobile_wagmi_persistence');
          if (mobilePersistence) {
            const wagmiData = JSON.parse(mobilePersistence);
            const address = wagmiData?.state?.connections?.[0]?.accounts?.[0];
            const chainId = wagmiData?.state?.connections?.[0]?.chains?.[0]?.id;
            
            if (address) {
              console.log('Retrieved connection address from mobile wagmi persistence:', address);
              return { address, chainId: chainId || 8453 };
            }
          }
          
          // Fall back to standard wagmi store
          const wagmiStore = localStorage.getItem('wagmi.store');
          if (wagmiStore) {
            const wagmiData = JSON.parse(wagmiStore);
            const address = wagmiData?.state?.connections?.[0]?.accounts?.[0];
            const chainId = wagmiData?.state?.connections?.[0]?.chains?.[0]?.id;
            
            if (address) {
              console.log('Retrieved connection address from wagmi store:', address);
              return { address, chainId: chainId || 8453 };
            }
          }
        } catch (e) {
          console.warn('Error checking wagmi store:', e);
        }
      } catch (mobileErr) {
        console.error('Error retrieving mobile connection data:', mobileErr);
        // Continue to standard retrieval if mobile-specific retrieval fails
      }
    }
    
    // Standard retrieval (fallback)
    const address = localStorage.getItem(CONNECTION_ADDRESS_KEY) || 
                   sessionStorage.getItem(CONNECTION_ADDRESS_KEY) || 
                   undefined;
    
    const chainIdStr = localStorage.getItem(CONNECTION_CHAIN_ID_KEY) || 
                      sessionStorage.getItem(CONNECTION_CHAIN_ID_KEY) || 
                      '8453'; // Default to Base chain
                      
    const chainId = chainIdStr ? parseInt(chainIdStr, 10) : undefined;
    
    return { address, chainId };
  } catch (err) {
    console.error('Error getting saved connection details:', err);
    return {};
  }
}

/**
 * Mark connection as restored but keep state
 * Enhanced for mobile persistence
 */
export function markConnectionRestored(): void {
  try {
    // Update timestamp in standard storage
    const timestamp = Date.now().toString();
    localStorage.setItem(CONNECTION_TIMESTAMP_KEY, timestamp);
    
    // For mobile, update all storage methods
    if (isMobileDevice()) {
      try {
        sessionStorage.setItem(CONNECTION_TIMESTAMP_KEY, timestamp);
        
        // Update mobile-specific storage
        const mobileDataStr = localStorage.getItem(MOBILE_CONNECTION_KEY) || 
                             sessionStorage.getItem(MOBILE_CONNECTION_KEY) ||
                             localStorage.getItem(MOBILE_BACKUP_KEY) ||
                             sessionStorage.getItem(MOBILE_BACKUP_KEY);
        
        if (mobileDataStr) {
          const mobileData = JSON.parse(mobileDataStr);
          mobileData.timestamp = Date.now();
          mobileData.lastUpdated = new Date().toISOString();
          mobileData.restored = true;
          // Extend expiration time
          mobileData.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
          
          const updatedStr = JSON.stringify(mobileData);
          localStorage.setItem(MOBILE_CONNECTION_KEY, updatedStr);
          sessionStorage.setItem(MOBILE_CONNECTION_KEY, updatedStr);
          localStorage.setItem(MOBILE_BACKUP_KEY, updatedStr);
          sessionStorage.setItem(MOBILE_BACKUP_KEY, updatedStr);
        }
        
        // Update cookie if using that fallback
        if (document.cookie.includes('mobile_wallet_address')) {
          // Extend cookie expiration for 2 more hours
          const expiration = new Date();
          expiration.setTime(expiration.getTime() + (2 * 60 * 60 * 1000)); // 2 hours
          document.cookie = `mobile_wallet_timestamp=${Date.now()}; path=/; expires=${expiration.toUTCString()}; SameSite=Strict`;
        }
        
        // Make sure we have the prevent_disconnect flag set
        localStorage.setItem('prevent_disconnect', 'true');
        sessionStorage.setItem('prevent_disconnect', 'true');
        
        // Update session flags
        sessionStorage.setItem('wallet_explicit_save', 'true');
        sessionStorage.setItem('wallet_save_timestamp', Date.now().toString());
        
        console.log('Mobile connection marked as restored with updated timestamps');
      } catch (mobileErr) {
        console.error('Error updating mobile connection timestamps:', mobileErr);
      }
    }

    // Notify parent window safely if in iframe
    if (typeof window !== 'undefined' && window.parent !== window) {
      try {
        const safeSend = createSafeMessageSender(window.parent);
        const { address, chainId } = getSavedConnectionDetails();
        
        // Only send if we have an address
        if (address) {
          safeSend({ 
            type: 'CONNECTION_MARKED_RESTORED', 
            data: { address, chainId, timestamp: Date.now() }
          });
        }
      } catch (err) {
        logger.warn('Error notifying parent of marked restoration', { 
          component: 'persistConnection',
          meta: { error: String(err) }
        });
      }
    }
  } catch (err) {
    logger.error('Error marking connection as restored:', { 
      component: 'persistConnection',
      meta: { error: String(err) }
    });
  }
}

/**
 * Clear saved connection state
 * Enhanced to clear all storage types
 */
export function clearConnectionState(): void {
  try {
    // Clear standard storage
    localStorage.removeItem(CONNECTION_STATE_KEY);
    localStorage.removeItem(CONNECTION_TIMESTAMP_KEY);
    localStorage.removeItem(CONNECTION_ADDRESS_KEY);
    localStorage.removeItem(CONNECTION_CHAIN_ID_KEY);
    
    // Clear all additional storage for mobile
    try {
      sessionStorage.removeItem(CONNECTION_STATE_KEY);
      sessionStorage.removeItem(CONNECTION_TIMESTAMP_KEY);
      sessionStorage.removeItem(CONNECTION_ADDRESS_KEY);
      sessionStorage.removeItem(CONNECTION_CHAIN_ID_KEY);
      
      localStorage.removeItem(MOBILE_CONNECTION_KEY);
      sessionStorage.removeItem(MOBILE_CONNECTION_KEY);
      localStorage.removeItem(MOBILE_BACKUP_KEY);
      sessionStorage.removeItem(MOBILE_BACKUP_KEY);
      
      // Clear cookies
      document.cookie = "mobile_wallet_address=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      document.cookie = "mobile_wallet_timestamp=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      
      // Clear all prevention flags
      localStorage.removeItem('prevent_disconnect');
      sessionStorage.removeItem('prevent_disconnect');
      localStorage.removeItem('wallet_connected');
      sessionStorage.removeItem('wallet_connected');
      localStorage.removeItem('wallet_last_connected');
      sessionStorage.removeItem('wallet_last_connected');
      localStorage.removeItem('mobile_wallet_address');
      sessionStorage.removeItem('mobile_wallet_address');
      
      // Clear session flags
      sessionStorage.removeItem('wallet_explicit_save');
      sessionStorage.removeItem('wallet_save_timestamp');
      sessionStorage.removeItem('game_completed_address');
      sessionStorage.removeItem('game_completed_timestamp');
      localStorage.removeItem('game_completed_address');
      localStorage.removeItem('game_completed_timestamp');
      
      // Clear mobile-specific session backup
      localStorage.removeItem('mobile_wallet_session_backup');
      sessionStorage.removeItem('mobile_wallet_session_backup');
      
      // Clear Wagmi persistence
      try {
        localStorage.removeItem('mobile_wagmi_persistence');
      } catch (e) {
        console.warn('Error clearing mobile Wagmi persistence:', e);
      }
    } catch (additionalErr) {
      console.error('Error clearing additional connection storage:', additionalErr);
    }
    
    console.log('All connection state cleared successfully');
  } catch (err) {
    console.error('Error clearing connection state:', err);
  }
}
