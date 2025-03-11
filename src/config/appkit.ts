import { createAppKit } from '@reown/appkit';
import { DefaultSIWX, InformalMessenger, LocalStorage, EIP155Verifier } from '@reown/appkit-siwx';
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
    
    // Create a message for SIWE that exactly matches EIP-4361 standard for MetaMask compatibility
    const messenger = new InformalMessenger({
      // Domain without protocol or www prefix - critical for domain binding
      domain: window.location.hostname.replace('www.', ''),
      // Full origin as URI
      uri: window.location.origin,
      // Standardized simple statement as per EIP-4361
      statement: "Sign in with Ethereum to verify wallet ownership",
      // Nonce generation - keep it simple
      getNonce: async () => Math.floor(Math.random() * 10000000).toString()
    });
    
    // Define icons with proper full URLs (not relative paths)
    const icons = [
      `${window.location.origin}/android-chrome-192x192.png`,
      `${window.location.origin}/android-chrome-512x512.png`,
      `${window.location.origin}/favicon-32x32.png`,
      `${window.location.origin}/favicon-16x16.png`,
      `${window.location.origin}/favicon.ico`
    ];
    
    // Force clean existing connections for a fresh start
    try {
      clearConnectionState();
    } catch (err) {
      console.warn('[AppKit] Error clearing connection state:', err);
    }
    
    // Create the AppKit with the documented SIWX configuration
    modal = createAppKit({
      adapters: [wagmiAdapter],
      metadata: {
        name: 'Trivia.Box',
        description: 'Test your knowledge & earn rewards',
        url: window.location.origin,
        icons: icons
      },
      // Use DefaultSIWX with explicit Ethereum verifier for MetaMask compatibility
      siwx: new DefaultSIWX({
        messenger: messenger,
        // Explicitly include EIP155Verifier for Ethereum chains
        verifiers: [new EIP155Verifier()],
        // Use a fresh storage key
        storage: new LocalStorage({ key: 'trivia-box-siwe-v6' })
      }),
      projectId: process.env.NEXT_PUBLIC_PROJECT_ID || '',
      themeMode: 'dark',
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