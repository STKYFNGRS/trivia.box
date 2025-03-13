import { ethers } from 'ethers';

/**
 * Enhanced provider wrapper for mobile compatibility
 * This utility helps with connection persistence and CORS issues on mobile devices
 */
export class MobileEnhancedProvider {
  private provider: ethers.providers.Web3Provider;
  private fallbackUrls: Record<string, string[]>;
  private visibilityChangeHandler: () => void;
  private networkChangeHandler: (chainId: string) => void;
  private accountsChangeHandler: (accounts: string[]) => void;
  private currentChainId: string | null = null;
  
  constructor(provider: ethers.providers.ExternalProvider) {
    this.provider = new ethers.providers.Web3Provider(provider);
    
    // Setup backup RPC endpoints for common networks
    this.fallbackUrls = {
      '0x1': [
        '/api/rpc-proxy', // Our proxy
        'https://mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161', // Public Infura
      ],
      '0x89': [
        '/api/rpc-proxy', // Our proxy
        'https://polygon-rpc.com',
      ],
      '0xa': [
        '/api/rpc-proxy', // Our proxy
        'https://optimism.llamarpc.com',
      ],
      // Add other network IDs as needed
    };
    
    // Initialize visibility change event handler for page refresh/visibility changes
    this.visibilityChangeHandler = this.handleVisibilityChange.bind(this);
    
    // Initialize event handlers for wallet events
    this.networkChangeHandler = this.handleNetworkChange.bind(this);
    this.accountsChangeHandler = this.handleAccountsChange.bind(this);
    
    // Register event handlers
    this.setupEventListeners();
    
    // Store connection info in sessionStorage for persistence
    this.saveConnectionState();
  }
  
  /**
   * Get the wrapped provider for use in the application
   */
  getProvider(): ethers.providers.Web3Provider {
    return this.provider;
  }
  
  /**
   * Setup event listeners for wallet state changes
   */
  private setupEventListeners(): void {
    // Add visibility change listener for page refresh handling
    document.addEventListener('visibilitychange', this.visibilityChangeHandler);
    
    // Add wallet event listeners
    if ((window as any).ethereum) {
      try {
        (window as any).ethereum.on('chainChanged', this.networkChangeHandler);
        (window as any).ethereum.on('accountsChanged', this.accountsChangeHandler);
      } catch (error) {
        console.warn('Failed to set up ethereum event listeners:', error);
      }
    }
  }
  
  /**
   * Clean up event listeners when no longer needed
   */
  public cleanup(): void {
    document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
    
    if ((window as any).ethereum) {
      try {
        (window as any).ethereum.removeListener('chainChanged', this.networkChangeHandler);
        (window as any).ethereum.removeListener('accountsChanged', this.accountsChangeHandler);
      } catch (error) {
        console.warn('Failed to clean up ethereum event listeners:', error);
      }
    }
  }
  
  /**
   * Handle page visibility change (e.g., when user switches tabs or minimizes browser)
   */
  private async handleVisibilityChange(): Promise<void> {
    if (document.visibilityState === 'visible') {
      // Try to restore connection
      await this.attemptReconnection();
    }
  }
  
  /**
   * Handle network changes
   */
  private handleNetworkChange(chainId: string): void {
    console.log('Network changed to:', chainId);
    this.currentChainId = chainId;
    
    // Save the new state
    this.saveConnectionState();
    
    // Force provider refresh on network change
    this.refreshProvider();
  }
  
  /**
   * Handle accounts changes
   */
  private handleAccountsChange(accounts: string[]): void {
    console.log('Accounts changed:', accounts);
    
    // If accounts is empty, the user disconnected their wallet
    if (accounts.length === 0) {
      this.clearConnectionState();
    } else {
      // Save the new state
      this.saveConnectionState();
    }
  }
  
  /**
   * Create a proxy provider that uses our RPC proxy to avoid CORS issues
   */
  private createProxyProvider(chainId: string): ethers.providers.JsonRpcProvider | null {
    if (!chainId) return null;
    
    // Choose which endpoint to proxy (eth for mainnet, base for Base, etc.)
    const networkMap: Record<string, string> = {
      '0x1': 'eth', // Ethereum Mainnet
      '0x2105': 'base', // Base Mainnet
      '0xa': 'optimism', // Optimism
      '0x89': 'polygon', // Polygon
      '0xa4b1': 'arbitrum', // Arbitrum
      '0xaa36a7': 'sepolia', // Sepolia testnet
    };
    
    const network = networkMap[chainId] || 'ethereum';
    
    try {
      // Custom JsonRpcProvider using our API proxy
      return new ethers.providers.JsonRpcProvider({
        url: '/api/rpc-proxy',
        // Define custom fetch method to use our proxy
        async fetch(url, payload) {
          const response = await fetch('/api/rpc-proxy', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              endpoint: network,
              payload: payload
            }),
          });
          return response.json();
        }
      });
    } catch (error) {
      console.error('Failed to create proxy provider:', error);
      return null;
    }
  }
  
  /**
   * Try to reconnect to the wallet after page refresh or visibility change
   */
  private async attemptReconnection(): Promise<boolean> {
    try {
      // Get saved connection state
      const savedState = this.getConnectionState();
      if (!savedState) return false;
      
      // Check if provider exists
      if (!(window as any).ethereum) {
        console.warn('Ethereum provider not found for reconnection');
        return false;
      }
      
      // Try to reconnect
      console.log('Attempting to reconnect wallet...');
      
      // Refresh the provider
      this.refreshProvider();
      
      // Re-request accounts to trigger connection
      try {
        const accounts = await this.provider.listAccounts();
        
        // If no accounts, try to request them
        if (accounts.length === 0) {
          await this.provider.send('eth_requestAccounts', []);
        }
        
        console.log('Wallet reconnection successful');
        return true;
      } catch (e) {
        console.warn('Could not auto-reconnect wallet:', e);
        return false;
      }
    } catch (error) {
      console.error('Reconnection attempt failed:', error);
      return false;
    }
  }
  
  /**
   * Refresh the provider (useful after network changes)
   */
  private refreshProvider(): void {
    try {
      // Reinitialize provider
      if ((window as any).ethereum) {
        // First get current chainId to check for proxy needs
        const chainId = (window as any).ethereum.chainId || this.currentChainId;
        
        // Try to create a proxy provider for mobile compatibility
        if (this.shouldUseProxy() && chainId) {
          const proxyProvider = this.createProxyProvider(chainId);
          if (proxyProvider) {
            // Use the proxy provider
            console.log('Using proxy provider for chain:', chainId);
            this.provider = proxyProvider as unknown as ethers.providers.Web3Provider;
            return;
          }
        }
        
        // Fallback to standard provider if proxy isn't needed or fails
        this.provider = new ethers.providers.Web3Provider((window as any).ethereum);
      }
    } catch (error) {
      console.error('Failed to refresh provider:', error);
    }
  }
  
  /**
   * Determine if we should use the proxy based on device and browser
   */
  private shouldUseProxy(): boolean {
    try {
      // Check if we're on a mobile device
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );
      
      // Check if we're using a browser known to have CORS issues
      const isMobileSafari = /iPhone|iPad|iPod/i.test(navigator.userAgent) && 
                           /WebKit/i.test(navigator.userAgent) &&
                           !(/Chrome/i.test(navigator.userAgent));
                           
      const isMobileChrome = /Android/i.test(navigator.userAgent) && 
                           /Chrome\/[0-9]/i.test(navigator.userAgent);
                           
      return isMobile && (isMobileSafari || isMobileChrome);
    } catch (error) {
      // If there's an error in detection, default to false
      console.warn('Error in proxy detection:', error);
      return false;
    }
  }
  
  /**
   * Save connection state for reconnection
   */
  private saveConnectionState(): void {
    try {
      const connectionState = {
        timestamp: Date.now(),
        chainId: this.currentChainId || (window as any)?.ethereum?.chainId || null
      };
      
      window.sessionStorage.setItem('walletConnectionState', JSON.stringify(connectionState));
    } catch (error) {
      console.warn('Failed to save connection state:', error);
    }
  }
  
  /**
   * Get connection state
   */
  private getConnectionState(): { timestamp: number, chainId: string | null } | null {
    try {
      const state = window.sessionStorage.getItem('walletConnectionState');
      if (!state) return null;
      
      return JSON.parse(state);
    } catch (error) {
      console.warn('Failed to read connection state:', error);
      return null;
    }
  }
  
  /**
   * Clear connection state
   */
  private clearConnectionState(): void {
    try {
      window.sessionStorage.removeItem('walletConnectionState');
    } catch (error) {
      console.warn('Failed to clear connection state:', error);
    }
  }
}

/**
 * Create a wallet provider that has enhanced mobile compatibility
 */
export async function createMobileCompatibleProvider(
  provider: ethers.providers.ExternalProvider
): Promise<ethers.providers.Web3Provider> {
  try {
    // Create enhanced wrapper
    const enhancedProvider = new MobileEnhancedProvider(provider);
    
    // Register cleanup on window unload
    window.addEventListener('beforeunload', () => {
      enhancedProvider.cleanup();
    });
    
    return enhancedProvider.getProvider();
  } catch (error) {
    console.error('Failed to create mobile compatible provider:', error);
    // Fallback to standard provider
    return new ethers.providers.Web3Provider(provider);
  }
}

/**
 * Detect if we're running on a mobile device
 */
export function isMobileDevice(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

/**
 * Register service worker for better mobile web app experience
 */
export function registerWalletServiceWorker(): void {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/wallet-connection-sw.js')
        .then(registration => {
          console.log('Wallet ServiceWorker registration successful', registration);
        })
        .catch(error => {
          console.log('Wallet ServiceWorker registration failed:', error);
        });
    });
  }
}
