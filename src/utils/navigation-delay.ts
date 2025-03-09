'use client';

/**
 * This utility helps delay navigation to ensure state persistence happens
 * before navigation on mobile devices. It's especially important for the flow
 * when a game completes and scores are submitted.
 */

import { isMobileDevice } from './deviceDetect';

/**
 * Initialize navigation delay interceptor
 * This should be called in a layout or client component that wraps the app
 */
export function initNavigationDelayInterceptor() {
  if (typeof window === 'undefined') return;
  
  // Only apply this on mobile devices
  if (!isMobileDevice()) {
    console.log('[Navigation] Not initializing delay interceptors on desktop');
    return;
  }
  
  console.log('[Navigation] Initializing mobile navigation delay interceptor');
  
  // Store original push state methods
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  
  // Define the interface for pending navigations
  interface PendingNavigation {
    fn: Function;
    args: any[];
    delay: number;
    timeoutId?: NodeJS.Timeout;
  }
  
  // Track pending navigation requests
  let pendingNavigations: PendingNavigation[] = [];
  
  // Flag to track if we're in a game completion flow
  let isInGameCompletionFlow = false;
  
  // Register listener for game completion
  window.addEventListener('gameCompleted', () => {
    console.log('[Navigation] Game completion detected, enabling navigation delay');
    // Set flag for 5 seconds after game completion
    isInGameCompletionFlow = true;
    setTimeout(() => {
      isInGameCompletionFlow = false;
    }, 5000);
  });
  
  // Listen for explicit delay requests
  window.addEventListener('delayNavigation', (event) => {
    const detail = (event as CustomEvent)?.detail;
    const delay = detail?.delay || 250;
    console.log(`[Navigation] Delay requested: ${delay}ms`);
    
    // Apply additional delay to any pending navigations
    pendingNavigations.forEach(pending => {
      if (pending.timeoutId) {
        clearTimeout(pending.timeoutId);
      }
      
      pending.delay = Math.max(pending.delay, delay);
      
      pending.timeoutId = setTimeout(() => {
        pending.fn.apply(history, pending.args);
        pendingNavigations = pendingNavigations.filter(p => p !== pending);
      }, pending.delay);
    });
  });
  
  // Override history.pushState
  history.pushState = function(...args) {
    // If we're in the game completion flow, delay navigation
    if (isInGameCompletionFlow) {
      console.log('[Navigation] Delaying pushState during game completion');
      const delay = 300; // 300ms delay to allow connection to be saved
      
      const pendingNav: PendingNavigation = {
        fn: originalPushState,
        args,
        delay
      };
      
      pendingNavigations.push(pendingNav);
      
      pendingNav.timeoutId = setTimeout(() => {
        originalPushState.apply(history, args);
        pendingNavigations = pendingNavigations.filter(p => p !== pendingNav);
      }, delay);
    } else {
      originalPushState.apply(this, args);
    }
  } as typeof history.pushState;
  
  // Override history.replaceState
  history.replaceState = function(...args) {
    // If we're in the game completion flow, delay navigation
    if (isInGameCompletionFlow) {
      console.log('[Navigation] Delaying replaceState during game completion');
      const delay = 300; // 300ms delay to allow connection to be saved
      
      const pendingNav: PendingNavigation = {
        fn: originalReplaceState,
        args,
        delay
      };
      
      pendingNavigations.push(pendingNav);
      
      pendingNav.timeoutId = setTimeout(() => {
        originalReplaceState.apply(history, args);
        pendingNavigations = pendingNavigations.filter(p => p !== pendingNav);
      }, delay);
    } else {
      originalReplaceState.apply(this, args);
    }
  } as typeof history.replaceState;
  
  console.log('[Navigation] Mobile navigation delay interceptor initialized');
}
