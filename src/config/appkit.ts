import { createAppKit } from '@reown/appkit';
import { DefaultSIWX, InformalMessenger, LocalStorage, EIP155Verifier } from '@reown/appkit-siwx';
import { wagmiAdapter } from './wagmi';
import { base, mainnet } from 'viem/chains';

// Determine if we're running on localhost for proper domain handling
const isLocalhost = typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  
// Get current origin for proper SIWE domain configuration
const origin = typeof window !== 'undefined' ? window.location.origin : 'https://trivia.box';
const hostname = typeof window !== 'undefined' ? window.location.hostname : 'trivia.box';

// Adjust domains for localhost to avoid SIWE signature issues
const signingDomain = isLocalhost ? 'localhost' : hostname;
const signingUri = isLocalhost ? 'http://localhost:3000' : origin;

// Create a more specifically configured SIWx implementation
const siwxConfig = new DefaultSIWX({
  messenger: new InformalMessenger({
    domain: signingDomain,
    uri: signingUri,
    statement: "Sign this message to verify you own this wallet. This won't cost any gas.",
    // Add required getNonce function
    getNonce: async () => Math.round(Math.random() * 1000000).toString()
  }),
  // Explicitly specify the verifier for the EIP155 namespace (Ethereum)
  verifiers: [new EIP155Verifier()],
  storage: new LocalStorage({ key: 'trivia-box-auth-session' })
});

// Create AppKit modal with enhanced SIWx implementation
export const modal = createAppKit({
  adapters: [wagmiAdapter],
  metadata: {
    name: 'Trivia.Box',
    description: 'Test your knowledge & earn rewards in this web3 trivia game',
    url: origin,
    // Use a single PNG icon with absolute URL for better compatibility
    icons: [`${origin}/android-chrome-192x192.png`]
  },
  // Use our more specifically configured SIWx implementation
  siwx: siwxConfig,
  // Project ID from environment
  projectId: process.env.NEXT_PUBLIC_PROJECT_ID || '',
  // Theme configuration
  themeMode: 'dark',
  // Use complete network configuration objects to fix TypeScript errors
  networks: [
    {
      id: base.id,
      name: base.name,
      nativeCurrency: {
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18
      },
      rpcUrls: {
        default: {
          http: ['https://mainnet.base.org']
        }
      }
    },
    {
      id: mainnet.id,
      name: mainnet.name,
      nativeCurrency: {
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18
      },
      rpcUrls: {
        default: {
          http: ['https://ethereum.publicnode.com']
        }
      }
    }
  ]
});

// Export everything for use in components
export * from '@reown/appkit/react';