'use client';

import { type ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { fetcher } from '@/lib/fetcher';

/**
 * SWR providers component for data fetching
 * Uses the server-side fetcher function
 */
export default function SWRProviders({ children }: { children: ReactNode }) {
  return (
    <SWRConfig 
      value={{
        fetcher,
        revalidateOnFocus: false,
        dedupingInterval: 0, // Disable deduping to prevent caching
        shouldRetryOnError: false
      }}
    >
      {children}
    </SWRConfig>
  );
}
