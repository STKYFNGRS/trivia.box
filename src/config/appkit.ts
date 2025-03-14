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
    
    // Define icons with absolute URLs for better compatibility across all devices
    const icons = [
      `${window.location.origin}/android-chrome-192x192.png`, // First icon is used by MetaMask
      `${window.location.origin}/favicon.ico`,
      `${window.location.origin}/favicon-32x32.png`,
      `${window.location.origin}/favicon-16x16.png`
    ];
    
    // Mobile wallet configuration with both deep links and web links
    const mobileWallets = [
      {
        id: 'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96',
        name: 'MetaMask',
        links: {
          native: 'metamask://wc',
          universal: 'https://metamask.app.link/wc'
        }
      },
      {
        id: 'b021913ba555948a1c81eb3d89b372be46f8354e926679de648e4fa2938f05d0',
        name: 'Coinbase Wallet',
        links: {
          native: 'coinbasewallet://wc',
          universal: 'https://go.cb-w.com/wc'
        }
      },
      {
        id: '38f5d18bd8522c244bdd70cb4a68e0e718865155811c043f052fb9f1c51de662',
        name: 'Trust Wallet',
        links: {
          native: 'trust://wc',
          universal: 'https://link.trustwallet.com/wc'
        }
      },
      {
        id: '4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0',
        name: 'Rainbow',
        links: {
          native: 'rainbow://wc',
          universal: 'https://rnbwapp.com/wc'
        }
      }
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
      // Longer expiration time to avoid constant re-signing
      // 30 days = 2592000 seconds for both mobile and desktop
      // This helps maintain wallet state across sessions
      expiration: 2592000,
      // Set resources as plain strings - this is supported by the API
      resources: icons
    });
    
    // Create standard storage with the proper key
    const storage = new LocalStorage({ 
      key: storageKey
    });
    
    // Mobile options configuration
    const mobileOptions = isMobile ? {
      showQrModal: true,
      explorerExcludedWalletIds: [],
      explorerRecommendedWalletIds: [
        'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96', // MetaMask
        'b021913ba555948a1c81eb3d89b372be46f8354e926679de648e4fa2938f05d0', // Coinbase Wallet
        '38f5d18bd8522c244bdd70cb4a68e0e718865155811c043f052fb9f1c51de662', // Trust Wallet
        '4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0'  // Rainbow
      ],
      mobileWallets: mobileWallets,
      desktopWallets: [],
      modalOptions: {
        explorerRecommendedWalletIds: [
          'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96',
          'b021913ba555948a1c81eb3d89b372be46f8354e926679de648e4fa2938f05d0'
        ]
      }
    } : {};
    
    // Create the AppKit with the enhanced SIWX configuration
    modal = createAppKit({
      adapters: [wagmiAdapter],
      metadata: {
        name: 'Trivia.Box',
        description: 'Test your knowledge & earn rewards',
        url: window.location.origin,
        icons: icons
      },
      // Use DefaultSIWX with standard configuration
      siwx: new DefaultSIWX({
        messenger: messenger,
        storage: storage
      }),
      projectId: process.env.NEXT_PUBLIC_PROJECT_ID || '',
      themeMode: 'dark',
      networks: [base, mainnet],
      ...mobileOptions
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
    
    // Mobile-specific initialization for better persistence
    if (isMobile) {
      try {
        // Monitor page visibility for connection recovery
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            // Refresh connection when page becomes visible again
            console.log('[AppKit] Page became visible, refreshing connection state');
            
            // Check if we should restore connection
            import('@/utils/persistConnection').then(({ shouldRestoreConnection, getSavedConnectionDetails }) => {
              if (shouldRestoreConnection()) {
                const { address } = getSavedConnectionDetails();
                if (address) {
                  console.log('[AppKit] Restoring connection for address:', address);
                  // The adapter will handle reconnection during its autoConnect phase
                }
              }
            }).catch(e => console.warn('[AppKit] Error checking connection state:', e));
          }
        });
        
        // Add window unload handler to save state
        window.addEventListener('beforeunload', () => {
          try {
            const wagmiState = window.localStorage.getItem('wagmi.store');
            if (wagmiState) {
              // Save a backup
              window.localStorage.setItem('mobile_wagmi_persistence', wagmiState);
              console.log('[AppKit] Saved wagmi state backup before unload');
            }
          } catch (e) {
            console.warn('[AppKit] Error saving state backup:', e);
          }
        });
      } catch (mobileErr) {
        console.warn('[AppKit] Error setting up mobile-specific handlers:', mobileErr);
      }
    }
    
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