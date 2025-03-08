'use client';

import { useEffect } from 'react';
import { prefetchTopAddresses } from '@/lib/ens/prefetch';

interface EnsPrefetchProviderProps {
  children: React.ReactNode;
}

/**
 * Provider component that prefetches ENS data for top addresses on app start
 */
export default function EnsPrefetchProvider({ children }: EnsPrefetchProviderProps) {
  useEffect(() => {
    let mounted = true;
    
    // Define a function to load leaderboard and prefetch ENS data
    const prefetchEnsData = async () => {
      try {
        // First try to load the top addresses from the leaderboard API
        const response = await fetch('/api/scores/leaderboard', {
          cache: 'force-cache'
        });
        
        if (response.ok && mounted) {
          const data = await response.json();
          const topAddresses = data?.leaderboard?.map((entry: any) => entry.address) || [];
          
          if (topAddresses.length > 0) {
            // Prefetch ENS data for top addresses in background
            prefetchTopAddresses(topAddresses).catch(() => {
              // Silently fail prefetch - it's just an optimization
            });
          }
        }
      } catch (error) {
        // Silently fail - prefetching is just an optimization
      }
    };
    
    // Delay prefetch slightly to prioritize more critical resources
    const prefetchTimer = setTimeout(prefetchEnsData, 2000);
    
    return () => {
      mounted = false;
      clearTimeout(prefetchTimer);
    };
  }, []);
  
  // This component doesn't render anything itself
  return <>{children}</>;
}
