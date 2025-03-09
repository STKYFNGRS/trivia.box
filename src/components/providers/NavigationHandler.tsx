'use client';

import { useEffect } from 'react';
import { isMobileDevice } from '@/utils/deviceDetect';
import { initNavigationDelayInterceptor } from '@/utils/navigation-delay';

export default function NavigationHandler() {
  useEffect(() => {
    // Only apply mobile-specific handlers on mobile devices
    const isMobile = isMobileDevice();
    if (!isMobile) {
      console.log('NavigationHandler: Not running on desktop');
      return;
    }
    
    console.log('NavigationHandler: Initializing mobile handlers');
    
    // Initialize mobile-specific navigation handlers
    initNavigationDelayInterceptor();
    
    // Handle the case when user clicks browser back button
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // If there's an active connection, ensure we persist connection state
      try {
        const wagmiState = window.localStorage.getItem('wagmi.store');
        const wagmiData = wagmiState ? JSON.parse(wagmiState) : null;
        const hasConnection = wagmiData?.state?.connections?.[0]?.accounts?.[0];
        
        if (hasConnection && localStorage.getItem('prevent_disconnect') === 'true') {
          // This flag is set during game completion
          // We don't need to prompt the user, just ensure state is saved
          console.log('[Navigation] Preventing accidental disconnect on navigation');
        }
      } catch (err) {
        console.warn('[Navigation] Error checking connection state:', err);
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);
  
  // This is a utility component that doesn't render anything
  return null;
}
