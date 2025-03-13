import { base, mainnet } from 'viem/chains';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { http, fallback } from 'viem';
import { isMobileDevice } from '@/utils/deviceDetect';
import { createStorage } from '@wagmi/core';

export const projectId = process.env.NEXT_PUBLIC_PROJECT_ID;
if (!projectId) throw new Error('Project ID is not defined');

// Check if running on mobile
const isMobile = typeof window !== 'undefined' ? isMobileDevice() : false;

// Use multiple reliable RPC providers for better ENS resolution
// Prioritize CORS-friendly endpoints for mobile
const mainnetRpcUrls = [
  'https://rpc.ankr.com/eth',
  'https://ethereum.publicnode.com',
  'https://eth.meowrpc.com',
  'https://rpc.mevblocker.io'
];

// Configure HTTP transports with optimized settings for mobile
const mainnetTransports = mainnetRpcUrls.map(url => 
  http(url, {
    timeout: isMobile ? 15000 : 10000, // Longer timeout for mobile
    fetchOptions: {
      cache: 'default',
      credentials: 'omit', // Avoid CORS issues with credentials
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      }
    }
  })
);

// Base chain RPC settings - use reliable endpoints
const baseRpcUrls = [
  'https://base.llamarpc.com',
  'https://1rpc.io/base',
  'https://base.meowrpc.com',
  'https://base.publicnode.com'
];

const baseTransports = baseRpcUrls.map(url => 
  http(url, {
    timeout: isMobile ? 15000 : 10000, // Longer timeout for mobile
    fetchOptions: {
      cache: 'default',
      credentials: 'omit',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      }
    }
  })
);

// Create storage that properly implements the Storage interface
const wagmiStorage = createStorage({
  storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  key: isMobile ? 'mobile_wagmi_persistence' : 'wagmi.store',
});

// Create wagmi adapter with enhanced ENS resolution configuration
export const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks: [base, mainnet],
  transports: {
    // Use fallback transport for better reliability
    [mainnet.id]: fallback(mainnetTransports, {
      rank: true,
      retryCount: isMobile ? 5 : 3, // More retries on mobile
      retryDelay: 1000 // 1 second delay between retries
    }),
    // Use fallback for base chain as well
    [base.id]: fallback(baseTransports, {
      rank: true,
      retryCount: isMobile ? 5 : 3,
      retryDelay: 1000
    })
  },
  // Use properly created storage
  storage: wagmiStorage
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