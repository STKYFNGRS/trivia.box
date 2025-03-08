/**
 * Utility functions for persisting wallet connection state
 * Especially useful for mobile browsers that lose connection state on refresh
 */

// Session storage keys
const CONNECTION_STATE_KEY = 'walletConnectionState';
const CONNECTION_TIMESTAMP_KEY = 'connectionTimestamp';
const CONNECTION_MAX_AGE = 10 * 60 * 1000; // 10 minutes in milliseconds

/**
 * Save wallet connection state before unload
 */
export function saveConnectionState(): void {
  try {
    // Check if we're already connected
    const currentState = localStorage.getItem(CONNECTION_STATE_KEY);
    
    // Only save if not already saved
    if (currentState !== 'connected') {
      localStorage.setItem(CONNECTION_STATE_KEY, 'connected');
      localStorage.setItem(CONNECTION_TIMESTAMP_KEY, Date.now().toString());
      console.log('Connection state saved for possible refresh');
    }
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
    
    // Check if we have a saved state that's not too old
    if (connectionState === 'connected' && connectionTimestamp) {
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
 * Clear saved connection state
 */
export function clearConnectionState(): void {
  try {
    localStorage.removeItem(CONNECTION_STATE_KEY);
    localStorage.removeItem(CONNECTION_TIMESTAMP_KEY);
  } catch (err) {
    console.error('Error clearing connection state:', err);
  }
}
