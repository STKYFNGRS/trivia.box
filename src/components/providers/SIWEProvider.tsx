'use client';

import { ReactNode } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import the error handler with SSR disabled
const SIWEErrorHandler = dynamic(
  () => import('../auth/SIWEErrorHandler'),
  { ssr: false }
);

export default function SIWEProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <SIWEErrorHandler />
    </>
  );
}