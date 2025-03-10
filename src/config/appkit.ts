import { createAppKit } from '@reown/appkit';
import { DefaultSIWX, InformalMessenger, LocalStorage, EIP155Verifier } from '@reown/appkit-siwx';
import { wagmiAdapter } from './wagmi';
import { base, mainnet } from '@reown/appkit/networks';

/**
 * Create AppKit configuration with proper SIWE settings
 * Fixed for production SIWE verification
 */
let modal;

// Only initialize in browser environment
if (typeof window !== 'undefined') {
  try {
    // Determine if we're in development or production
    const isDevelopment = 
      window.location.hostname === 'localhost' || 
      window.location.hostname === '127.0.0.1';
    
    console.log(`[AppKit] Initializing in ${isDevelopment ? 'development' : 'production'} mode`);
    
    // Create proper messenger for SIWE with correct domain and statement
    const messenger = new InformalMessenger({
      // Use actual hostname, don't include http/https protocol
      domain: window.location.hostname,
      // Use full URL for URI
      uri: window.location.origin,
      // Clear statement that explains to users what they're signing
      statement: "Sign in to Trivia.Box to verify you own this wallet.",
      // Simple nonce generation
      getNonce: async () => Math.floor(Math.random() * 10000000).toString()
    });
    
    // Create proper verifier for Base mainnet
    const verifier = new EIP155Verifier();
    
    // Initialize AppKit with correct configuration - using predefined networks
    modal = createAppKit({
      adapters: [wagmiAdapter],
      metadata: {
        name: 'Trivia.Box',
        description: 'Test your knowledge & earn rewards in this web3 trivia game',
        url: window.location.origin,
        icons: [`${window.location.origin}/android-chrome-192x192.png`]
      },
      // Full SIWE configuration with proper components
      siwx: isDevelopment 
        ? undefined // Disable in development
        : new DefaultSIWX({
            messenger: messenger,
            verifiers: [verifier],
            storage: new LocalStorage({ key: 'trivia-box-auth-v1' })
          }),
      // Project ID from environment
      projectId: process.env.NEXT_PUBLIC_PROJECT_ID || '',
      // Theme configuration
      themeMode: 'dark',
      // Using predefined networks from appkit
      networks: [base, mainnet]
    });

    console.log('[AppKit] Successfully initialized with networks:', [
      { name: 'Base', id: 8453 }, 
      { name: 'Ethereum', id: 1 }
    ]);
    
    // Add debugging for SIWE errors
    if (!isDevelopment) {
      window.addEventListener('unhandledrejection', (event) => {
        if (event.reason?.message?.includes('SIWE') || 
            event.reason?.message?.includes('CAIP') ||
            event.reason?.message?.includes('verify')) {
          console.warn('[AppKit] SIWE error caught:', 
            event.reason?.message
          );
        }
      });
    }
    
  } catch (error) {
    console.error('[AppKit] Failed to initialize:', error);
    // Provide placeholder for errors
    modal = { open: () => Promise.resolve() };
  }
} else {
  // Server-side placeholder
  modal = { open: () => Promise.resolve() };
}

export { modal };

// Export everything for use in components
export * from '@reown/appkit/react';