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
    return `${IPFS_GATEWAYS[0]}${ipfsId}`;
  }
  
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
  console.log(`Direct ENS lookup for address: ${address}`);
  
  if (!address) return null;
  
  // Check cache first
  const cached = getCachedEnsName(address);
  if (cached) {
    console.log(`Found cached ENS name for ${address}: ${cached}`);
    return cached;
  }
  
  // Try each provider until successful
  for (const rpcUrl of RPC_PROVIDERS) {
    try {
      console.log(`Trying ENS lookup via ${rpcUrl}`);
      // Create provider
      const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
      
      // Set a timeout to avoid hanging
      const timeoutPromise = new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error('ENS lookup timeout')), 5000);
      });
      
      // Race the name lookup against the timeout
      const name = await Promise.race([
        provider.lookupAddress(address),
        timeoutPromise
      ]);
      
      if (name) {
        console.log(`Found ENS name for ${address}: ${name}`);
        
        // Cache the result
        cacheEnsName(address, name);
        return name;
      }
    } catch (e) {
      console.warn(`ENS lookup failed for ${rpcUrl}:`, e);
      // Continue to next provider
    }
  }
  
  console.log(`No ENS name found for ${address}`);
  return null;
}

/**
 * Direct ENS avatar lookup using ethers.js
 */
export async function lookupEnsAvatar(ensName: string): Promise<string | null> {
  console.log(`Direct ENS avatar lookup for name: ${ensName}`);
  
  if (!ensName) return null;
  
  // Check cache first
  const cached = getCachedEnsAvatar(ensName);
  if (cached) {
    console.log(`Found cached ENS avatar for ${ensName}: ${cached}`);
    return cached;
  }
  
  // Try each provider until successful
  for (const rpcUrl of RPC_PROVIDERS) {
    try {
      console.log(`Trying ENS avatar lookup via ${rpcUrl}`);
      // Create provider
      const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
      
      // Set a timeout to avoid hanging
      const timeoutPromise = new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error('ENS lookup timeout')), 5000);
      });
      
      // Get the resolver
      const resolverAddress = await provider.getResolver(ensName);
      
      if (resolverAddress) {
        try {
          // Get the avatar
          const avatar = await provider.getAvatar(ensName);
          
          if (avatar) {
            console.log(`Found ENS avatar for ${ensName}: ${avatar}`);
            
            // Process the avatar URL
            let finalAvatar = avatar;
            
            if (typeof avatar === 'string') {
              // Handle string avatar
              finalAvatar = avatar.startsWith('ipfs://') ? resolveIpfsUrl(avatar) : avatar;
              console.log(`Resolved string avatar: ${finalAvatar}`);
            }
            
            if (finalAvatar) {
              // Cache the result
              cacheEnsAvatar(ensName, finalAvatar);
              return finalAvatar;
            }
          }
        } catch (avatarError) {
          console.warn(`Avatar fetch failed for ${ensName}:`, avatarError);
        }
      }
    } catch (e) {
      console.warn(`ENS avatar lookup failed for ${rpcUrl}:`, e);
      // Continue to next provider
    }
  }
  
  console.log(`No ENS avatar found for ${ensName}`);
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