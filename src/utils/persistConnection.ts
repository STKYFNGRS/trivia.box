/**
 * Utility functions for persisting wallet connection state
 * Especially useful for mobile browsers that lose connection state on refresh
 */

import { isMobileDevice } from './deviceDetect';

// Storage keys
const CONNECTION_STATE_KEY = 'walletConnectionState';
const CONNECTION_TIMESTAMP_KEY = 'connectionTimestamp';
const CONNECTION_MAX_AGE = 30 * 60 * 1000; // 30 minutes in milliseconds
const CONNECTION_ADDRESS_KEY = 'connectedAddress';
const CONNECTION_CHAIN_ID_KEY = 'connectedChainId';

// Mobile-specific settings
const MOBILE_CONNECTION_KEY = 'mobile_walletConnection';
const MOBILE_MAX_AGE = 120 * 60 * 1000; // 2 hours for mobile (increased from 1 hour)
const MOBILE_BACKUP_KEY = 'mobile_wallet_backup';

/**
 * Save wallet connection state before unload or game completion
 * Enhanced for mobile with additional storage methods
 */
export function saveConnectionState(address?: string, chainId?: number): void {
  try {
    console.log('Saving connection state', address ? `for ${address.slice(0, 6)}...` : '(no address)');
    
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
          mobilePersisted: true
        };
        
        // Store in both localStorage and sessionStorage for redundancy
        const connectionString = JSON.stringify(connectionData);
        localStorage.setItem(MOBILE_CONNECTION_KEY, connectionString);
        sessionStorage.setItem(MOBILE_CONNECTION_KEY, connectionString);
        
        // Create additional backup copies with different keys to avoid issues
        // with certain mobile browsers that might clear specific keys
        localStorage.setItem(MOBILE_BACKUP_KEY, connectionString);
        sessionStorage.setItem(MOBILE_BACKUP_KEY, connectionString);
      } catch (mobileErr) {
        console.warn('Additional mobile persistence failed', mobileErr);
      }
    }
  } catch (err) {
    console.error('Error saving connection state:', err);
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
        // Check wagmi store - the most reliable source
        localStorage.getItem('wagmi.store'),
        
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
        sessionStorage.getItem('game_completed_address'),
        localStorage.getItem('prevent_disconnect'),
        sessionStorage.getItem('prevent_disconnect')
      ].some(item => item && item !== 'null');
      
      console.log(`${deviceType} restore check: ${hasAnyConnectionData ? 'WILL RESTORE' : 'No connection data found'}`);
      return hasAnyConnectionData;
    }
    
    // For desktop, keep existing more restrictive logic
    // Desktop devices should only restore in specific cases
    if (!isMobile) {
      // Check only if there are explicit connection keys and the wallet was definitely connected
      const hasConnectionState = localStorage.getItem(CONNECTION_STATE_KEY) === 'connected';
      const hasAddress = localStorage.getItem(CONNECTION_ADDRESS_KEY) !== null;
      
      // Log for desktop
      console.log(`${deviceType} restore check - Connection state: ${hasConnectionState}, Address: ${hasAddress ? 'present' : 'missing'}`);
      
      // Only return true for desktop if both conditions are met
      if (hasConnectionState && hasAddress) {
        const connectionTimestamp = localStorage.getItem(CONNECTION_TIMESTAMP_KEY);
        if (connectionTimestamp) {
          const timestamp = parseInt(connectionTimestamp, 10);
          const now = Date.now();
          const ageInMinutes = Math.round((now - timestamp) / (60 * 1000));
          // Only restore very recent connections on desktop (last 5 minutes)
          const shouldRestore = ageInMinutes < 5; // 5 minutes
          
          console.log(`${deviceType} connection age: ${ageInMinutes} minutes, will ${shouldRestore ? '' : 'NOT '}restore`);
          return shouldRestore;
        }
      }
      
      console.log(`${deviceType} restore check - Will NOT restore connection`);
      return false; // Default to not restoring on desktop
    }
    
    return false;
  } catch (err) {
    console.error('Error checking connection state:', err);
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
        // Try all possible storage locations
        const mobileDataStr = 
          localStorage.getItem(MOBILE_CONNECTION_KEY) || 
          sessionStorage.getItem(MOBILE_CONNECTION_KEY) ||
          localStorage.getItem(MOBILE_BACKUP_KEY) ||
          sessionStorage.getItem(MOBILE_BACKUP_KEY);
        
        if (mobileDataStr) {
          const mobileData = JSON.parse(mobileDataStr);
          if (mobileData.address) {
            console.log('Retrieved connection details from mobile-enhanced storage');
            return { 
              address: mobileData.address, 
              chainId: mobileData.chainId || undefined 
            };
          }
        }
        
        // Check cookies as fallback (iOS Safari)
        if (document.cookie) {
          const addressMatch = document.cookie.match(/mobile_wallet_address=([^;]+)/);
          if (addressMatch && addressMatch[1]) {
            console.log('Retrieved connection address from cookie:', addressMatch[1]);
            return { address: addressMatch[1] };
          }
        }
        
        // Check for game completion data in both storage types
        const gameCompletionAddress = 
          sessionStorage.getItem('game_completed_address') ||
          localStorage.getItem('game_completed_address');
          
        if (gameCompletionAddress) {
          console.log('Retrieved connection address from game completion:', gameCompletionAddress);
          return { address: gameCompletionAddress };
        }
        
        // Check for wagmi store directly as a last resort
        try {
          const wagmiStore = localStorage.getItem('wagmi.store');
          if (wagmiStore) {
            const wagmiData = JSON.parse(wagmiStore);
            const address = wagmiData?.state?.connections?.[0]?.accounts?.[0];
            const chainId = wagmiData?.state?.connections?.[0]?.chains?.[0]?.id;
            
            if (address) {
              console.log('Retrieved connection address from wagmi store:', address);
              return { address, chainId };
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
                      sessionStorage.getItem(CONNECTION_CHAIN_ID_KEY);
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
          
          const updatedStr = JSON.stringify(mobileData);
          localStorage.setItem(MOBILE_CONNECTION_KEY, updatedStr);
          sessionStorage.setItem(MOBILE_CONNECTION_KEY, updatedStr);
          localStorage.setItem(MOBILE_BACKUP_KEY, updatedStr);
          sessionStorage.setItem(MOBILE_BACKUP_KEY, updatedStr);
        }
        
        // Update cookie if using that fallback
        if (document.cookie.includes('mobile_wallet_address')) {
          document.cookie = `mobile_wallet_timestamp=${Date.now()}; path=/; max-age=7200; SameSite=Strict`;
        }
        
        // Update session flags
        sessionStorage.setItem('wallet_explicit_save', 'true');
        sessionStorage.setItem('wallet_save_timestamp', Date.now().toString());
        
        console.log('Mobile connection marked as restored with updated timestamps');
      } catch (mobileErr) {
        console.error('Error updating mobile connection timestamps:', mobileErr);
      }
    }
  } catch (err) {
    console.error('Error marking connection as restored:', err);
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
      
      // Clear session flags
      sessionStorage.removeItem('wallet_explicit_save');
      sessionStorage.removeItem('wallet_save_timestamp');
      sessionStorage.removeItem('game_completed_address');
      sessionStorage.removeItem('game_completed_timestamp');
    } catch (additionalErr) {
      console.error('Error clearing additional connection storage:', additionalErr);
    }
    
    console.log('All connection state cleared successfully');
  } catch (err) {
    console.error('Error clearing connection state:', err);
  }
}
