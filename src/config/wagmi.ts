import { base, mainnet } from 'viem/chains';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { http, fallback } from 'viem';
import { isMobileDevice } from '@/utils/deviceDetect';
import { createStorage } from '@wagmi/core';

export const projectId = process.env.NEXT_PUBLIC_PROJECT_ID;
if (!projectId) throw new Error('Project ID is not defined');

// Check if running on mobile
const isMobile = typeof window !== 'undefined' ? isMobileDevice() : false;

// CORS-friendly public RPC endpoints
const mainnetTransport = http('https://ethereum.publicnode.com', {
  timeout: 15000, // Longer timeout for consistency
});

const baseTransport = http('https://base.publicnode.com', {
  timeout: 15000, // Longer timeout for consistency
});

// Fallback option for better reliability
const mainnetFallbackTransport = fallback([
  mainnetTransport,
  http('https://eth.meowrpc.com', { timeout: 15000 }),
  http('https://rpc.ankr.com/eth', { timeout: 15000 })
], {
  rank: true,
  retryCount: isMobile ? 3 : 2
});

const baseFallbackTransport = fallback([
  baseTransport,
  http('https://base.meowrpc.com', { timeout: 15000 }),
  http('https://1rpc.io/base', { timeout: 15000 })
], {
  rank: true,
  retryCount: isMobile ? 3 : 2
});

// Create storage with proper implementation
const wagmiStorage = createStorage({
  storage: typeof window !== 'undefined' ? window.localStorage : undefined,
});

// Create wagmi adapter with optimized configuration
export const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks: [base, mainnet],
  transports: {
    [mainnet.id]: mainnetFallbackTransport,
    [base.id]: baseFallbackTransport
  },
  storage: wagmiStorage
});

// Export config for WagmiProvider
export const config = wagmiAdapter.wagmiConfig;

// Add connection event handling to store wallet state
if (typeof window !== 'undefined') {
  try {
    // Listen for connection events from wagmi through window events
    window.addEventListener('connected', (event) => {
      try {
        // Get the wagmi state from storage
        const wagmiState = window.localStorage.getItem('wagmi.store');
        if (wagmiState) {
          const wagmiData = JSON.parse(wagmiState);
          const account = wagmiData?.state?.connections?.[0]?.accounts?.[0];
          const chainId = wagmiData?.state?.connections?.[0]?.chains?.[0]?.id;
          
          if (account) {
            import('@/utils/persistConnection').then(({ saveConnectionState }) => {
              saveConnectionState(account, chainId);
              console.log('[Wagmi] Connection state saved for:', account);
            }).catch(e => console.warn('[Wagmi] Error importing persistConnection:', e));
          }
        }
      } catch (e) {
        console.warn('[Wagmi] Error handling connection event:', e);
      }
    });
    
    // Add persistence metadata to help with debugging
    window.localStorage.setItem('wagmi_mobile_optimized', isMobile ? 'true' : 'false');
    window.localStorage.setItem('wagmi_config_timestamp', Date.now().toString());
  } catch (e) {
    console.warn('[Wagmi] Could not set up event listeners:', e);
  }
}
