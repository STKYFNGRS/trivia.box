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
    
    // Detect whether we're in development or production
    const isDevelopment = window.location.hostname === 'localhost' || 
                          window.location.hostname === '127.0.0.1';
    
    // Create a globally accessible ENV type for other components to reference
    (window as any).ENV_TYPE = isDevelopment ? 'development' : 'production';
    
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
            console.log(`Prefetching ENS data for ${topAddresses.length} addresses in ${isDevelopment ? 'development' : 'production'} mode`);
            // Prefetch ENS data for top addresses in background
            prefetchTopAddresses(topAddresses).catch((err) => {
              // Log prefetch errors in console but don't disrupt user experience
              console.warn('ENS prefetch error:', err);
            });
          }
        }
      } catch (error) {
        // Log but continue - prefetching is just an optimization
        console.warn('Leaderboard fetch error:', error);
      }
    };
    
    // Delay prefetch slightly to prioritize more critical resources
    // Use longer delay in production to ensure critical resources load first
    const prefetchTimer = setTimeout(prefetchEnsData, isDevelopment ? 2000 : 3500);
    
    return () => {
      mounted = false;
      clearTimeout(prefetchTimer);
    };
  }, []);
  
  // This component doesn't render anything itself
  return <>{children}</>;
}
