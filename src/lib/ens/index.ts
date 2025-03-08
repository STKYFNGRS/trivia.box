// Place imports at the top of the file, before other code
import { ethers } from 'ethers';

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
const RPC_PROVIDERS = [
  'https://rpc.ankr.com/eth',
  'https://eth.llamarpc.com',
  'https://eth.meowrpc.com',
  'https://ethereum.publicnode.com',
  'https://eth.api.onfinality.io/public'
];

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
      
      // Set a timeout to avoid hanging
      const timeoutPromise = new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error('ENS lookup timeout')), 8000);
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
      
      // Set a timeout to avoid hanging
      const timeoutPromise = new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error('ENS lookup timeout')), 8000);
      });
      
      // Race against timeout
      const resolver = await Promise.race([
        provider.getResolver(ensName),
        timeoutPromise
      ]);
      
      if (resolver) {
        try {
          // Get the avatar
          const avatar = await resolver.getText('avatar');
          
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
    const cacheJson = localStorage.getItem(ENS_NAME_CACHE_KEY) || '{}';
    const cache = JSON.parse(cacheJson);
    
    // Update cache
    cache[address.toLowerCase()] = {
      name,
      expires: Date.now() + CACHE_DURATION
    };
    
    // Save cache
    localStorage.setItem(ENS_NAME_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.warn('Failed to cache ENS name:', e);
  }
}

/**
 * Get a cached ENS name for an address
 */
export function getCachedEnsName(address: string): string | null {
  if (!address) return null;
  
  try {
    // Get existing cache
    const cacheJson = localStorage.getItem(ENS_NAME_CACHE_KEY) || '{}';
    const cache = JSON.parse(cacheJson);
    
    // Check if address is in cache and not expired
    const entry = cache[address.toLowerCase()];
    if (entry && entry.expires > Date.now()) {
      return entry.name;
    }
  } catch (e) {
    console.warn('Failed to read ENS name cache:', e);
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
    const cacheJson = localStorage.getItem(ENS_AVATAR_CACHE_KEY) || '{}';
    const cache = JSON.parse(cacheJson);
    
    // Update cache
    cache[name.toLowerCase()] = {
      avatarUrl,
      expires: Date.now() + CACHE_DURATION
    };
    
    // Save cache
    localStorage.setItem(ENS_AVATAR_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.warn('Failed to cache ENS avatar:', e);
  }
}

/**
 * Get a cached ENS avatar for a name
 */
export function getCachedEnsAvatar(name: string): string | null {
  if (!name) return null;
  
  try {
    // Get existing cache
    const cacheJson = localStorage.getItem(ENS_AVATAR_CACHE_KEY) || '{}';
    const cache = JSON.parse(cacheJson);
    
    // Check if name is in cache and not expired
    const entry = cache[name.toLowerCase()];
    if (entry && entry.expires > Date.now()) {
      return entry.avatarUrl;
    }
  } catch (e) {
    console.warn('Failed to read ENS avatar cache:', e);
  }
  
  return null;
}