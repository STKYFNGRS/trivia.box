// This file is a server component that imports client components
import { type ReactNode } from 'react';
import dynamic from 'next/dynamic';

// Import the root client component that will be dynamically loaded with no SSR
const ClientProviders = dynamic(() => import('@/components/providers/ClientProviders'), {
  ssr: false
});

/**
 * Root providers component that wraps the application.
 * This is a server component that delegates to a client component which will only
 * be loaded on the client-side to prevent SSR AppKit initialization issues.
 */
export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ClientProviders>
      {children}
    </ClientProviders>
  );
}