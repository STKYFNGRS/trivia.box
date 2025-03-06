import { base, mainnet } from 'viem/chains';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { http, fallback } from 'viem';

export const projectId = process.env.NEXT_PUBLIC_PROJECT_ID;
if (!projectId) throw new Error('Project ID is not defined');

// Use multiple reliable RPC providers for better ENS resolution
const mainnetRpcUrls = [
  'https://rpc.ankr.com/eth',
  'https://eth.llamarpc.com',
  'https://ethereum.publicnode.com',
  'https://eth.meowrpc.com'
];

// Configure HTTP transports with timeout
const mainnetTransports = mainnetRpcUrls.map(url => 
  http(url, {
    timeout: 10000, // 10 seconds timeout
    fetchOptions: {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    }
  })
);

// Create wagmi adapter with enhanced ENS resolution configuration
export const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks: [base, mainnet],
  transports: {
    // Use fallback transport for better reliability
    [mainnet.id]: fallback(mainnetTransports, {
      rank: true,
      retryCount: 3
    }),
    // Keep base chain transport
    [base.id]: http()
  }
});

// Export config for WagmiProvider
export const config = wagmiAdapter.wagmiConfig;