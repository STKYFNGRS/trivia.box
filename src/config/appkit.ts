import { createAppKit } from '@reown/appkit';
import { DefaultSIWX, InformalMessenger, LocalStorage } from '@reown/appkit-siwx';
import { wagmiAdapter } from './wagmi';
import { base, mainnet } from '@reown/appkit/networks';
import { clearConnectionState } from '@/utils/persistConnection';

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
    
    // Create a cleaner, simpler message for SIWE
    const messenger = new InformalMessenger({
      // Just use the domain without www prefix
      domain: window.location.hostname.replace('www.', ''),
      // Full origin URL
      uri: window.location.origin,
      // Simplified statement that works better with wallets
      statement: "Sign to verify wallet ownership",
      // Simple nonce generation
      getNonce: async () => Math.floor(Math.random() * 10000000).toString()
    });
    
    // Explicitly specify our icons for better loading - order matters for wallet displays
    const icons = [
      `${window.location.origin}/android-chrome-192x192.png`,
      `${window.location.origin}/favicon-32x32.png`,
      `${window.location.origin}/favicon-16x16.png`,
      `${window.location.origin}/favicon.ico`
    ];
    
    // Force clean any existing connection state to prevent auto-connection
    try {
      clearConnectionState();
    } catch (err) {
      console.warn('[AppKit] Error clearing connection state:', err);
    }
    
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
        // Use a versioned storage key to avoid conflicts - use a new key to reset storage
        storage: new LocalStorage({ key: 'trivia-box-siwe-v4' })
      }),
      // Project ID from environment
      projectId: process.env.NEXT_PUBLIC_PROJECT_ID || '',
      // Dark theme for better UI
      themeMode: 'dark',
      // Use the predefined networks from AppKit
      networks: [base, mainnet]
    });

    // More comprehensive error handling and force clean state at startup
    try {
      // Attempt to disconnect any existing connection
      modal.disconnect().catch(e => console.warn('Initial disconnect error:', e));
    } catch (e) {
      console.warn('Cannot disconnect at init:', e);
    }
    
    window.addEventListener('unhandledrejection', (event) => {
      if (event.reason?.message && 
         (event.reason.message.includes('SIWE') || 
          event.reason.message.includes('sign') ||
          event.reason.message.includes('connect') ||
          event.reason.message.includes('wallet'))) {
        console.warn('[AppKit] Wallet connection error:', event.reason.message);
        
        // Attempt to stop any ongoing connection attempts
        try {
          modal.disconnect().catch(e => console.warn('Error during disconnect:', e));
        } catch (disconnectErr) {
          console.warn('Error attempting disconnect:', disconnectErr);
        }
      }
    });
    
    // Also listen for connection events to debug
    window.addEventListener('connect', (event) => {
      console.log('[AppKit] Connect event received:', event);
    });
    
    window.addEventListener('connected', (event) => {
      console.log('[AppKit] Connected event received:', event);
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