import { createAppKit } from '@reown/appkit';
import { DefaultSIWX, InformalMessenger, LocalStorage } from '@reown/appkit-siwx';
import { wagmiAdapter } from './wagmi';
import { base, mainnet } from '@reown/appkit/networks';

/**
 * Create AppKit configuration with improved SIWE settings
 */
let modal;

// Only initialize in browser environment
if (typeof window !== 'undefined') {
  try {
    // Determine if we're in development or production
    const isDevelopment = 
      window.location.hostname === 'localhost' || 
      window.location.hostname === '127.0.0.1';
    
    // Log environment
    console.log(`[AppKit] Initializing in ${isDevelopment ? 'development' : 'production'} mode`);
    
    // Create a cleaner, more professional message for SIWE
    const messenger = new InformalMessenger({
      // Just use the domain without www prefix
      domain: window.location.hostname.replace('www.', ''),
      // Full origin URL
      uri: window.location.origin,
      // Clear, professional statement
      statement: "Please sign this message to verify wallet ownership. This is a security measure and won't cost any gas.",
      // Simple nonce generation
      getNonce: async () => Math.floor(Math.random() * 10000000).toString()
    });
    
    // Explicitly specify our icons for better loading
    const icons = [
      `${window.location.origin}/favicon.ico`,
      `${window.location.origin}/favicon-16x16.png`,
      `${window.location.origin}/favicon-32x32.png`,
      `${window.location.origin}/android-chrome-192x192.png`,
      `${window.location.origin}/apple-touch-icon.png`
    ];
    
    // Create the AppKit with proper configuration
    modal = createAppKit({
      adapters: [wagmiAdapter],
      // Improved metadata for cleaner UI
      metadata: {
        name: 'Trivia.Box',
        description: 'Test your knowledge & earn rewards in this web3 trivia game',
        url: window.location.origin,
        icons: icons
      },
      // Use DefaultSIWX with minimal customization
      siwx: new DefaultSIWX({
        messenger: messenger,
        // Use a versioned storage key to avoid conflicts
        storage: new LocalStorage({ key: 'trivia-box-siwe-v3' })
      }),

      // Project ID from environment
      projectId: process.env.NEXT_PUBLIC_PROJECT_ID || '',
      // Dark theme for better UI
      themeMode: 'dark',
      // Use the predefined networks from AppKit
      networks: [base, mainnet]
    });

    // Log any SIWE-related errors for debugging
    window.addEventListener('unhandledrejection', (event) => {
      if (event.reason?.message && 
         (event.reason.message.includes('SIWE') || 
          event.reason.message.includes('sign'))) {
        console.warn('[AppKit] SIWE-related error:', event.reason.message);
      }
    });
    
    // Save modal to window for easier debugging
    if (isDevelopment) {
      (window as any).__DEBUG_APPKIT_MODAL__ = modal;
    }
    
    console.log('[AppKit] Successfully initialized with networks:', {
      base: { id: base.id, name: base.name },
      ethereum: { id: mainnet.id, name: mainnet.name }
    });
    
  } catch (error) {
    console.error('[AppKit] Initialization failed:', error);
    // Fallback for errors
    modal = { open: () => Promise.resolve() };
  }
} else {
  // Server-side fallback
  modal = { open: () => Promise.resolve() };
}

export { modal };

// Export everything for use in components
export * from '@reown/appkit/react';