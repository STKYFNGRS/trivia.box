'use client';

import dynamic from 'next/dynamic';

// Dynamically import the Web3Provider with no SSR
const Web3Provider = dynamic(
  () => import('@/components/Web3Provider').then(mod => mod.Web3Provider),
  { ssr: false }
);

// Dynamically import the ClientPage with no SSR
const ClientPage = dynamic(
  () => import('@/components/ClientPage'),
  { ssr: false }
);

export default function Home() {
  return (
    <Web3Provider>
      <ClientPage />
    </Web3Provider>
  );
}
