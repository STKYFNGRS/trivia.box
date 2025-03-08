/**
 * Utility functions for detecting device type and browser capabilities
 */

/**
 * Check if the current browser is running on a mobile device
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') {
    return false; // Default to desktop on server-side
  }
  
  // Check for common mobile user agent patterns
  const userAgent = window.navigator.userAgent.toLowerCase();
  const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(userAgent);
  
  // Also check screen width as a fallback
  const isSmallScreen = window.innerWidth < 768;
  
  return isMobile || isSmallScreen;
}

/**
 * Check if the browser supports sessionStorage
 */
export function supportsSessionStorage(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  
  try {
    const testKey = '__test_storage_support__';
    sessionStorage.setItem(testKey, '1');
    sessionStorage.removeItem(testKey);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Check if the browser's memory might be more aggressively managed
 * (mobile browsers are typically more aggressive)
 */
export function hasAggressiveMemoryManagement(): boolean {
  return isMobileDevice();
}

/**
 * Safely store data in sessionStorage with fallbacks
 */
export function safelyStoreSessionData(key: string, data: any): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  
  try {
    sessionStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn('Failed to store session data:', e);
    return false;
  }
}

/**
 * Safely retrieve data from sessionStorage with fallbacks
 */
export function safelyGetSessionData<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') {
    return defaultValue;
  }
  
  try {
    const storedData = sessionStorage.getItem(key);
    if (!storedData) {
      return defaultValue;
    }
    return JSON.parse(storedData) as T;
  } catch (e) {
    console.warn('Failed to retrieve session data:', e);
    return defaultValue;
  }
}
