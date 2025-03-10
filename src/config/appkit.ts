import { createAppKit } from '@reown/appkit';
import { DefaultSIWX } from '@reown/appkit-siwx';
import { wagmiAdapter } from './wagmi';
import { base, mainnet } from '@reown/appkit/networks';

/**
 * Create a simpler AppKit configuration focused on basic functionality
 * Following the most basic documented pattern to minimize complexity
 */
let modal;

if (typeof window !== 'undefined') {
  try {
    // Use the simplest possible configuration with predefined networks
    modal = createAppKit({
      adapters: [wagmiAdapter],
      metadata: {
        name: 'Trivia.Box',
        description: 'Test your knowledge & earn rewards in this web3 trivia game',
        url: typeof window !== 'undefined' ? window.location.origin : 'https://trivia.box',
        icons: [`${window.location.origin}/android-chrome-192x192.png`]
      },
      networks: [base, mainnet],
      projectId: process.env.NEXT_PUBLIC_PROJECT_ID || '',
      themeMode: 'dark',
      // Use basic SIWX configuration with no customizations
      siwx: new DefaultSIWX()
    });

    console.log('[AppKit] Successfully initialized');
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

// Export AppKit React components
export * from '@reown/appkit/react';