'use client';

import { createWeb3Modal, defaultWagmiConfig } from '@web3modal/wagmi/react';
import { WagmiConfig } from "wagmi";
import { base, baseSepolia, mainnet } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

if (!process.env.NEXT_PUBLIC_PROJECT_ID) {
  throw new Error('NEXT_PUBLIC_PROJECT_ID is not defined');
}

const projectId = process.env.NEXT_PUBLIC_PROJECT_ID;

const metadata = {
  name: 'Trivia.Box',
  description: 'Play trivia games and earn rewards',
  url: 'https://trivia.box',
  icons: ['https://avatars.githubusercontent.com/u/37784886']
};

const chains = [baseSepolia, base, mainnet] as const;

const config = defaultWagmiConfig({
  chains,
  projectId,
  metadata,
  enableInjected: true,
  enableCoinbase: true,
  ssr: true
});

const modalConfig = {
  wagmiConfig: config,
  projectId,
  chains,
  defaultChain: baseSepolia,
  themeMode: 'dark' as const,
  themeVariables: {
    '--w3m-color-mix': '#6C5DD3',
    '--w3m-accent': '#6C5DD3',
    '--w3m-border-radius-master': '999px'
  },
  featuredWalletIds: [
    'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96', // MetaMask
    '4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0', // Coinbase Wallet
    'fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa'  // Phantom
  ]
};

createWeb3Modal(modalConfig);

const queryClient = new QueryClient();

export function Web3Provider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiConfig config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiConfig>
  );
}