import { createAppKit } from '@reown/appkit';
import { DefaultSIWX, InformalMessenger, LocalStorage } from '@reown/appkit-siwx';
import { wagmiAdapter } from './wagmi';
import { base, mainnet } from '@reown/appkit/networks';
import { isMobileDevice } from '@/utils/deviceDetect';

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
    
    // Check if running on mobile
    const isMobile = isMobileDevice();
    
    // Set up device-specific storage key to avoid conflicts
    const storageKey = isMobile ? 'trivia-box-siwe-mobile-v1' : 'trivia-box-siwe-v8';
    
    // Log environment
    console.log(`[AppKit] Initializing in ${isDevelopment ? 'development' : 'production'} mode on ${isMobile ? 'mobile' : 'desktop'}`);
    
    // Define icons with absolute URLs for better compatibility
    const icons = [
      `${window.location.origin}/android-chrome-192x192.png`, // First icon is used by MetaMask
      `${window.location.origin}/favicon.ico`,
      `${window.location.origin}/favicon-32x32.png`,
      `${window.location.origin}/favicon-16x16.png`
    ];
    
    // Create a message for SIWE that exactly matches EIP-4361 standard for MetaMask compatibility
    const messenger = new InformalMessenger({
      // Domain without protocol or www prefix - critical for domain binding
      domain: window.location.hostname.replace('www.', ''),
      // Full origin as URI
      uri: window.location.origin,
      // Standardized simple statement as per EIP-4361
      statement: "Sign this message to verify you own this wallet",
      // Nonce generation - keep it simple
      getNonce: async () => Math.floor(Math.random() * 10000000).toString(),
      // Fixed expiration to be a number (seconds) rather than string
      // 7 days = 604800 seconds, 1 day = 86400 seconds
      expiration: isMobile ? 604800 : 86400,
      // Set resources as plain strings - this is supported by the API
      resources: icons
    });
    
    // Create standard storage with the proper key
    const storage = new LocalStorage({ key: storageKey });
    
    // Only add mobile-specific storage handling via side effects
    // We can't modify the storage interface directly due to type constraints
    if (isMobile && typeof window !== 'undefined') {
      // Listen for session storage events to create backups
      window.addEventListener('wallet_session_stored', (e: Event) => {
        try {
          if (e instanceof CustomEvent && e.detail) {
            const sessionData = e.detail;
            // Create backup in session storage
            const serialized = JSON.stringify(sessionData);
            sessionStorage.setItem(`mobile-backup-${storageKey}`, serialized);
            localStorage.setItem('mobile_wallet_session_backup', serialized);
            
            if (sessionData.address) {
              localStorage.setItem('mobile_wallet_address', sessionData.address);
              sessionStorage.setItem('mobile_wallet_address', sessionData.address);
              localStorage.setItem('mobile_wallet_timestamp', Date.now().toString());
              sessionStorage.setItem('mobile_wallet_timestamp', Date.now().toString());
            }
          }
        } catch (err) {
          console.warn('[AppKit] Error creating session backup:', err);
        }
      });
    }
    
    // Create the AppKit with the enhanced SIWX configuration
    modal = createAppKit({
      adapters: [wagmiAdapter],
      metadata: {
        name: 'Trivia.Box',
        description: 'Test your knowledge & earn rewards',
        url: window.location.origin,
        icons: icons
      },
      // Use DefaultSIWX with standard storage and configuration
      // Only use supported properties based on API documentation
      siwx: new DefaultSIWX({
        messenger: messenger,
        storage: storage,
        // Removed unsupported 'resources' property
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
            
            // For mobile, also set additional flags
            if (isMobile) {
              localStorage.setItem('mobile_last_connected', account);
              localStorage.setItem('mobile_last_connection_time', Date.now().toString());
              localStorage.setItem('prevent_disconnect', 'true');
              sessionStorage.setItem('prevent_disconnect', 'true');
              
              // Dispatch event to create backup in mobile storage
              window.dispatchEvent(new CustomEvent('wallet_session_stored', { 
                detail: { 
                  address: account,
                  chainId: chainId || 8453,
                  timestamp: Date.now(),
                  source: 'appkit-connected'
                }
              }));
            }
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