import { ethers } from 'ethers';
import { isMobileDevice } from '@/utils/deviceDetect';

// Configure providers with mobile-specific options
export const providerConfig = {
  // Get optimized provider with mobile fallbacks
  getProvider: async (provider: ethers.providers.ExternalProvider) => {
    // Use standard Web3Provider for all devices
    return new ethers.providers.Web3Provider(provider);
  },
  
  // Mobile-specific RPC configurations
  rpcConfig: {
    1: ['https://ethereum.publicnode.com', 'https://cloudflare-eth.com'],
    8453: ['https://base.publicnode.com', 'https://developer-access-mainnet.base.org'],
    10: ['https://optimism.publicnode.com', 'https://mainnet.optimism.io'],
    137: ['https://polygon.publicnode.com', 'https://polygon-rpc.com']
  },
  
  // Enhanced mobile configurations
  mobileConfig: {
    // Increase timeout for mobile devices
    timeoutDuration: 15000,
    
    // Attempt reconnection on visibility change
    reconnectOnVisibilityChange: true,
    
    // Cache connection state
    cachingEnabled: true,
    
    // Check if on mobile
    isMobile: typeof window !== 'undefined' && isMobileDevice()
  }
};

export default providerConfig;