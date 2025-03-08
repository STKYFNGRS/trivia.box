import { lookupEnsName, lookupEnsAvatar } from './index';

// Cache for top addresses
const TOP_ADDRESSES_CACHE = new Map<string, {
  name: string | null;
  avatar: string | null;
  expires: number;
}>();

// Cache duration - 15 minutes
const CACHE_DURATION = 15 * 60 * 1000;

/**
 * Prefetch ENS data for common addresses
 * This can be called during app initialization to warm up the cache
 */
export async function prefetchTopAddresses(addresses: string[]): Promise<void> {
  // Only process the first few addresses to avoid overwhelming the system
  const topAddresses = addresses.slice(0, 5);
  
  // Process in parallel with a concurrency limit
  const concurrentBatch = 2;
  
  for (let i = 0; i < topAddresses.length; i += concurrentBatch) {
    const batch = topAddresses.slice(i, i + concurrentBatch);
    
    // Start prefetching this batch
    await Promise.allSettled(batch.map(async (address) => {
      try {
        // Skip if we already have a non-expired cache entry
        const cached = TOP_ADDRESSES_CACHE.get(address);
        if (cached && cached.expires > Date.now()) {
          return;
        }
        
        // Look up ENS name
        const name = await lookupEnsName(address);
        
        // If name found, also get avatar
        let avatar: string | null = null;
        if (name) {
          try {
            avatar = await lookupEnsAvatar(name);
          } catch (error) {
            // Silently fail for avatar
          }
        }
        
        // Cache the result
        TOP_ADDRESSES_CACHE.set(address, {
          name,
          avatar,
          expires: Date.now() + CACHE_DURATION
        });
      } catch (error) {
        // Silently fail individual lookups
      }
    }));
    
    // Small delay between batches
    if (i + concurrentBatch < topAddresses.length) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
}

/**
 * Get prefetched ENS data for an address
 */
export function getPrefetchedEns(address: string): { name: string | null; avatar: string | null } | null {
  const cached = TOP_ADDRESSES_CACHE.get(address);
  
  if (cached && cached.expires > Date.now()) {
    return {
      name: cached.name,
      avatar: cached.avatar
    };
  }
  
  return null;
}
