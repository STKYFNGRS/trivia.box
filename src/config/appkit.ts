import { createAppKit } from '@reown/appkit';
import { DefaultSIWX } from '@reown/appkit-siwx';
import { wagmiAdapter } from './wagmi';
import { base, mainnet } from '@reown/appkit/networks';

/**
 * Create AppKit configuration optimized for production use
 */
let modal;

// Initialize AppKit only in browser environment
if (typeof window !== 'undefined') {
  try {
    // Determine if we're in development or production
    const isDevelopment = 
      window.location.hostname === 'localhost' || 
      window.location.hostname === '127.0.0.1';
    
    console.log(`[AppKit] Initializing in ${isDevelopment ? 'development' : 'production'} mode`);

    // Create a more production-optimized AppKit configuration
    modal = createAppKit({
      adapters: [wagmiAdapter],
      metadata: {
        name: 'Trivia.Box',
        description: 'Test your knowledge & earn rewards in this web3 trivia game',
        url: typeof window !== 'undefined' ? window.location.origin : 'https://trivia.box',
        icons: [`${window.location.origin}/android-chrome-192x192.png`]
      },
      // Only enable SIWX in production to avoid local development issues
      siwx: isDevelopment ? undefined : new DefaultSIWX(),
      // Project ID from environment
      projectId: process.env.NEXT_PUBLIC_PROJECT_ID || '',
      // Theme configuration
      themeMode: 'dark',
      // Use the predefined networks from AppKit
      networks: [base, mainnet]
    });

    console.log('[AppKit] Successfully initialized with networks:', [
      { name: base.name, id: base.id },
      { name: mainnet.name, id: mainnet.id }
    ]);
    
    // Add global error handler for debugging
    window.addEventListener('unhandledrejection', (event) => {
      if (event.reason?.message?.includes('SIWE') || event.reason?.message?.includes('CAIP')) {
        console.warn('[AppKit] SIWE error caught:', event.reason?.message);
        
        // In development mode, we expect these errors since SIWE is disabled
        if (isDevelopment) {
          console.info('[AppKit] SIWE errors in development are expected and can be ignored');
        }
      }
    });
    
  } catch (error) {
    console.error('[AppKit] Failed to initialize:', error);
    // Provide a placeholder object for SSR to prevent errors
    modal = { open: () => Promise.resolve() };
  }
} else {
  // Server-side placeholder
  modal = { open: () => Promise.resolve() };
}

export { modal };

// Export everything for use in components
export * from '@reown/appkit/react';