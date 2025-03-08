// Place imports at the top of the file, before other code
import { ethers } from 'ethers';

// Safe localStorage implementation with in-memory fallback
const safeStorage = (() => {
  let inMemoryStorage: Record<string, string> = {};
  
  return {
    getItem: (key: string): string | null => {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          return window.localStorage.getItem(key);
        }
      } catch (e) {
        console.warn('localStorage access failed, using in-memory fallback');
      }
      return inMemoryStorage[key] || null;
    },
    setItem: (key: string, value: string): void => {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(key, value);
        }
      } catch (e) {
        console.warn('localStorage write failed, using in-memory fallback');
      }
      inMemoryStorage[key] = value;
    }
  };
})();

// Enhanced error logging
function logENSError(operation: string, error: Error): void {
  console.warn(`ENS ${operation} failed:`, error);
  
  // In production, send error data to monitoring
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    try {
      fetch('/api/log-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'ENS_RESOLUTION',
          operation,
          error: error.message,
          timestamp: Date.now()
        })
      }).catch(() => {/* Ignore errors from error logging */});
    } catch (e) {
      // Silently fail if fetch isn't available
    }
  }
}

// IPFS gateway URLs
const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://gateway.ipfs.io/ipfs/',
  'https://ipfs.infura.io/ipfs/'
];

/**
 * Resolve IPFS URLs to HTTP URLs
 */
export function resolveIpfsUrl(ipfsUrl: string): string {
  if (!ipfsUrl) return '';
  
  if (ipfsUrl.startsWith('ipfs://')) {
    const ipfsId = ipfsUrl.replace('ipfs://', '');
    // Use multiple gateways for reliability
    return `${IPFS_GATEWAYS[0]}${ipfsId}`;
  }
  
  // Return original URL if it doesn't need conversion
  return ipfsUrl;
}


// Cache duration in milliseconds (6 hours)
const CACHE_DURATION = 1000 * 60 * 60 * 6;

// Cache keys
const ENS_NAME_CACHE_KEY = 'trivia-ens-names';
const ENS_AVATAR_CACHE_KEY = 'trivia-ens-avatars';

// RPC endpoints to try
const getRpcProviders = () => {
  // Use environment type to select appropriate providers
  const isProd = typeof window !== 'undefined' && 
                (window as any).ENV_TYPE === 'production';
  
  // Base providers - reliable but may have rate limits
  const baseProviders = [
    'https://rpc.ankr.com/eth',
    'https://eth.llamarpc.com'
  ];
  
  // Extended providers - more options but potentially less reliable
  const extendedProviders = [
    'https://eth.meowrpc.com',
    'https://ethereum.publicnode.com',
    'https://eth.api.onfinality.io/public',
    'https://eth.rpc.blxrbdn.com'
  ];
  
  // For production, use more providers and different order to improve reliability
  return isProd ? 
    // Production: Prioritize more reliable providers
    [...baseProviders, ...extendedProviders] : 
    // Development: Fewer providers to avoid rate limits during testing
    baseProviders;
};

// Get the appropriate RPC providers list
const RPC_PROVIDERS = getRpcProviders();

/**
 * Direct ENS name lookup using ethers.js
 */
export async function lookupEnsName(address: string): Promise<string | null> {
  // Lookup ENS name silently
  
  if (!address) return null;
  
  // Check cache first
  const cached = getCachedEnsName(address);
  if (cached) {
    // Return cached name
    return cached;
  }
  
  // Try multiple providers in parallel
  const providerPromises = RPC_PROVIDERS.map(async (rpcUrl) => {
    try {
      // Create provider (minimized logging)
      const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
      
      // Set a timeout to avoid hanging - longer in production
      const timeoutDuration = typeof window !== 'undefined' && 
                            (window as any).ENV_TYPE === 'production' ? 12000 : 8000;
      
      const timeoutPromise = new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error(`ENS lookup timeout after ${timeoutDuration}ms`)), timeoutDuration);
      });
      
      // Race the name lookup against the timeout
      const name = await Promise.race([
        provider.lookupAddress(address),
        timeoutPromise
      ]);
      
      if (name) {
        // Cache the result
        cacheEnsName(address, name);
        return name;
      }
      return null;
    } catch (e) {
      // Silent failure for individual provider
      return null;
    }
  });
  
  // Wait for first successful result
  try {
    const results = await Promise.allSettled(providerPromises);
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        return result.value;
      }
    }
  } catch (error) {
    console.warn('All ENS providers failed');
  }
  
  return null;
}

/**
 * Direct ENS avatar lookup using ethers.js
 */
export async function lookupEnsAvatar(ensName: string): Promise<string | null> {
  if (!ensName) return null;
  
  // Check cache first
  const cached = getCachedEnsAvatar(ensName);
  if (cached) {
    return cached;
  }
  
  // Try multiple providers in parallel
  const providerPromises = RPC_PROVIDERS.map(async (rpcUrl) => {
    try {
      // Create provider
      const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
      
      // Set a timeout to avoid hanging - longer in production
      const timeoutDuration = typeof window !== 'undefined' && 
                           (window as any).ENV_TYPE === 'production' ? 12000 : 8000;
      
      const timeoutPromise = new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error(`ENS avatar lookup timeout after ${timeoutDuration}ms`)), timeoutDuration);
      });
      
      // Race against timeout
      const resolver = await Promise.race([
        provider.getResolver(ensName),
        timeoutPromise
      ]);
      
      if (resolver) {
        try {
          // Get the avatar - use provider.getAvatar again
          const avatar = await provider.getAvatar(ensName);
          
          if (avatar) {
            // Process the avatar URL
            let finalAvatar = avatar;
            
            if (typeof avatar === 'string') {
              // Handle string avatar
              finalAvatar = avatar.startsWith('ipfs://') ? resolveIpfsUrl(avatar) : avatar;
            }
            
            if (finalAvatar) {
              // Cache the result
              cacheEnsAvatar(ensName, finalAvatar);
              return finalAvatar;
            }
          }
        } catch (avatarError) {
          // Silent failure for avatar fetch
        }
      }
      return null;
    } catch (e) {
      // Silent failure for individual provider
      return null;
    }
  });
  
  // Wait for first successful result
  try {
    const results = await Promise.allSettled(providerPromises);
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        return result.value;
      }
    }
  } catch (error) {
    console.warn('All ENS avatar providers failed');
  }
  
  return null;
}

/**
 * Cache an ENS name for an address
 */
export function cacheEnsName(address: string, name: string): void {
  if (!address || !name) return;
  
  try {
    // Get existing cache
    const cacheJson = safeStorage.getItem(ENS_NAME_CACHE_KEY) || '{}';
    const cache = JSON.parse(cacheJson);
    
    // Update cache
    cache[address.toLowerCase()] = {
      name,
      expires: Date.now() + CACHE_DURATION
    };
    
    // Save cache
    safeStorage.setItem(ENS_NAME_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    logENSError('cacheEnsName', e as Error);
  }
}

/**
 * Get a cached ENS name for an address
 */
export function getCachedEnsName(address: string): string | null {
  if (!address) return null;
  
  try {
    // Get existing cache
    const cacheJson = safeStorage.getItem(ENS_NAME_CACHE_KEY) || '{}';
    const cache = JSON.parse(cacheJson);
    
    // Check if address is in cache and not expired
    const entry = cache[address.toLowerCase()];
    if (entry && entry.expires > Date.now()) {
      return entry.name;
    }
  } catch (e) {
    logENSError('getCachedEnsName', e as Error);
  }
  
  return null;
}

/**
 * Cache an ENS avatar for a name
 */
export function cacheEnsAvatar(name: string, avatarUrl: string): void {
  if (!name || !avatarUrl) return;
  
  try {
    // Get existing cache
    const cacheJson = safeStorage.getItem(ENS_AVATAR_CACHE_KEY) || '{}';
    const cache = JSON.parse(cacheJson);
    
    // Update cache
    cache[name.toLowerCase()] = {
      avatarUrl,
      expires: Date.now() + CACHE_DURATION
    };
    
    // Save cache
    safeStorage.setItem(ENS_AVATAR_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    logENSError('cacheEnsAvatar', e as Error);
  }
}

/**
 * Get a cached ENS avatar for a name
 */
export function getCachedEnsAvatar(name: string): string | null {
  if (!name) return null;
  
  try {
    // Get existing cache
    const cacheJson = safeStorage.getItem(ENS_AVATAR_CACHE_KEY) || '{}';
    const cache = JSON.parse(cacheJson);
    
    // Check if name is in cache and not expired
    const entry = cache[name.toLowerCase()];
    if (entry && entry.expires > Date.now()) {
      return entry.avatarUrl;
    }
  } catch (e) {
    logENSError('getCachedEnsAvatar', e as Error);
  }
  
  return null;
}