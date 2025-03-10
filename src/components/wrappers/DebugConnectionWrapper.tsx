'use client';

import { useEffect, useState } from 'react';
import { useAppKitState } from '@reown/appkit/react';
import { useAccount } from 'wagmi';

export default function DebugConnectionWrapper() {
  const [debugInfo, setDebugInfo] = useState<any>({});
  const appKitState = useAppKitState();
  const { address, chainId, isConnected } = useAccount();

  // Collect debug info in an effect to avoid render issues
  useEffect(() => {
    const newDebugInfo = {
      appKitStatus: appKitState?.status,
      wagmiConnected: isConnected,
      address: address,
      chainId: chainId,
      timestamp: new Date().toISOString()
    };

    setDebugInfo(newDebugInfo);
    console.log('[Connection Debug]', newDebugInfo);
  }, [appKitState, isConnected, address, chainId]);

  // Add global error listener for SIWE errors
  useEffect(() => {
    const handleError = (event: any) => {
      if (
        event.reason && 
        typeof event.reason.message === 'string' && 
        (event.reason.message.includes('SIWE') || 
         event.reason.message.includes('sign') || 
         event.reason.message.includes('CAIP'))
      ) {
        console.error('[SIWE Debug] Error caught:', {
          message: event.reason.message,
          stack: event.reason.stack,
          chainId: chainId || 'unknown',
          state: {
            appKitStatus: appKitState?.status,
            wagmiConnected: isConnected,
            address: address
          }
        });
      }
    };

    window.addEventListener('unhandledrejection', handleError);
    return () => window.removeEventListener('unhandledrejection', handleError);
  }, [chainId, appKitState, isConnected, address]);

  // This component doesn't render anything visible
  return null;
}