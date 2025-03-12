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
    
    // Create a message for SIWE that exactly matches EIP-4361 standard for MetaMask compatibility
    const messenger = new InformalMessenger({
      // Domain without protocol or www prefix - critical for domain binding
      domain: window.location.hostname.replace('www.', ''),
      // Full origin as URI
      uri: window.location.origin,
      // Standardized simple statement as per EIP-4361
      statement: "Sign this message to verify you own this wallet",
      // Nonce generation - keep it simple
      getNonce: async () => Math.floor(Math.random() * 10000000).toString()
    });
    
    // Define icons with absolute URLs for better compatibility
    const icons = [
      `${window.location.origin}/metamask-icon.png`, // First icon is used by MetaMask
      `${window.location.origin}/favicon.ico`,
      `${window.location.origin}/android-chrome-192x192.png`,
      `${window.location.origin}/favicon-32x32.png`,
      `${window.location.origin}/favicon-16x16.png`
    ];
    
    // Create the AppKit with the documented SIWX configuration
    modal = createAppKit({
      adapters: [wagmiAdapter],
      metadata: {
        name: 'Trivia.Box',
        description: 'Test your knowledge & earn rewards',
        url: window.location.origin,
        icons: icons
      },
      // Use DefaultSIWX with minimal configuration as per docs
      siwx: new DefaultSIWX({
        messenger: messenger,
        storage: new LocalStorage({ key: 'trivia-box-siwe-v8' })
      }),
      projectId: process.env.NEXT_PUBLIC_PROJECT_ID || '',
      themeMode: 'dark',
      networks: [base, mainnet]
    });

    // Add error handling but don't disconnect on errors
    window.addEventListener('unhandledrejection', (event) => {
      if (event.reason?.message && 
         (event.reason.message.includes('SIWE') || 
          event.reason.message.includes('sign') ||
          event.reason.message.includes('connect') ||
          event.reason.message.includes('wallet'))) {
        console.warn('[AppKit] Wallet connection error:', event.reason.message);
        
        // Don't disconnect - just log the error
        // This helps maintain existing connections across refreshes
        console.log('[AppKit] Connection error detected, but maintaining state');
      }
    });

    // Add enhanced event listeners for connection state changes
    window.addEventListener('connect', (event) => {
      console.log('[AppKit] Connect event received:', event);
    });
    
    window.addEventListener('connected', (event) => {
      console.log('[AppKit] Connected event received:', event);
      // When connected, save to more persistent storage
      try {
        const wagmiState = window.localStorage.getItem('wagmi.store');
        const wagmiData = wagmiState ? JSON.parse(wagmiState) : null;
        const account = wagmiData?.state?.connections?.[0]?.accounts?.[0];
        const chainId = wagmiData?.state?.connections?.[0]?.chains?.[0]?.id;
        
        if (account) {
          // Import dynamically to avoid circular dependencies
          import('@/utils/persistConnection').then(({ saveConnectionState }) => {
            saveConnectionState(account, chainId || 8453);
            console.log('[AppKit] Connection state saved for:', account);
          }).catch(e => console.warn('[AppKit] Error importing persistConnection:', e));
        }
      } catch (e) {
        console.warn('[AppKit] Error saving connection state on connect:', e);
      }
    });
    
    // Save modal to window for easier debugging
    if (isDevelopment) {
      // Define a proper type for the debug property
      (window as Window & typeof globalThis & { __DEBUG_APPKIT_MODAL__: typeof modal }).
        __DEBUG_APPKIT_MODAL__ = modal;
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