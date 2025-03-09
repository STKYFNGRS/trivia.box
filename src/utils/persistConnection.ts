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
const MOBILE_MAX_AGE = 60 * 60 * 1000; // 1 hour for mobile

/**
 * Save wallet connection state before unload or game completion
 * Enhanced for mobile with additional storage methods
 */
export function saveConnectionState(address?: string, chainId?: number): void {
  try {
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
        };
        
        localStorage.setItem(MOBILE_CONNECTION_KEY, JSON.stringify(connectionData));
        sessionStorage.setItem(MOBILE_CONNECTION_KEY, JSON.stringify(connectionData));
        
        console.log('Mobile connection state saved with enhanced persistence');
      } catch (mobileErr) {
        console.error('Error saving mobile-specific connection data:', mobileErr);
      }
    }
    
    console.log('Connection state saved for possible refresh/restore');
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
    // Mobile devices need special handling due to more aggressive memory management
    if (isMobileDevice()) {
      // Try consolidated mobile data first (most reliable)
      try {
        const mobileDataStr = localStorage.getItem(MOBILE_CONNECTION_KEY) || 
                             sessionStorage.getItem(MOBILE_CONNECTION_KEY);
        
        if (mobileDataStr) {
          const mobileData = JSON.parse(mobileDataStr);
          const now = Date.now();
          const timeDiff = now - mobileData.timestamp;
          
          if (timeDiff < MOBILE_MAX_AGE && mobileData.address) {
            console.log('Found valid mobile connection data to restore');
            return true;
          }
        }
      } catch (mobileErr) {
        console.error('Error parsing mobile connection data:', mobileErr);
        // Continue to standard checks if mobile-specific check fails
      }
    }
    
    // Standard localStorage check (fallback)
    const connectionState = localStorage.getItem(CONNECTION_STATE_KEY) || 
                           sessionStorage.getItem(CONNECTION_STATE_KEY);
    const connectionTimestamp = localStorage.getItem(CONNECTION_TIMESTAMP_KEY) || 
                              sessionStorage.getItem(CONNECTION_TIMESTAMP_KEY);
    const connectedAddress = localStorage.getItem(CONNECTION_ADDRESS_KEY) || 
                            sessionStorage.getItem(CONNECTION_ADDRESS_KEY);
    
    // Check if we have a saved state that's not too old
    if (connectionState === 'connected' && connectionTimestamp && connectedAddress) {
      const timestamp = parseInt(connectionTimestamp, 10);
      const now = Date.now();
      const timeDiff = now - timestamp;
      const maxAge = isMobileDevice() ? MOBILE_MAX_AGE : CONNECTION_MAX_AGE;
      
      // If less than max age old (longer for mobile)
      return timeDiff < maxAge;
    }
  } catch (err) {
    console.error('Error checking connection state:', err);
  }
  
  return false;
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
        const mobileDataStr = localStorage.getItem(MOBILE_CONNECTION_KEY) || 
                             sessionStorage.getItem(MOBILE_CONNECTION_KEY);
        
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
                             sessionStorage.getItem(MOBILE_CONNECTION_KEY);
        
        if (mobileDataStr) {
          const mobileData = JSON.parse(mobileDataStr);
          mobileData.timestamp = Date.now();
          
          localStorage.setItem(MOBILE_CONNECTION_KEY, JSON.stringify(mobileData));
          sessionStorage.setItem(MOBILE_CONNECTION_KEY, JSON.stringify(mobileData));
        }
        
        console.log('Mobile connection marked as restored with updated timestamp');
      } catch (mobileErr) {
        console.error('Error updating mobile connection timestamp:', mobileErr);
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
    } catch (additionalErr) {
      console.error('Error clearing additional connection storage:', additionalErr);
    }
    
    console.log('All connection state cleared successfully');
  } catch (err) {
    console.error('Error clearing connection state:', err);
  }
}
