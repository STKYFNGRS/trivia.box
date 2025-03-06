// This file is a server component that imports client components
import { type ReactNode } from 'react';

// Import client components
import QueryProviders from '@/components/providers/QueryProviders';
import SWRProviders from '@/components/providers/SWRProviders';
import AchievementProvider from '@/components/providers/AchievementProvider';

/**
 * Root providers component that wraps the application.
 * This is a server component that delegates to client components for providers
 * that need to be client-side.
 */
export default function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryProviders>
      <SWRProviders>
        <AchievementProvider>
          {children}
        </AchievementProvider>
      </SWRProviders>
    </QueryProviders>
  );
}