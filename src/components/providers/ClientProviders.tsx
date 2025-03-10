'use client';

import { type ReactNode } from 'react';
import QueryProviders from '@/components/providers/QueryProviders';
import SWRProviders from '@/components/providers/SWRProviders';
import AchievementProvider from '@/components/providers/AchievementProvider';
import EnsPrefetchProvider from '@/components/providers/EnsPrefetchProvider';
import SIWEProvider from '@/components/providers/SIWEProvider';

/**
 * ClientProviders component that wraps all client-side providers
 * This ensures that AppKit and other client-only libraries are properly initialized
 */
export default function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <QueryProviders>
      <SWRProviders>
        <AchievementProvider>
          <EnsPrefetchProvider>
            <SIWEProvider>
              {children}
            </SIWEProvider>
          </EnsPrefetchProvider>
        </AchievementProvider>
      </SWRProviders>
    </QueryProviders>
  );
}