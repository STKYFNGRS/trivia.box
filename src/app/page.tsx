'use client';

import dynamic from 'next/dynamic';

// Dynamically import the ClientPage with no SSR
const ClientPage = dynamic(
  () => import('@/components/ClientPage'),
  { ssr: false }
);

// Add direct styling to the page component for debugging
export default function Home() {
  return (
    <>
      <style jsx global>{`
        body {
          background-color: #000 !important;
          color: #fff !important;
        }
      `}</style>
      <ClientPage />
    </>
  );
}
