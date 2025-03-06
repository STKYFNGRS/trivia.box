import { base } from '@reown/appkit/networks';
import { mainnet } from 'viem/chains';
import { createAppKit } from '@reown/appkit/react';
import { wagmiAdapter } from './wagmi';

const projectId = process.env.NEXT_PUBLIC_PROJECT_ID;
if (!projectId) throw new Error('Project ID is not defined');

export const metadata = {
  name: 'Trivia.Box',
  description: 'Play trivia games and earn rewards',
  url: 'https://trivia.box',
  icons: ['https://avatars.githubusercontent.com/u/37784886']
};

// Create AppKit instance using our configured adapter
export const modal = createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  metadata,
  networks: [
    {
      id: mainnet.id, // Put mainnet first for ENS resolution
      name: mainnet.name,
      nativeCurrency: mainnet.nativeCurrency,
      rpcUrls: mainnet.rpcUrls
    },
    {
      id: base.id,
      name: base.name,
      nativeCurrency: base.nativeCurrency,
      rpcUrls: base.rpcUrls
    }
  ],
  featuredWalletIds: [
    'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96', // MetaMask
    'fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa'  // Coinbase
  ]
});