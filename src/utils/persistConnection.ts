/**
 * Utility functions for persisting wallet connection state
 * Especially useful for mobile browsers that lose connection state on refresh
 */

// Session storage keys
const CONNECTION_STATE_KEY = 'walletConnectionState';
const CONNECTION_TIMESTAMP_KEY = 'connectionTimestamp';
const CONNECTION_MAX_AGE = 30 * 60 * 1000; // 30 minutes in milliseconds
const CONNECTION_ADDRESS_KEY = 'connectedAddress';
const CONNECTION_CHAIN_ID_KEY = 'connectedChainId';

/**
 * Save wallet connection state before unload or game completion
 */
export function saveConnectionState(address?: string, chainId?: number): void {
  try {
    // Force save even if already saved to ensure freshness
    localStorage.setItem(CONNECTION_STATE_KEY, 'connected');
    localStorage.setItem(CONNECTION_TIMESTAMP_KEY, Date.now().toString());
    
    // Store address and chain ID if provided
    if (address) {
      localStorage.setItem(CONNECTION_ADDRESS_KEY, address);
    }
    
    if (chainId) {
      localStorage.setItem(CONNECTION_CHAIN_ID_KEY, chainId.toString());
    }
    
    console.log('Connection state saved for possible refresh/restore');
  } catch (err) {
    console.error('Error saving connection state:', err);
  }
}

/**
 * Check if we need to restore connection after refresh
 */
export function shouldRestoreConnection(): boolean {
  try {
    const connectionState = localStorage.getItem(CONNECTION_STATE_KEY);
    const connectionTimestamp = localStorage.getItem(CONNECTION_TIMESTAMP_KEY);
    const connectedAddress = localStorage.getItem(CONNECTION_ADDRESS_KEY);
    
    // Check if we have a saved state that's not too old
    if (connectionState === 'connected' && connectionTimestamp && connectedAddress) {
      const timestamp = parseInt(connectionTimestamp, 10);
      const now = Date.now();
      const timeDiff = now - timestamp;
      
      // If less than max age old
      return timeDiff < CONNECTION_MAX_AGE;
    }
  } catch (err) {
    console.error('Error checking connection state:', err);
  }
  
  return false;
}

/**
 * Get the saved connection details
 */
export function getSavedConnectionDetails(): { address?: string; chainId?: number } {
  try {
    const address = localStorage.getItem(CONNECTION_ADDRESS_KEY) || undefined;
    const chainIdStr = localStorage.getItem(CONNECTION_CHAIN_ID_KEY);
    const chainId = chainIdStr ? parseInt(chainIdStr, 10) : undefined;
    
    return { address, chainId };
  } catch (err) {
    console.error('Error getting saved connection details:', err);
    return {};
  }
}

/**
 * Mark connection as restored but keep state
 */
export function markConnectionRestored(): void {
  try {
    // Update timestamp but keep other data
    localStorage.setItem(CONNECTION_TIMESTAMP_KEY, Date.now().toString());
  } catch (err) {
    console.error('Error marking connection as restored:', err);
  }
}

/**
 * Clear saved connection state
 */
export function clearConnectionState(): void {
  try {
    localStorage.removeItem(CONNECTION_STATE_KEY);
    localStorage.removeItem(CONNECTION_TIMESTAMP_KEY);
    localStorage.removeItem(CONNECTION_ADDRESS_KEY);
    localStorage.removeItem(CONNECTION_CHAIN_ID_KEY);
  } catch (err) {
    console.error('Error clearing connection state:', err);
  }
}
