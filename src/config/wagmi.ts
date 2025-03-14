import { base, mainnet } from 'viem/chains';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { http, fallback } from 'viem';
import { isMobileDevice } from '@/utils/deviceDetect';
import { createStorage } from '@wagmi/core';

export const projectId = process.env.NEXT_PUBLIC_PROJECT_ID;
if (!projectId) throw new Error('Project ID is not defined');

// Check if running on mobile
const isMobile = typeof window !== 'undefined' ? isMobileDevice() : false;

// Simplified RPC configuration - use only public nodes that support CORS
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
  http('https://rpc.mevblocker.io', { timeout: 15000 })
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

// Create wagmi adapter with simplified configuration
export const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks: [base, mainnet],
  transports: {
    [mainnet.id]: mainnetFallbackTransport,
    [base.id]: baseFallbackTransport
  },
  storage: wagmiStorage,
  // Enable the features needed for mobile
  enableInjected: true,
  enableMobileLinks: true,
  enablePersistence: true
});

// Export config for WagmiProvider
export const config = wagmiAdapter.wagmiConfig;

// Add persistence metadata to help with debugging
if (typeof window !== 'undefined') {
  try {
    window.localStorage.setItem('wagmi_mobile_optimized', isMobile ? 'true' : 'false');
    window.localStorage.setItem('wagmi_config_timestamp', Date.now().toString());
  } catch (e) {
    console.warn('Could not save wagmi config metadata', e);
  }
}