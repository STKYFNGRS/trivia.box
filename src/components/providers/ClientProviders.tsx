'use client';

import { type ReactNode } from 'react';
import QueryProviders from '@/components/providers/QueryProviders';
import SWRProviders from '@/components/providers/SWRProviders';
import AchievementProvider from '@/components/providers/AchievementProvider';
import EnsPrefetchProvider from '@/components/providers/EnsPrefetchProvider';
import SIWEProvider from '@/components/providers/SIWEProvider';
import dynamic from 'next/dynamic';

// Import debug wrapper with SSR disabled
const DebugConnectionWrapper = dynamic(
  () => import('../wrappers/DebugConnectionWrapper'),
  { ssr: false }
);

/**
 * Client-side only providers component.
 * This component is loaded dynamically with ssr: false to ensure that all AppKit-related
 * initialization happens only on the client side, preventing SSR errors.
 */
export default function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <QueryProviders>
      <SWRProviders>
        <AchievementProvider>
          <EnsPrefetchProvider>
            <SIWEProvider>
              {/* Debug wrapper to help diagnose connection issues */}
              <DebugConnectionWrapper />
              {children}
            </SIWEProvider>
          </EnsPrefetchProvider>
        </AchievementProvider>
      </SWRProviders>
    </QueryProviders>
  );
}