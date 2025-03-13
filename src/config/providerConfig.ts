import { createWeb3Provider } from '@/utils/mobileWalletHelper';
import { ethers } from 'ethers';

// Detect if we're on a mobile device
const isMobile = typeof navigator !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
  navigator.userAgent
);

// Configure providers with mobile-specific options
export const providerConfig = {
  // Get optimized provider with mobile fallbacks
  getProvider: async (provider: ethers.providers.ExternalProvider) => {
    if (isMobile) {
      // Use enhanced provider for mobile
      return createWeb3Provider(provider);
    } else {
      // Use standard provider for desktop
      return new ethers.providers.Web3Provider(provider);
    }
  },
  
  // Mobile-specific RPC configurations
  rpcConfig: {
    1: ['/api/rpc-proxy', 'https://mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161'],
    8453: ['/api/rpc-proxy', 'https://developer-access-mainnet.base.org'],
    10: ['/api/rpc-proxy', 'https://optimism.llamarpc.com'],
    137: ['/api/rpc-proxy', 'https://polygon-rpc.com']
  },
  
  // Enhanced mobile configurations
  mobileConfig: {
    // Increase timeout for mobile devices
    timeoutDuration: 15000,
    
    // Attempt reconnection on visibility change
    reconnectOnVisibilityChange: true,
    
    // Cache connection state
    cachingEnabled: true
  }
};

export default providerConfig;