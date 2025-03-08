import { lookupEnsName, lookupEnsAvatar } from '@/lib/ens';
import { getDirectEnsAvatar } from '@/lib/ensUtils';

// Pre-import fetcher to avoid dynamic import during data fetching
import { fetcher } from '@/lib/fetcher';

// Create safe storage utility for cache management
const safeStorage = (() => {
  let inMemoryStorage: Record<string, string> = {};
  
  return {
    getItem: (key: string): string | null => {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          return window.localStorage.getItem(key);
        }
      } catch (e) {
        console.warn('localStorage access failed in WalletDataService, using in-memory fallback');
      }
      return inMemoryStorage[key] || null;
    },
    setItem: (key: string, value: string): void => {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(key, value);
        }
      } catch (e) {
        console.warn('localStorage write failed in WalletDataService, using in-memory fallback');
      }
      inMemoryStorage[key] = value;
    }
  };
})();

// Cache durations
const STATS_CACHE_KEY = 'trivia-user-stats';
const LEADERBOARD_CACHE_KEY = 'trivia-leaderboard';
const ENS_CACHE_KEY = 'trivia-ens-data';
const STATS_CACHE_DURATION = 1000 * 60 * 5; // 5 minutes
const LEADERBOARD_CACHE_DURATION = 1000 * 60 * 3; // 3 minutes
const ENS_CACHE_DURATION = 1000 * 60 * 60 * 24; // 24 hours

export interface WalletData {
  ensName: string | null;
  ensAvatar: string | null;
  stats: {
    totalPoints: number;
    rank: number;
    bestStreak: number;
    gamesPlayed: number;
    trivia_achievements: string[];
  } | null;
  leaderboard: Array<{
    rank: number;
    address: string;
    points: number;
  }>;
  isLoading: boolean;
  error: Error | null;
}

class WalletDataService {
  private static instance: WalletDataService | null = null;
  
  private constructor() {}
  
  public static getInstance(): WalletDataService {
    if (!this.instance) {
      this.instance = new WalletDataService();
    }
    return this.instance;
  }
  
  /**
   * Fetch all wallet data in parallel with performance optimizations
   */
  async fetchWalletData(address: string): Promise<WalletData> {
    try {
      // Try cached data first - this is very fast
      const cachedEns = this.getCachedEnsData(address);
      const cachedStats = this.getCachedStats(address);
      const cachedLeaderboard = this.getCachedLeaderboard();
      
      // Create a result object with defaults and cached data
      const result: WalletData = {
        ensName: cachedEns?.name || null,
        ensAvatar: cachedEns?.avatar || null,
        stats: cachedStats || null,
        leaderboard: cachedLeaderboard || [],
        isLoading: false,
        error: null
      };
      
      // Prepare parallel requests for any missing data
      const fetchPromises: Promise<void>[] = [];
      
      // Only fetch ENS if not cached - we'll run this in parallel now
      if (!cachedEns) {
        fetchPromises.push(
          this.resolveEns(address)
            .then(ensData => {
              result.ensName = ensData.name;
              result.ensAvatar = ensData.avatar;
              
              // Cache immediately
              this.cacheEnsData(address, ensData);
            })
            .catch(() => {
              // Keep defaults on error
            })
        );
      }
      
      // Only fetch stats if not cached
      if (!cachedStats) {
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
        const statsUrl = `${baseUrl}/api/scores/stats?wallet=${encodeURIComponent(address)}`;
        
        fetchPromises.push(
          fetcher(statsUrl)
            .then(statsData => {
              result.stats = statsData;
              
              // Cache immediately
              this.cacheStats(address, statsData);
            })
            .catch(error => {
              console.error('Error fetching stats:', error);
              // Keep defaults on error
            })
        );
      }
      
      // Only fetch leaderboard if not cached
      if (!cachedLeaderboard) {
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
        const leaderboardUrl = `${baseUrl}/api/scores/leaderboard`;
        
        fetchPromises.push(
          fetcher(leaderboardUrl)
            .then(leaderboardData => {
              result.leaderboard = leaderboardData.leaderboard || [];
              
              // Cache immediately
              this.cacheLeaderboard(result.leaderboard);
            })
            .catch(error => {
              console.error('Error fetching leaderboard:', error);
              // Keep defaults on error
            })
        );
      }
      
      // Wait for all data to be fetched in parallel, if any
      if (fetchPromises.length > 0) {
        await Promise.all(fetchPromises);
      }
      
      return result;
    } catch (error) {
      console.error('Error in fetchWalletData:', error);
      
      return {
        ensName: null,
        ensAvatar: null,
        stats: null,
        leaderboard: [],
        isLoading: false,
        error: error instanceof Error ? error : new Error('Failed to fetch wallet data')
      };
    }
  }
  
  /**
   * Optimized ENS name and avatar resolution
   */
  private async resolveEns(address: string): Promise<{ name: string | null, avatar: string | null }> {
    try {
      console.log('Starting ENS resolution for address:', address);
      
      // Check for environment type - this ensures we use the correct RPC providers
      const isProd = typeof window !== 'undefined' && 
                    (window as any).ENV_TYPE === 'production';
      console.log(`ENS resolution running in ${isProd ? 'production' : 'development'} mode`);
      
      // First try to get the ENS name
      const name = await lookupEnsName(address);
      console.log('ENS name lookup result:', name);
      
      if (!name) {
        return { name: null, avatar: null };
      }
      
      // If we have a name, try to get avatar synchronously 
      let avatarResult: string | null = null;
      try {
        console.log('Looking up ENS avatar for name:', name);
        // Use a longer timeout for avatar lookups in production
        const avatarTimeout = isProd ? 15000 : 8000;
        
        // Create a promise with timeout
        const avatarPromise = lookupEnsAvatar(name);
        const timeoutPromise = new Promise<null>((_, reject) => {
          setTimeout(() => reject(new Error(`ENS avatar lookup timeout after ${avatarTimeout}ms`)), avatarTimeout);
        });
        
        // Race against timeout
        avatarResult = await Promise.race([avatarPromise, timeoutPromise]) as string | null;
        console.log('ENS avatar lookup result:', avatarResult ? 'Found' : 'Not found');
      } catch (avatarError) {
        console.warn('Initial ENS avatar resolution error:', avatarError);
      }
      
      // If we couldn't get the avatar, return just the name and fetch avatar asynchronously
      if (!avatarResult) {
        console.log('No avatar found immediately, scheduling async lookup');
        // This allows the UI to show the name faster
        setTimeout(async () => {
          try {
            // Try to get the avatar with alternative method
            console.log('Attempting alternative avatar lookup for:', name);
            const directAvatar = await getDirectEnsAvatar(name).catch((err) => {
              console.error('Alternative avatar lookup failed:', err);
              return null;
            });
            
            if (directAvatar) {
              console.log('Alternative avatar lookup succeeded:', directAvatar);
              // Update the cache with the avatar
              const cachedEns = this.getCachedEnsData(address);
              if (cachedEns) {
                this.cacheEnsData(address, { 
                  name: cachedEns.name, 
                  avatar: directAvatar 
                });
                
                console.log('Dispatching ensAvatarUpdated event for:', address);
                // Dispatch event to notify the UI of the avatar update
                window.dispatchEvent(new CustomEvent('ensAvatarUpdated', { 
                  detail: { address, avatar: directAvatar } 
                }));
              }
            }
          } catch (error) {
            console.warn('Async ENS avatar resolution error:', error);
          }
        }, 100);
      }
      
      // Return the name and avatar (if we got it synchronously)
      return { name, avatar: avatarResult };
    } catch (error) {
      console.warn('ENS resolution error:', error);
      return { name: null, avatar: null };
    }
  }
  
  /**
   * Cache management methods - optimized for performance
   */
  private getCachedEnsData(address: string): { name: string | null, avatar: string | null } | null {
    if (!address) return null;
    
    try {
      const cache = safeStorage.getItem(`${ENS_CACHE_KEY}-${address}`);
      if (!cache) return null;
      
      const { data, timestamp } = JSON.parse(cache);
      if (Date.now() - timestamp < ENS_CACHE_DURATION) {
        return data;
      }
    } catch (e) {
      console.warn('Failed to read ENS cache:', e);
    }
    return null;
  }
  
  private getCachedStats(address: string) {
    if (!address) return null;
    
    try {
      const cache = safeStorage.getItem(`${STATS_CACHE_KEY}-${address}`);
      if (!cache) return null;
      
      const { data, timestamp } = JSON.parse(cache);
      if (Date.now() - timestamp < STATS_CACHE_DURATION) {
        return data;
      }
    } catch (e) {
      console.warn('Failed to read stats cache:', e);
    }
    return null;
  }
  
  private getCachedLeaderboard() {
    try {
      const cache = safeStorage.getItem(LEADERBOARD_CACHE_KEY);
      if (!cache) return null;
      
      const { data, timestamp } = JSON.parse(cache);
      if (Date.now() - timestamp < LEADERBOARD_CACHE_DURATION) {
        return data;
      }
    } catch (e) {
      console.warn('Failed to read leaderboard cache:', e);
    }
    return null;
  }
  
  private cacheEnsData(address: string, data: { name: string | null, avatar: string | null }) {
    if (!address || !data) return;
    
    try {
      safeStorage.setItem(`${ENS_CACHE_KEY}-${address}`, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.warn('Failed to cache ENS data:', e);
    }
  }
  
  private cacheStats(address: string, data: any) {
    if (!address || !data) return;
    
    try {
      safeStorage.setItem(`${STATS_CACHE_KEY}-${address}`, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.warn('Failed to cache stats data:', e);
    }
  }
  
  private cacheLeaderboard(data: any[]) {
    if (!data || !Array.isArray(data)) return;
    
    try {
      safeStorage.setItem(LEADERBOARD_CACHE_KEY, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.warn('Failed to cache leaderboard data:', e);
    }
  }
  
  /**
   * Manually invalidate caches
   */
  invalidateCache(address: string) {
    try {
      if (address) {
        // Try to use safeStorage, but have a fallback to localStorage for compatibility
        try {
          safeStorage.setItem(`${ENS_CACHE_KEY}-${address}`, '');
          safeStorage.setItem(`${STATS_CACHE_KEY}-${address}`, '');
        } catch (e) {
          // If safeStorage fails, try direct localStorage as a fallback
          console.warn('Failed to invalidate cache with safeStorage:', e);
          try {
            if (typeof window !== 'undefined' && window.localStorage) {
              localStorage.removeItem(`${ENS_CACHE_KEY}-${address}`);
              localStorage.removeItem(`${STATS_CACHE_KEY}-${address}`);
            }
          } catch (e2) {
            console.warn('Failed to invalidate cache with localStorage:', e2);
          }
        }
      }
      
      // Same pattern for leaderboard cache
      try {
        safeStorage.setItem(LEADERBOARD_CACHE_KEY, '');
      } catch (e) {
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.removeItem(LEADERBOARD_CACHE_KEY);
          }
        } catch (e2) {
          console.warn('Failed to invalidate leaderboard cache:', e2);
        }
      }
      
      console.log('Cache invalidation completed');
    } catch (e) {
      console.warn('Failed to invalidate cache:', e);
    }
  }
}

export default WalletDataService;