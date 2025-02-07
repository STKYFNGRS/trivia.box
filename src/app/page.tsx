'use client';

import dynamic from 'next/dynamic';

// Dynamically import the ClientPage with no SSR
const ClientPage = dynamic(
  () => import('@/components/ClientPage'),
  { ssr: false }
);

export default function Home() {
  return <ClientPage />;
}
