'use client';

import { ReactNode, useEffect } from 'react';
import { useAppKitState } from '@reown/appkit/react';

// This component is always rendered only on the client side
// It safely encapsulates the AppKit hooks to prevent SSR issues

interface AppKitWrapperProps {
  children?: ReactNode;
  onStateChange?: (state: any) => void;
}

export default function AppKitWrapper({ children, onStateChange }: AppKitWrapperProps) {
  // Safely use the AppKit hook since this component is only rendered on the client
  const appkitState = useAppKitState();
  
  // Use useEffect to update parent state to avoid "setState during render" warnings
  useEffect(() => {
    if (onStateChange) {
      onStateChange(appkitState);
    }
  }, [appkitState, onStateChange]);
  
  return <>{children}</>;
}